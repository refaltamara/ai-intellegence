/**
 * One load, end to end (DECISIONS, 10 Oct 2026, "Data architecture V1"): read the raw files → the source's adapter →
 * staging → checks → held (with a report and a notice) or promoted to the core (with a notice when rows were flagged).
 * The CLI runs it in one go (scripts/load.ts); the CMS and automatic loads run it as a `load` job in slices
 * (cms_jobs, src/extensions/jobs.ts): staging in the first slice, then the promotion as far as each slice reaches.
 */
import { sql } from "../db/client";
import { readRaw, type RawFile } from "../raw/store";
import { rawFilesFor } from "./registry";
import { readBeauty } from "./adapters/beauty";
import { readListening } from "./adapters/listening";
import { readProfile } from "./adapters/profile";
import { runChecks, type Check } from "./checks";
import { notifyLoad } from "./notify";
import { promote, type PromoteProgress } from "./promote";
import { failLoad, openLoad, writeStaged } from "./stage";
import type { SourceKind, Staged } from "./types";

export const LOAD_KINDS = ["load"] as const;

async function adapt(ws: string, source: SourceKind, tz: string, files: { raw: RawFile; bytes: Buffer }[]): Promise<Staged> {
  if (source === "beauty") return readBeauty({ workspace: ws, tz, files });
  if (source === "listening") return readListening({ workspace: ws, tz, files });
  return readProfile({ workspace: ws, tz, files });
}

/** read and stage a load, then check it: held, or ready to promote */
export async function stageAndCheck(ws: string, source: SourceKind, raws: RawFile[], startedBy: string | null): Promise<{ loadId: string; held: boolean; checks: Check[] }> {
  const tz = ((await sql.query(`select tz from workspaces where id = $1`, [ws])) as { tz: string }[])[0]?.tz;
  if (!tz) throw new Error(`no workspace ${ws}`);
  const ids = new Map(((await sql.query(`select id, blob_path from raw_files where blob_path = any($1::text[])`, [raws.map((f) => f.blob)])) as { id: string; blob_path: string }[]).map((r) => [r.blob_path, r.id]));
  const loadId = await openLoad(ws, source, raws.map((f) => ({ raw_file_id: ids.get(f.blob) ?? null, path: f.path, sha256: f.sha256 })), startedBy);
  try {
    const files = await Promise.all(raws.map(async (raw) => ({ raw, bytes: await readRaw(raw) })));
    const st = await adapt(ws, source, tz, files);
    for (const f of st.files) f.raw_file_id = ids.get(raws.find((r) => r.path.endsWith(f.file))?.blob ?? "") ?? null;
    await writeStaged(loadId, st);
    const { checks, held } = await runChecks(loadId);
    if (held) await notifyLoad(loadId, checks, true).catch((e) => console.error("[load notice]", (e as Error).message));
    return { loadId, held, checks };
  } catch (e) {
    await failLoad(loadId, (e as Error).message);
    throw e;
  }
}

/** after a promotion: tell data ops and the scraper team about flagged rows */
export async function afterPromote(loadId: string): Promise<void> {
  const checks = ((await sql.query(`select checks from staging.loads where id = $1`, [loadId])) as { checks: Check[] }[])[0]?.checks ?? [];
  if (checks.some((c) => c.outcome === "warn")) await notifyLoad(loadId, checks, false).catch((e) => console.error("[load notice]", (e as Error).message));
}

/** a held load let in by a person: the decision is kept with who made it */
export async function letIn(loadId: string, by: string): Promise<void> {
  const r = (await sql.query(`update staging.loads set status = 'staged', decided_by = $2, decided_at = now() where id = $1 and status = 'held' returning id`, [loadId, by])) as unknown[];
  if (!r.length) throw new Error("Only a held load can be let in.");
}

// --------------------------------------------------------------------- jobs
/** onboarding: a draft or review workspace shows as loading while its first loads run, and goes to review after (src/onboard/) */
type LoadParams = { source: SourceKind; files: string[]; started_by?: string | null; promote?: "auto" | "never"; load_id?: string; onboarding?: boolean };
type LoadProgress = { phase?: "stage" | "promote" | "done"; load_id?: string; held?: boolean; promote?: PromoteProgress };

/** one slice of a `load` job: stage and check first, then promote as far as the budget reaches */
export async function loadJobSlice(ws: string, params: LoadParams, progress: LoadProgress, budgetMs = 40_000): Promise<{ done: boolean; progress: LoadProgress; note: string }> {
  const p: LoadProgress = { phase: progress.phase ?? (params.load_id ? "promote" : "stage"), load_id: progress.load_id ?? params.load_id, held: progress.held, promote: progress.promote };
  if (p.phase === "stage") {
    if (params.onboarding) {
      const st = ((await sql.query(`select status from workspaces where id = $1`, [ws])) as { status: string }[])[0]?.status;
      if (st === "draft" || st === "review") await (await import("../onboard/load")).setStatus(ws, "loading");
    }
    const r = await stageAndCheck(ws, params.source, await rawFilesFor(params.files), params.started_by ?? null);
    p.load_id = r.loadId;
    p.held = r.held;
    if (r.held || params.promote === "never") return { done: true, progress: { ...p, phase: "done" }, note: r.held ? "Held: see the load's checks." : "Staged and checked; not promoted." };
    p.phase = "promote";
    return { done: false, progress: p, note: "Staged and checked; promoting." };
  }
  if (p.phase === "promote" && p.load_id) {
    const st = ((await sql.query(`select status from staging.loads where id = $1`, [p.load_id])) as { status: string }[])[0]?.status;
    if (st === "held") return { done: true, progress: { ...p, phase: "done", held: true }, note: "Held: let it in from the CMS first." };
    if (st === "discarded" || st === "live") return { done: true, progress: { ...p, phase: "done" }, note: `The load is ${st}.` };
    const r = await promote(p.load_id, p.promote, budgetMs);
    p.promote = r.progress;
    if (!r.done) return { done: false, progress: p, note: `Promoting: ${r.progress.phase}.` };
    await afterPromote(p.load_id);
    if (params.onboarding) {
      const st = ((await sql.query(`select status from workspaces where id = $1`, [ws])) as { status: string }[])[0]?.status;
      if (st === "loading") await (await import("../onboard/load")).setStatus(ws, "review");
      // the health checks, for data ops to read in review (src/onboard/health.ts)
      await (await import("../onboard/health")).recordHealth(ws).catch((e) => console.error("[health]", (e as Error).message));
    }
    p.phase = "done";
    return { done: true, progress: p, note: `Live: ${Object.entries(r.progress.changed ?? {}).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing changed"}.` };
  }
  return { done: true, progress: { ...p, phase: "done" }, note: "Nothing to do." };
}
