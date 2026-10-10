/**
 * Loads start by themselves when the scraper delivers (DECISIONS, 10 Oct 2026: a new workspace's first load in the CMS,
 * after that automatic). A delivery lands in the private store under inbox/<workspace>/; a Fair Listening dump is loaded
 * once every table of one stamp has arrived (<table>_<stamp>.csv). The delivered files are the raw files: registered,
 * hashed, kept 12 months where they landed, never copied or deleted. Live listening workspaces only; nothing happens
 * until the store is connected.
 */
import { sql } from "../db/client";
import { storeOn } from "../raw/store";
import { DUMP_TABLES, tableOf } from "../onboard/storage";
import { enqueueJob } from "../extensions/store";
import { registerUpload } from "./registry";

export type Delivered = { url: string; pathname: string; size: number };

/** a delivery's files grouped by dump stamp, complete stamps only, oldest first */
export function completeDumps(files: Delivered[]): { stamp: string; files: Delivered[] }[] {
  const byStamp = new Map<string, Delivered[]>();
  for (const f of files) {
    const m = /_(\d{6,})\.csv$/i.exec(f.pathname);
    if (!m || !tableOf(f.pathname)) continue;
    byStamp.set(m[1], [...(byStamp.get(m[1]) ?? []), f]);
  }
  return [...byStamp].filter(([, fs]) => DUMP_TABLES.every((t) => fs.some((f) => tableOf(f.pathname) === t))).sort(([a], [b]) => (a < b ? -1 : 1)).map(([stamp, fs]) => ({ stamp, files: fs }));
}

/** look in every live listening workspace's inbox; register new complete dumps and queue their loads */
export async function intake(): Promise<{ workspace: string; stamp: string; job: string }[]> {
  if (!storeOn()) return [];
  const { list } = await import("@vercel/blob");
  const wss = (await sql.query(
    `select w.id from workspaces w join data_sources s on s.workspace_id = w.id where w.status = 'live' and s.kind = 'listening_dump'`,
  )) as { id: string }[];
  const out: { workspace: string; stamp: string; job: string }[] = [];
  for (const { id: ws } of wss) {
    const files: Delivered[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `inbox/${ws}/`, cursor, limit: 1000 });
      files.push(...page.blobs.map((b) => ({ url: b.url, pathname: b.pathname, size: b.size })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (!files.length) continue;
    const known = new Set(((await sql.query(`select blob_path from raw_files where workspace_id = $1 and blob_path = any($2::text[])`, [ws, files.map((f) => f.url)])) as { blob_path: string }[]).map((r) => r.blob_path));
    for (const dump of completeDumps(files.filter((f) => !known.has(f.url)))) {
      const raws = [];
      for (const f of dump.files) raws.push(await registerUpload(ws, f.pathname.split("/").pop()!, f.url));
      const job = await enqueueJob(ws, "load", { source: "listening", files: raws.map((r) => r.blob), promote: "auto", started_by: "scraper delivery" }, "intake");
      out.push({ workspace: ws, stamp: dump.stamp, job });
    }
  }
  return out;
}
