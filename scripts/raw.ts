/**
 * Raw files (src/raw/store.ts; DECISIONS, 10 Oct 2026): kept in private Vercel Blob, listed in data/raw/MANIFEST.json.
 *   pnpm raw manifest                 add the files under data/raw to the manifest (size, hash, the day they arrived)
 *   pnpm raw sync                     put every listed file that is here into the store, if it is not there yet
 *   pnpm raw pull [workspace|path]    fetch listed files into data/raw (checked against their hash)
 *   pnpm raw check                    each file: here, and in the store
 *   pnpm raw expired                  files past their 12 months
 * The store needs BLOB_READ_WRITE_TOKEN (`vercel env pull`). `sync --build` runs in Vercel's production build,
 * where the store's token already is: it fails the build unless every file found here is confirmed in the store.
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
  if (!storeOn()) throw new Error("raw sync: the store is not configured (BLOB_READ_WRITE_TOKEN).");
  let put = 0, there = 0;
  const failed: string[] = [];
  for (const { f, b } of here) {
    try {
      const size = await storedSize(f.blob);
      if (size === f.bytes) { there++; continue; }
      if (size !== null) throw new Error(`a different file (${size} bytes) already sits at ${f.blob}`);
      await store(f, b);
      if ((await storedSize(f.blob)) !== f.bytes) throw new Error(`${f.blob} did not arrive whole`);
      put++;
    } catch (e) {
      failed.push(`${f.path}: ${(e as Error).message}`);
    }
  }
  console.log(`raw sync: ${put} stored, ${there} already there, ${failed.length} failed, of ${here.length} files here (${m.files.length} listed)`);
  if (failed.length) {
    for (const x of failed) console.error(`  ${x}`);
    process.exitCode = 1;
  }
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
