/**
 * Activity lines: what the product says it is doing while a skill runs
 * ("Looking through 71,163 creators"), never what it is calling. Strings live in
 * skills.registry.json under `activity` and are templated from workspace counts,
 * the skill's params and its result.
 */
import type { SkillDef } from "../skills/registry";
import type { SkillResult } from "../skills/types";
import { SkillDb } from "../skills/db";

export type Activity = { start: string; steps: string[]; done: string };

const FALLBACK: Activity = { start: "Looking at the data", steps: [], done: "Done" };

const COUNT_TTL_MS = 5 * 60 * 1000;
const countCache = new Map<string, { at: number; counts: Counts }>();
export type Counts = { creator_count: number; post_count: number; brand_count: number };

export async function workspaceCounts(workspaceId: string, db = new SkillDb()): Promise<Counts> {
  const hit = countCache.get(workspaceId);
  if (hit && Date.now() - hit.at < COUNT_TTL_MS) return hit.counts;
  const r = await db.one<{ creators: number; posts: number; brands: number }>(
    `select (select count(*) from creators where workspace_id = $1)::int as creators,
            (select count(*) from posts where workspace_id = $1)::int as posts,
            (select count(*) from brands where workspace_id = $1)::int as brands`,
    [workspaceId],
  );
  const counts = { creator_count: r?.creators ?? 0, post_count: r?.posts ?? 0, brand_count: r?.brands ?? 0 };
  countCache.set(workspaceId, { at: Date.now(), counts });
  return counts;
}

const fmt = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : String(n ?? ""));

export function fill(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars && vars[k] != null ? fmt(vars[k]) : "")).replace(/\s{2,}/g, " ").trim();
}

/** Lines to show before and during the run. */
export function activityStart(def: SkillDef | undefined, counts: Counts): { start: string; steps: string[] } {
  const a = def?.activity ?? FALLBACK;
  return { start: fill(a.start, counts), steps: a.steps.map((s) => fill(s, counts)) };
}

/** The line to show once the result is in. */
export function activityDone(def: SkillDef | undefined, result: SkillResult, counts: Counts): string {
  const a = def?.activity ?? FALLBACK;
  if (result.status === "unavailable") return "That data is not loaded yet";
  if (result.status === "error") return "That did not work";
  const vars = { ...counts, matched: result.meta?.matched ?? result.rows.length, n: result.rows.length };
  const line = fill(a.done, vars);
  // "0 campaigns" reads better than a blank; but a plain "Done" template stays "Done"
  return line || "Done";
}
