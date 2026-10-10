/**
 * The one loader from the command line (src/loader/; DECISIONS, 10 Oct 2026, "Data architecture V1").
 *   pnpm load stage <workspace> <source> [file ...]   read raw files (paths as in data/raw/MANIFEST.json, in order; default: the
 *                                                      workspace's files), stage them, and show what they would change in the core
 *   pnpm load compare <load id>                         what a staged load would change in the core
 *   pnpm load run <workspace> <source> [file ...]       stage, check, and promote unless held (--stage-only stops after the checks)
 *   pnpm load check <load id>                           run the checks again
 *   pnpm load promote <load id> [--anyway]              promote a staged load (--anyway lets a held load in, recorded as the CLI's)
 *   pnpm load discard <load id>                         throw a staged load away whole
 *   pnpm load backfill-readings                         read times and export readings for what was loaded before 10 Oct 2026
 *   pnpm load backfill-items [workspace]                one row per real post: fold each post's brand rows, link them (before migration 0036)
 *   pnpm load check-items [workspace]                   links without their post, or out of step with it (both 0 when the core is in step)
 * source: listening | beauty | profile
 */
import { sql } from "../src/db/client";
import { readManifest, readRaw } from "../src/raw/store";
import { readBeauty } from "../src/loader/adapters/beauty";
import { readListening } from "../src/loader/adapters/listening";
import { rawPathOf, readContract, readProfile } from "../src/loader/adapters/profile";
import { discardLoad, openLoad, writeStaged } from "../src/loader/stage";
import { runChecks } from "../src/loader/checks";
import { promote } from "../src/loader/promote";
import { afterPromote, letIn, stageAndCheck } from "../src/loader/run";
import { rawFilesFor } from "../src/loader/registry";
import type { Check } from "../src/loader/checks";
import { compareAccounts, compareComments, comparePosts, compareReadings, type Diff } from "../src/loader/compare";
import type { SourceKind, Staged } from "../src/loader/types";

const SOURCES: SourceKind[] = ["listening", "beauty", "profile"];

function show(name: string, d: Diff) {
  const extra = d.extra != null ? `, ${d.extra} in the core from these files but not staged` : "";
  console.log(`${name}: ${d.rows} staged, ${d.matched} match a core row, ${d.missing} new${extra}`);
  for (const [c, n] of Object.entries(d.differs)) {
    console.log(`  ${c}: ${n} differ`);
    for (const e of d.examples[c] ?? []) console.log(`    ${JSON.stringify(e)}`);
  }
}

async function compare(loadId: string) {
  const l = ((await sql.query(`select workspace_id, source from staging.loads where id = $1`, [loadId])) as { workspace_id: string; source: SourceKind }[])[0];
  if (!l) throw new Error(`no staged load ${loadId}`);
  show("posts", await comparePosts(loadId, l.workspace_id, l.source));
  show("creators", await compareAccounts(loadId, l.workspace_id, l.source));
  if (l.source !== "beauty") show("comments", await compareComments(loadId, l.workspace_id, l.source));
  if (l.source === "listening") show("readings", await compareReadings(loadId, l.workspace_id));
}

async function stage(ws: string, source: SourceKind, paths: string[]) {
  if (!SOURCES.includes(source)) throw new Error(`source is one of ${SOURCES.join(", ")}`);
  const m = await readManifest();
  const order = !paths.length && source === "profile" ? (() => { const c = readContract(ws); return c.files.map((f) => rawPathOf(c, f.file)); })() : paths;
  const picked = order.length ? order.map((p) => m.files.find((f) => f.path === p) ?? (() => { throw new Error(`${p} is not in the manifest`); })()) : m.files.filter((f) => f.workspace === ws);
  const tz = ((await sql.query(`select tz from workspaces where id = $1`, [ws])) as { tz: string }[])[0]?.tz;
  if (!tz) throw new Error(`no workspace ${ws}`);
  const known = new Map(((await sql.query(`select id, blob_path from raw_files where blob_path = any($1::text[])`, [picked.map((f) => f.blob)])) as { id: string; blob_path: string }[]).map((r) => [r.blob_path, r.id]));
  const files = await Promise.all(picked.map(async (raw) => ({ raw, bytes: await readRaw(raw) })));
  const t0 = Date.now();
  let st: Staged;
  if (source === "beauty") st = readBeauty({ workspace: ws, tz, files });
  else if (source === "listening") st = await readListening({ workspace: ws, tz, files });
  else st = await readProfile({ workspace: ws, tz, files });
  for (const f of st.files) f.raw_file_id = known.get(picked.find((p) => p.path.endsWith(f.file))?.blob ?? "") ?? null;
  console.log(`read ${picked.length} files in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const f of st.files) console.log(`  ${f.file}: ${f.rows_in} rows, ${f.staged} staged, ${f.merged} merged, ${f.dropped} dropped ${JSON.stringify(Object.fromEntries(Object.entries(f.drops).map(([k, v]) => [k, v.count])))}`);
  const loadId = await openLoad(ws, source, picked.map((f) => ({ raw_file_id: known.get(f.blob) ?? null, path: f.path, sha256: f.sha256 })), "cli");
  const t1 = Date.now();
  const counts = await writeStaged(loadId, st);
  console.log(`staged as load ${loadId} in ${((Date.now() - t1) / 1000).toFixed(1)} s: ${JSON.stringify(counts)}`);
  await compare(loadId);
}

function showChecks(checks: Check[]) {
  const mark = { pass: "ok  ", hold: "HOLD", warn: "warn", info: "info" } as const;
  for (const c of checks) console.log(`  ${mark[c.outcome]}  ${c.label}: ${c.detail}`);
}

async function runPromote(loadId: string) {
  let r = await promote(loadId, undefined, 3_600_000);
  while (!r.done) r = await promote(loadId, r.progress, 3_600_000);
  await afterPromote(loadId);
  console.log(`promoted ${loadId}: ${JSON.stringify(r.progress.changed)}`);
}

async function main() {
  const [, , cmd, a, b, ...rest] = process.argv;
  if (cmd === "stage") return stage(a, b as SourceKind, rest);
  if (cmd === "compare") return compare(a);
  if (cmd === "backfill-readings") { const { backfillReadings } = await import("../src/loader/backfillReadings"); return backfillReadings((x) => console.log(x)); }
  if (cmd === "backfill-items") { const { backfillItems } = await import("../src/loader/backfillItems"); await backfillItems(a ?? null, (x) => console.log(x)); return; }
  if (cmd === "check-items") { const { itemsCheck } = await import("../src/loader/backfillItems"); return console.table(await itemsCheck(a ?? null)); }
  if (cmd === "check") { const r = await runChecks(a); showChecks(r.checks); return console.log(r.held ? "held" : "passed"); }
  if (cmd === "promote") {
    if (process.argv.includes("--anyway")) await letIn(a, "cli").catch(() => undefined);
    const st = ((await sql.query(`select status from staging.loads where id = $1`, [a])) as { status: string }[])[0]?.status;
    if (st !== "staged" && st !== "promoting") throw new Error(`load ${a} is ${st ?? "unknown"}; only a staged load is promoted (--anyway for a held one)`);
    return runPromote(a);
  }
  if (cmd === "run") {
    const files = rest.filter((x) => !x.startsWith("--"));
    const order = !files.length && b === "profile" ? (() => { const c = readContract(a); return c.files.map((f) => rawPathOf(c, f.file)); })() : files.length ? files : (await readManifest()).files.filter((f) => f.workspace === a).map((f) => f.path);
    const r = await stageAndCheck(a, b as SourceKind, await rawFilesFor(order), "cli");
    console.log(`load ${r.loadId}: ${r.held ? "held" : "passed"}`);
    showChecks(r.checks);
    if (r.held || process.argv.includes("--stage-only")) return;
    return runPromote(r.loadId);
  }
  if (cmd === "discard") { await discardLoad(a, "cli"); return console.log(`load ${a} thrown away`); }
  console.log("pnpm load stage <workspace> <source> [file ...] | compare <load id> | discard <load id>");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
