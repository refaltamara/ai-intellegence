/**
 * Raw files (DECISIONS, 10 Oct 2026, "Data architecture V1"): every file a source sends is kept exactly as
 * received in private Vercel Blob under raw/<workspace>/<file>, never in the repository, for 12 months.
 * data/raw/MANIFEST.json lists each one with its size and hash, so a load can say which file it read and any
 * copy can be checked. On a laptop or in a sandbox the same files sit under data/raw/ (gitignored) and
 * `pnpm raw pull` fetches them; a file is read from there when its hash matches, else from the store.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const RAW_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "data/raw");
export const MANIFEST_PATH = path.join(RAW_DIR, "MANIFEST.json");
/** how long a raw file is kept (DECISIONS, 10 Oct 2026) */
export const RETENTION_MONTHS = 12;
/** files in data/raw that are notes, not data: they stay in the repository */
export const NOT_RAW = new Set(["README.md", "MANIFEST.json"]);
/** folders under data/raw that predate the rule "one folder per workspace" */
const FOLDER_WORKSPACE: Record<string, string> = { "": "beauty-id", kahf: "kahf-threads", maudy: "maudy-ayunda" };

export type RawFile = {
  /** where the file sits under data/raw, e.g. "kahf/comments_threads_1007a.csv" */
  path: string;
  workspace: string;
  /** its pathname in the private store, e.g. "raw/kahf-threads/comments_threads_1007a.csv" */
  blob: string;
  bytes: number;
  sha256: string;
  /** the day it reached us (YYYY-MM-DD); kept until RETENTION_MONTHS after it */
  received: string;
};
export type Manifest = { note: string; files: RawFile[] };

export const MANIFEST_NOTE =
  "Raw files as received, kept in private Vercel Blob (DECISIONS, 10 Oct 2026). Not in the repository: `pnpm raw pull <workspace>` fetches them into data/raw/. A raw file never changes; a corrected file is a new file.";

/** the workspace a file under data/raw belongs to: its folder, or the beauty panel for the files at the top */
export function workspaceOf(rel: string): string {
  const dir = path.posix.dirname(rel.split(path.sep).join("/"));
  const top = dir === "." ? "" : dir.split("/")[0];
  return FOLDER_WORKSPACE[top] ?? top;
}

/** a file's pathname in the store: raw/<workspace>/<the rest of its path inside its folder> */
export function blobPathOf(rel: string): string {
  const parts = rel.split(path.sep).join("/").split("/");
  const inside = parts.length > 1 ? parts.slice(1).join("/") : parts[0];
  return `raw/${workspaceOf(rel)}/${inside}`;
}

export function contentTypeOf(name: string): string {
  if (name.endsWith(".gz")) return "application/gzip";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

/** the last day a file may be kept: received + RETENTION_MONTHS */
export function keepUntil(received: string): string {
  const d = new Date(`${received}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + RETENTION_MONTHS);
  return d.toISOString().slice(0, 10);
}

/** files past their keep-until day on `today` (YYYY-MM-DD) */
export function expired(m: Manifest, today: string): RawFile[] {
  return m.files.filter((f) => keepUntil(f.received) < today);
}

export const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

export async function readManifest(): Promise<Manifest> {
  if (!existsSync(MANIFEST_PATH)) return { note: MANIFEST_NOTE, files: [] };
  return JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest;
}

export async function writeManifest(m: Manifest): Promise<void> {
  const files = [...m.files].sort((a, b) => a.workspace.localeCompare(b.workspace) || a.path.localeCompare(b.path));
  await writeFile(MANIFEST_PATH, JSON.stringify({ note: MANIFEST_NOTE, files }, null, 2) + "\n");
}

/** a local copy whose hash matches the manifest, or null */
export async function localCopy(f: RawFile): Promise<Buffer | null> {
  const p = path.join(RAW_DIR, f.path);
  if (!existsSync(p)) return null;
  const b = await readFile(p);
  return sha256(b) === f.sha256 ? b : null;
}

// ------------------------------------------------------------------ the store
/** the private store is reachable: a read-write token, or Vercel's OIDC token with the store's id */
export const storeOn = () => !!process.env.BLOB_READ_WRITE_TOKEN || (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN);

/** the stored file's size, or null when nothing sits at that pathname */
export async function storedSize(pathname: string): Promise<number | null> {
  const { head, BlobNotFoundError } = await import("@vercel/blob");
  try {
    return (await head(pathname)).size;
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
}

/** keep a file in the store; never overwrites (a raw file never changes) */
export async function store(f: RawFile, body: Buffer): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(f.blob, body, { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: contentTypeOf(f.path), multipart: body.length > 8 * 1024 ** 2 });
}

/** the stored file's bytes, checked against its hash */
export async function fetchStored(f: RawFile): Promise<Buffer> {
  const { get } = await import("@vercel/blob");
  const r = await get(f.blob, { access: "private", useCache: false });
  if (!r || !r.stream) throw new Error(`${f.blob} is not in the store.`);
  const b = Buffer.from(await new Response(r.stream).arrayBuffer());
  if (sha256(b) !== f.sha256) throw new Error(`${f.blob} does not match its hash in the manifest.`);
  return b;
}

/** a raw file's bytes: the local copy when it matches, else the store (loaders read through this) */
export async function readRaw(f: RawFile): Promise<Buffer> {
  if (/^(file|https?):\/\//.test(f.blob)) {
    // a file uploaded in the CMS: kept where it was uploaded (private Blob, or the onboarding folder)
    const { readStoredBytes } = await import("../onboard/storage");
    const b = await readStoredBytes(f.blob);
    if (sha256(b) !== f.sha256) throw new Error(`${f.path} does not match its hash: it changed after it was received.`);
    return b;
  }
  const local = await localCopy(f);
  if (local) return local;
  if (!storeOn()) throw new Error(`${f.path} is not here and the store is not configured: run \`pnpm raw pull ${f.workspace}\` with BLOB_READ_WRITE_TOKEN set.`);
  return fetchStored(f);
}

/** write a fetched file into data/raw */
export async function saveLocalCopy(f: RawFile, b: Buffer): Promise<void> {
  const p = path.join(RAW_DIR, f.path);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, b);
}
