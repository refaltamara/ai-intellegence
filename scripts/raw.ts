/**
 * Raw files (src/raw/store.ts; DECISIONS, 10 Oct 2026): kept in private Vercel Blob, listed in data/raw/MANIFEST.json.
 *   pnpm raw manifest                 add the files under data/raw to the manifest (size, hash, the day they arrived)
 *   pnpm raw sync                     put every listed file that is here into the store, if it is not there yet
 *   pnpm raw pull [workspace|path]    fetch listed files into data/raw (checked against their hash)
 *   pnpm raw check                    each file: here, in the store, and what raw_files says
 *   pnpm raw expired                  files past their 12 months
 * The store needs BLOB_READ_WRITE_TOKEN (`vercel env pull`). `sync --build` runs in Vercel's production build, where
 * the store's token already is. It never fails the build: each file's outcome (stored, or why not) goes to the
 * raw_files table (src/raw/files.ts), which anyone with the database can read; a file not stored stays where it was.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  blobPathOf, expired, fetchStored, keepUntil, localCopy, NOT_RAW, RAW_DIR, readManifest, saveLocalCopy, sha256,
  store, storedSize, storeOn, workspaceOf, writeManifest, type RawFile,
} from "../src/raw/store";

function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    const r = rel ? `${rel}/${n}` : n;
    if (statSync(p).isDirectory()) out.push(...walk(p, r));
    else if (!(rel === "" && NOT_RAW.has(n)) && !n.startsWith(".")) out.push(r);
  }
  return out;
}

/** the day git first saw the file, else today */
function firstSeen(rel: string): string {
  try {
    const days = execFileSync("git", ["log", "--diff-filter=A", "--format=%cs", "--", path.join("data/raw", rel)], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    if (days.length) return days[days.length - 1];
  } catch { /* not a git checkout */ }
  return new Date().toISOString().slice(0, 10);
}

async function manifest() {
  const m = await readManifest();
  const byPath = new Map(m.files.map((f) => [f.path, f]));
  let added = 0;
  for (const rel of walk(RAW_DIR)) {
    const b = await readFile(path.join(RAW_DIR, rel));
    const known = byPath.get(rel);
    if (known) {
      if (known.sha256 !== sha256(b)) throw new Error(`${rel} changed since it was listed. A raw file never changes: give a corrected file a new name.`);
      continue;
    }
    const f: RawFile = { path: rel, workspace: workspaceOf(rel), blob: blobPathOf(rel), bytes: b.length, sha256: sha256(b), received: firstSeen(rel) };
    m.files.push(f);
    byPath.set(rel, f);
    added++;
  }
  await writeManifest(m);
  console.log(`manifest: ${m.files.length} files (${added} added)`);
}

async function sync(build: boolean) {
  if (build && process.env.VERCEL_ENV !== "production") return console.log("raw sync: not a production build, nothing to do");
  const m = await readManifest();
  const here: { f: RawFile; b: Buffer }[] = [];
  for (const f of m.files) {
    const b = await localCopy(f);
    if (b) here.push({ f, b });
  }
  if (!here.length) return console.log("raw sync: no listed raw file is here, nothing to do");
  // the outcome goes to raw_files when the database is reachable; writing it never stops the sync
  const files = process.env.DATABASE_URL ? await import("../src/raw/files") : null;
  // where and when an outcome was written, so a failure reads as "the production build, at 03:40", not just "failed"
  const where = `[${process.env.VERCEL ? `vercel ${process.env.VERCEL_ENV} build` : "local"} ${new Date().toISOString().slice(0, 16)}Z]`;
  const record = async (what: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { console.error(`raw sync: could not record ${what} in raw_files: ${(e as Error).message}`); }
  };
  if (files) await record("the files", () => files.registerFiles(m.files));
  if (!storeOn()) {
    const why = "No Blob store in this environment: BLOB_READ_WRITE_TOKEN is not set.";
    if (files) await record("the outcome", () => files.markFailed(here.map((x) => x.f.blob), `${where} ${why}`));
    if (build) return console.log(`raw sync: ${why} Nothing stored; the files stay where they are.`);
    throw new Error(`raw sync: ${why} (\`vercel env pull\`)`);
  }
  let put = 0, there = 0;
  const failed: string[] = [];
  for (const { f, b } of here) {
    try {
      const size = await storedSize(f.blob);
      if (size !== null && size !== f.bytes) throw new Error(`a different file (${size} bytes) already sits at ${f.blob}`);
      if (size === null) {
        await store(f, b);
        if ((await storedSize(f.blob)) !== f.bytes) throw new Error(`${f.blob} did not arrive whole`);
        put++;
      } else there++;
      if (files) await record(f.blob, () => files.markStored(f.blob));
    } catch (e) {
      const msg = `${(e as Error).name}: ${(e as Error).message}`;
      failed.push(`${f.path}: ${msg}`);
      if (files) await record(f.blob, () => files.markFailed([f.blob], `${where} ${msg}`));
    }
  }
  console.log(`raw sync: ${put} stored, ${there} already there, ${failed.length} failed, of ${here.length} files here (${m.files.length} listed)`);
  for (const x of failed) console.error(`  ${x}`);
  if (failed.length && !build) process.exitCode = 1;
}

async function pull(which?: string) {
  if (!storeOn()) throw new Error("pnpm raw pull needs the store's token: BLOB_READ_WRITE_TOKEN (`vercel env pull`).");
  const m = await readManifest();
  const pick = m.files.filter((f) => !which || f.workspace === which || f.path.startsWith(which));
  let got = 0;
  for (const f of pick) {
    if (await localCopy(f)) continue;
    await saveLocalCopy(f, await fetchStored(f));
    got++;
  }
  console.log(`raw pull: ${got} fetched, ${pick.length - got} already here`);
}

async function check() {
  const m = await readManifest();
  const on = storeOn();
  let missingHere = 0, missingThere = 0;
  for (const f of m.files) {
    const here = !!(await localCopy(f));
    const there = on ? (await storedSize(f.blob)) === f.bytes : null;
    if (!here) missingHere++;
    if (there === false) missingThere++;
    console.log(`${here ? "here" : "    "}  ${there === null ? "?    " : there ? "store" : "     "}  ${f.path}`);
  }
  console.log(`${m.files.length} listed; ${missingHere} not here; ${on ? `${missingThere} not in the store` : "store not checked (no token)"}`);
  if (!process.env.DATABASE_URL) return;
  const { storedState } = await import("../src/raw/files");
  const rows = await storedState();
  const errors = [...new Set(rows.filter((r) => !r.stored_at && r.store_error).map((r) => r.store_error))];
  console.log(`raw_files: ${rows.length} known, ${rows.filter((r) => r.stored_at).length} stored${errors.length ? `; not stored because: ${errors.join(" | ")}` : ""}`);
}

async function main() {
  const [, , cmd, a] = process.argv;
  if (cmd === "manifest") return manifest();
  if (cmd === "sync") return sync(process.argv.includes("--build"));
  if (cmd === "pull") return pull(a);
  if (cmd === "check") return check();
  if (cmd === "expired") {
    const today = new Date().toISOString().slice(0, 10);
    const old = expired(await readManifest(), today);
    for (const f of old) console.log(`${keepUntil(f.received)}  ${f.blob}`);
    return console.log(`${old.length} past their 12 months`);
  }
  console.log("pnpm raw manifest | sync | pull [workspace|path] | check | expired");
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
