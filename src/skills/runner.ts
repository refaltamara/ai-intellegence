/**
 * Skill runner (PRD §4.1). Validates params against the registry, checks the
 * data layers a skill requires, runs it, enforces the evidence rule, fills meta,
 * and persists the run to skill_runs.
 */
import { EXPORT_CAVEAT_STARTS, viewsCaveat } from "./common";
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import { SkillDb } from "./db";
import { impls } from "./index";
import { getSkill, type SkillDef } from "./registry";
import { loadContext, ParamError, validateParams, type Context } from "./params";
import type { SkillOutput, SkillRequest, SkillResult } from "./types";
import { unavailable } from "./unavailable";
import { toJson } from "../db/json";
import { COMMENT_IN_PANEL, panelPlatformsSql } from "../db/panel";

export type SkillImpl = (db: SkillDb, ctx: Context, def: SkillDef, params: Record<string, unknown>) => Promise<SkillOutput>;

const LAYER_TABLES = ["posts", "creators", "comments", "topics", "post_snapshots"] as const;

const LAYER_TTL_MS = 5 * 60 * 1000;
const layerCache = new Map<string, { counts: Record<string, number>; platforms: string[]; at: number }>();

async function layerCounts(db: SkillDb, workspaceId: string): Promise<Record<string, number>> {
  const hit = layerCache.get(workspaceId);
  if (hit && Date.now() - hit.at < LAYER_TTL_MS) return hit.counts;
  const [counts, platforms] = await Promise.all([layerCountsUncached(db, workspaceId), platformsPresentUncached(db, workspaceId)]);
  layerCache.set(workspaceId, { counts, platforms, at: Date.now() });
  return counts;
}

async function platformsPresent(db: SkillDb, workspaceId: string): Promise<string[]> {
  const hit = layerCache.get(workspaceId);
  if (hit && Date.now() - hit.at < LAYER_TTL_MS) return hit.platforms;
  await layerCounts(db, workspaceId);
  return layerCache.get(workspaceId)?.platforms ?? [];
}

async function layerCountsUncached(db: SkillDb, workspaceId: string): Promise<Record<string, number>> {
  const r = await db.one<Record<string, number>>(
    // posts and comments: whether the panel holds any (all that is asked of them), found at the first one
    `select (select count(*) from (select 1 from posts where workspace_id = $1 and brought_in_by = 'panel' limit 1) x)::int as posts,
            (select count(*) from creators where workspace_id = $1)::int as creators,
            (select count(*) from (select 1 from comments c where c.workspace_id = $1 and ${COMMENT_IN_PANEL("c")} limit 1) x)::int as comments,
            (select count(*) from topics where workspace_id = $1)::int as topics,
            (select count(*) from post_snapshots)::int as post_snapshots`,
    [workspaceId],
  );
  return r ?? {};
}

async function platformsPresentUncached(db: SkillDb, workspaceId: string): Promise<string[]> {
  const rows = await db.q<{ platform: string }>(panelPlatformsSql("$1"), [workspaceId]);
  return rows.map((r) => r.platform);
}

/**
 * The beauty export's caveats (DATA_NOTES) describe that export; a listening workspace (DECISIONS 3 Oct 2026),
 * loaded from the complete schema with daily tracking, has none of those gaps, so they are dropped there.
 */
const listeningCache = new Map<string, { at: number; v: boolean }>();
async function workspaceCaveats(db: SkillDb, workspaceId: string, caveats: string[]): Promise<string[]> {
  if (!caveats.length) return caveats;
  let hit = listeningCache.get(workspaceId);
  if (!hit || Date.now() - hit.at > 5 * 60_000) {
    const r = await db.one<{ l: boolean }>("select exists (select 1 from posts where workspace_id = $1 and relevant is not null) as l", [workspaceId]);
    hit = { at: Date.now(), v: !!r?.l };
    listeningCache.set(workspaceId, hit);
  }
  return hit.v ? caveats.filter((c) => !EXPORT_CAVEAT_STARTS.some((s) => c.startsWith(s))) : caveats;
}

export async function runSkill(req: SkillRequest): Promise<SkillResult> {
  const started = Date.now();
  const db = new SkillDb();
  const workspaceId = req.workspace_id || DEFAULT_WORKSPACE_ID;
  const def = getSkill(req.skill);
  const base = (status: SkillResult["status"], message: string, params: Record<string, unknown>): SkillResult => ({
    skill: req.skill,
    status,
    message,
    params_resolved: params,
    summary: {},
    rows: [],
    evidence: [],
    meta: { matched: 0, returned: 0, data_window: { from: "", to: "" }, freshness: "", caveats: [], sql_hash: db.sqlHash(), duration_ms: Date.now() - started },
    diff_key: def?.output.diff_key ?? "id",
  });

  if (!def) return base("error", `Unknown skill '${req.skill}'`, req.params ?? {});

  // Missing data layers win over parameter errors: an unavailable skill stays
  // unavailable however it is called, so callers do not retry with new params.
  const missingLayers = async (): Promise<string[]> => {
    const counts = await layerCounts(db, workspaceId);
    const missing = def.requires.filter((t) => LAYER_TABLES.includes(t as any) && !(counts[t] > 0));
    if (def.gate?.platforms_present) {
      const present = await platformsPresent(db, workspaceId);
      if (!def.gate.platforms_present.some((p) => present.includes(p))) missing.push(`${def.gate.platforms_present.join("/")} posts`);
    }
    return missing;
  };

  let params: Record<string, unknown>;
  try {
    params = validateParams(def, req.params ?? {});
  } catch (e) {
    const missing = await missingLayers().catch(() => [] as string[]);
    if (missing.length) {
      const out = unavailable(def, missing, req.params ?? {});
      const r = base("unavailable", out.message ?? "unavailable", req.params ?? {});
      r.summary = out.summary;
      return r;
    }
    return base("error", (e as Error).message, req.params ?? {});
  }

  let result: SkillResult;
  try {
    const [ctx, missing] = await Promise.all([loadContext(db, workspaceId), missingLayers()]);
    let out: SkillOutput;
    if (missing.length) {
      out = unavailable(def, missing, params);
    } else {
      const impl = impls[def.name];
      out = impl ? await impl(db, ctx, def, params) : unavailable(def, def.requires, params);
    }
    const status = out.status ?? "ok";
    if (status === "ok" && out.rows.length > 0 && out.evidence.length === 0) {
      throw new Error(`${def.name} returned ${out.rows.length} rows without evidence; the runner rejects results without evidence`);
    }
    const dataWindow = out.data_window ?? { from: ctx.earliest, to: ctx.asOf };
    // a skill counting views at day 7 says so, with how many of the window's posts count so far (DECISIONS, 10 Oct 2026)
    const views = status === "ok" && def.views === "views_d7" ? [await viewsCaveat(db, workspaceId, dataWindow)] : [];
    result = {
      skill: def.name,
      status,
      message: out.message,
      params_resolved: out.params_resolved,
      summary: out.summary,
      rows: out.rows,
      chart: out.chart,
      evidence: out.evidence,
      meta: {
        matched: out.matched ?? out.rows.length,
        returned: out.rows.length,
        data_window: dataWindow,
        freshness: ctx.freshness,
        caveats: await workspaceCaveats(db, workspaceId, [...(out.caveats ?? []), ...views]),
        sql_hash: db.sqlHash(),
        duration_ms: Date.now() - started,
      },
      diff_key: def.output.diff_key,
    };
  } catch (e) {
    const err = e as Error;
    result = base(e instanceof ParamError ? "error" : "error", err.message, params);
  }

  if (req.persist !== false) {
    try {
      const row = await db.one<{ id: string }>(
        `insert into skill_runs (workspace_id, skill, params, params_resolved, result, status, actor, duration_ms)
         values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7::jsonb, $8) returning id`,
        [workspaceId, req.skill, toJson(req.params ?? {}), toJson(result.params_resolved), toJson(result), result.status, toJson(req.actor), result.meta.duration_ms],
      );
      result.run_id = row?.id;
    } catch (e) {
      result.meta.caveats.push(`run not persisted: ${(e as Error).message}`);
    }
  }
  return result;
}

/** The skills that can run in this workspace now: implemented, and with every data layer they need loaded. */
export async function availableSkills(workspaceId: string): Promise<SkillDef[]> {
  const db = new SkillDb();
  const [counts, present] = await Promise.all([layerCounts(db, workspaceId), platformsPresent(db, workspaceId)]);
  const { listSkills } = await import("./registry");
  return listSkills().filter(
    (def) =>
      !!impls[def.name] &&
      def.requires.every((t) => !LAYER_TABLES.includes(t as (typeof LAYER_TABLES)[number]) || counts[t] > 0) &&
      (!def.gate?.platforms_present || def.gate.platforms_present.some((p) => present.includes(p))),
  );
}
