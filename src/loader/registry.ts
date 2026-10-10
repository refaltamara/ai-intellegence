/**
 * Which raw files exist (raw_files; DECISIONS, 10 Oct 2026): the files that were in the repository (data/raw/MANIFEST.json,
 * registered by `pnpm raw`), and every file uploaded in the CMS since. Loads name their files by path or by place in the
 * store and are read through readRaw (src/raw/store.ts). The deployed app reads this table, never the manifest.
 */
import { sql } from "../db/client";
import { readStoredBytes } from "../onboard/storage";
import { keepUntil, readManifest, sha256, type RawFile } from "../raw/store";

type Row = { workspace_id: string; path: string; blob_path: string; bytes: number; sha256: string; received: string };
const asRaw = (r: Row): RawFile => ({ path: r.path, workspace: r.workspace_id, blob: r.blob_path, bytes: Number(r.bytes), sha256: r.sha256, received: String(r.received).slice(0, 10) });

/** raw files by their path or their place in the store, in the order asked; the manifest fills in when the database has none */
export async function rawFilesFor(keys: string[]): Promise<RawFile[]> {
  const rows = (await sql.query(
    `select workspace_id, path, blob_path, bytes::float8 as bytes, sha256, received::text from raw_files where path = any($1::text[]) or blob_path = any($1::text[])`,
    [keys],
  )) as Row[];
  const m = rows.length < keys.length ? await readManifest().catch(() => ({ note: "", files: [] as RawFile[] })) : null;
  return keys.map((k) => {
    const r = rows.find((x) => x.path === k || x.blob_path === k);
    if (r) return asRaw(r);
    const f = m?.files.find((x) => x.path === k || x.blob === k);
    if (f) return f;
    throw new Error(`${k} is not a known raw file`);
  });
}

/** a workspace's raw files, newest first */
export async function workspaceRawFiles(ws: string): Promise<(RawFile & { stored: boolean })[]> {
  const rows = (await sql.query(
    `select workspace_id, path, blob_path, bytes::float8 as bytes, sha256, received::text, stored_at is not null as stored from raw_files where workspace_id = $1 order by received desc, path`,
    [ws],
  )) as (Row & { stored: boolean })[];
  return rows.map((r) => ({ ...asRaw(r), stored: r.stored }));
}

/**
 * A file uploaded in the CMS becomes a raw file: it is kept where it was uploaded (private Blob, or the onboarding folder on
 * a laptop), read once to take its hash, and kept 12 months like any other.
 */
export async function registerUpload(ws: string, name: string, url: string): Promise<RawFile> {
  const bytes = await readStoredBytes(url);
  const f: RawFile = { path: `${ws}/${name}`, workspace: ws, blob: url, bytes: bytes.length, sha256: sha256(bytes), received: new Date().toISOString().slice(0, 10) };
  await sql.query(
    `insert into raw_files (workspace_id, path, blob_path, bytes, sha256, received, keep_until, stored_at)
     values ($1, $2, $3, $4, $5, $6::date, $7::date, case when $3 like 'file://%' then null else now() end)
     on conflict (blob_path) do update set bytes = excluded.bytes, sha256 = excluded.sha256`,
    [ws, f.path, f.blob, f.bytes, f.sha256, f.received, keepUntil(f.received)],
  );
  return f;
}
