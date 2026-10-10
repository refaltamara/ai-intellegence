/**
 * The raw_files table (src/db/schema.ts): every listed raw file, and whether it is known to be in the private store.
 * `pnpm raw sync` writes here, including from Vercel's production build, so the outcome can be read from anywhere
 * that reads the database; loads point at these rows (DECISIONS, 10 Oct 2026, "Data architecture V1").
 */
import { sql } from "@/db/client";
import { keepUntil, type RawFile } from "./store";

export type StoredState = { blob_path: string; workspace_id: string; bytes: number; stored_at: string | null; store_error: string | null };

/** add listed files that are not known yet; a known file is never changed (a raw file never changes) */
export async function registerFiles(files: RawFile[]): Promise<void> {
  for (let i = 0; i < files.length; i += 50) {
    const part = files.slice(i, i + 50);
    const vals: unknown[] = [];
    const rows = part.map((f, j) => {
      vals.push(f.workspace, f.path, f.blob, f.bytes, f.sha256, f.received, keepUntil(f.received));
      const k = j * 7;
      return `($${k + 1}, $${k + 2}, $${k + 3}, $${k + 4}, $${k + 5}, $${k + 6}::date, $${k + 7}::date)`;
    });
    await sql.query(
      `insert into raw_files (workspace_id, path, blob_path, bytes, sha256, received, keep_until) values ${rows.join(", ")} on conflict (blob_path) do nothing`,
      vals,
    );
  }
}

export async function markStored(blobPath: string): Promise<void> {
  await sql.query(`update raw_files set stored_at = coalesce(stored_at, now()), store_error = null where blob_path = $1`, [blobPath]);
}

/** why files could not be stored; a file already stored keeps its stored_at */
export async function markFailed(blobPaths: string[], error: string): Promise<void> {
  await sql.query(`update raw_files set store_error = $2 where blob_path = any($1::text[]) and stored_at is null`, [blobPaths, error.slice(0, 300)]);
}

export async function storedState(): Promise<StoredState[]> {
  return (await sql.query(
    `select blob_path, workspace_id, bytes::float8 as bytes, stored_at::text, store_error from raw_files order by workspace_id, blob_path`,
  )) as StoredState[];
}
