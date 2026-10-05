/**
 * Jobs without pg-boss (CMS plan, "Jobs without pg-boss"): cms_jobs is a table; the cron
 * claims one job at a time with locked_until (skip locked), runs a slice that fits a
 * function's time limit, saves progress, and comes back. Today's kinds: filling an
 * extension. Live extensions are kept current here too: rules recomputed once a day, CeMO
 * reading the rows that arrived since.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { fillRules, scopeCounts, tagRows, type Tagger } from "./fill";
import { getDef, invalidateExt } from "./store";
import type { ExtDef } from "./spec";

export type Job = { id: string; workspace_id: string | null; kind: string; params: Record<string, unknown>; status: string; progress: Record<string, unknown>; error: string | null; created_by: string | null };

/** rows CeMO reads in one slice (8 model calls of 25) */
export const SLICE_ROWS = 200;
/** new rows CeMO reads per live extension per run */
const REFRESH_ROWS = 100;

export async function claimJob(): Promise<Job | null> {
  const rows = (await sql.query(
    `update cms_jobs set status = 'running', locked_until = now() + interval '5 minutes', updated_at = now()
      where id = (select id from cms_jobs where status in ('queued','running') and (locked_until is null or locked_until < now()) order by created_at limit 1 for update skip locked)
      returning *`,
  )) as Job[];
  return rows[0] ?? null;
}

async function setDef(def: ExtDef, status: ExtDef["status"], progress: Record<string, unknown>): Promise<void> {
  await sql.query("update ext_defs set status = $2, progress = coalesce(progress, '{}'::jsonb) || $3::jsonb, updated_at = now() where id = $1", [def.id, status, toJson(progress)]);
  invalidateExt(def.workspace_id);
}

async function finish(job: Job, status: "done" | "failed" | "cancelled" | "queued", progress: Record<string, unknown>, error?: string | null, retryMinutes = 0): Promise<void> {
  await sql.query(
    `update cms_jobs set status = $2, progress = progress || $3::jsonb, error = $4, locked_until = ${retryMinutes ? `now() + make_interval(mins => ${retryMinutes})` : "null"}, finished_at = ${status === "done" || status === "failed" || status === "cancelled" ? "now()" : "null"}, updated_at = now() where id = $1`,
    [job.id, status, toJson(progress), error ?? null],
  );
}

/** One slice of a job. A test or a dry run may pass its own tagger instead of the model. */
export async function runSlice(job: Job, tagger?: Tagger): Promise<{ status: string; detail: Record<string, unknown> }> {
  if (job.kind !== "ext_fill" || !job.workspace_id) { await finish(job, "failed", {}, `unknown job ${job.kind}`); return { status: "failed", detail: {} }; }
  const def = await getDef(String(job.params.def_id ?? ""), job.workspace_id);
  if (!def) { await finish(job, "cancelled", {}, "the extension was removed"); return { status: "cancelled", detail: {} }; }
  try {
    if (def.source === "rule") {
      const n = await fillRules(def);
      await setDef(def, "live", { done: n, total: n, refreshed_at: new Date().toISOString().slice(0, 10) });
      await finish(job, "done", { rows: n });
      return { status: "done", detail: { rows: n } };
    }
    if (def.source === "file") {
      const c = await scopeCounts(def);
      await setDef(def, "live", { done: c.done, total: c.rows });
      await finish(job, "done", { rows: c.done });
      return { status: "done", detail: { rows: c.done } };
    }
    if (def.status === "approved") await setDef(def, "filling", {});
    const t = await tagRows(def, SLICE_ROWS, { tagger, email: def.approver ?? def.maker_email, kindNote: "fill" });
    const c = await scopeCounts(def);
    const credits = Number(job.progress.credits ?? 0) + t.credits;
    if (t.stopped) {
      // at the cap: keep what is read, try again in an hour
      await setDef(def, "filling", { done: c.done, total: c.rows, error: t.stopped });
      await finish(job, "queued", { done: c.done, total: c.rows, credits }, t.stopped, 60);
      return { status: "waiting", detail: { done: c.done, total: c.rows, stopped: t.stopped } };
    }
    if (c.done >= c.rows || t.read === 0) {
      await setDef(def, "live", { done: c.done, total: c.rows, credits, error: null });
      await finish(job, "done", { done: c.done, total: c.rows, credits });
      return { status: "done", detail: { done: c.done, total: c.rows, credits } };
    }
    await setDef(def, "filling", { done: c.done, total: c.rows, credits, error: null });
    await finish(job, "queued", { done: c.done, total: c.rows, credits });
    return { status: "running", detail: { done: c.done, total: c.rows, credits } };
  } catch (e) {
    const msg = (e as Error).message;
    await setDef(def, def.status === "approved" ? "approved" : def.status, { error: msg.slice(0, 300) });
    await finish(job, "queued", {}, msg.slice(0, 500), 30);
    return { status: "error", detail: { error: msg } };
  }
}

/** Keep live extensions current: rules once a day; CeMO reads what arrived since. */
export async function refreshLive(tagger?: Tagger): Promise<Record<string, unknown>[]> {
  const today = new Date().toISOString().slice(0, 10);
  const defs = (await sql.query("select * from ext_defs where status = 'live' order by updated_at")) as ExtDef[];
  const out: Record<string, unknown>[] = [];
  for (const d of defs) {
    if (d.source === "rule" && d.progress?.refreshed_at !== today) {
      const n = await fillRules(d);
      await setDef(d, "live", { done: n, total: n, refreshed_at: today });
      out.push({ ext: d.key, ws: d.workspace_id, rows: n });
    } else if (d.source === "cemo") {
      const t = await tagRows(d, REFRESH_ROWS, { tagger, email: d.approver ?? d.maker_email, kindNote: "new rows" }).catch((e) => ({ read: 0, credits: 0, stopped: (e as Error).message, tagged: [] }));
      if (t.read || t.stopped) out.push({ ext: d.key, ws: d.workspace_id, read: t.read, credits: t.credits, stopped: t.stopped });
    }
  }
  return out;
}
