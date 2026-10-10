/**
 * Where a dump's files are kept while a workspace is onboarded (CMS plan, "Jobs without
 * pg-boss": "the CMS stores the dump in Vercel Blob"). With BLOB_READ_WRITE_TOKEN set the
 * browser uploads straight to private Vercel Blob (no request size limit); without it
 * (local runs, the CLI) files go to a folder on disk (ONBOARD_DIR). Either way a file is a
 * URL the loader reads back whole.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const blobOn = () => !!process.env.BLOB_READ_WRITE_TOKEN;
// the onboarding folder is outside the app: never traced into the deployment (turbopackIgnore)
const localDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.ONBOARD_DIR || path.join(os.tmpdir(), "fi-onboard"));

/** the dump's tables, by the prefix of their file names (`<table>_<stamp>.csv`) */
export const DUMP_TABLES = ["_content_", "_comment_", "comment_sentiment", "brand", "creator", "content_hashtag", "content_metric_snapshot", "topic", "content_tagged_user"] as const;
export type DumpTable = (typeof DUMP_TABLES)[number];
/** files in a dump that are known and left out on purpose (CMS plan: rolled up from comments, or not used) */
export const DUMP_IGNORED = ["content_sentiment_daily", "content_media", "content_audio", "topic_theme_map"];

/** which table a file name holds, or null (longest prefix wins: _comment_ before comment_sentiment) */
export function tableOf(name: string): string | null {
  const base = path.basename(name).toLowerCase();
  const m = /^(.*)_\d{6,}\.csv$/.exec(base);
  if (!m) return null;
  return m[1];
}

/** a stored file's place: a local path (file://) or a private blob URL */
export async function saveLocal(ws: string, name: string, data: Uint8Array | string): Promise<{ url: string; size: number }> {
  const dir = path.join(/*turbopackIgnore: true*/ localDir(), ws);
  await mkdir(dir, { recursive: true });
  const p = path.join(/*turbopackIgnore: true*/ dir, path.basename(name));
  await writeFile(p, data);
  return { url: `file://${p}`, size: (await stat(p)).size };
}

/** The whole file as bytes (a raw file is hashed as it was received). Local files must sit under ONBOARD_DIR. */
export async function readStoredBytes(url: string): Promise<Buffer> {
  if (url.startsWith("file://")) {
    const p = path.resolve(/*turbopackIgnore: true*/ url.slice("file://".length));
    if (!p.startsWith(localDir() + path.sep)) throw new Error("That file is outside the onboarding folder.");
    return readFile(p);
  }
  const { get } = await import("@vercel/blob");
  const r = await get(url, { access: "private", useCache: false });
  if (!r || !r.stream) throw new Error("The stored file is gone; upload it again.");
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

/** The whole file as text. Local files must sit under ONBOARD_DIR; blobs are read with the store's token. */
export async function readStored(url: string): Promise<string> {
  if (url.startsWith("file://")) {
    const p = path.resolve(/*turbopackIgnore: true*/ url.slice("file://".length));
    if (!p.startsWith(localDir() + path.sep)) throw new Error("That file is outside the onboarding folder.");
    return readFile(p, "utf8");
  }
  const { get } = await import("@vercel/blob");
  const r = await get(url, { access: "private", useCache: false });
  if (!r) throw new Error("The stored file is gone; upload it again.");
  return new Response(r.stream).text();
}
