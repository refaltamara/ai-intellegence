/**
 * Skill runner (PRD §4.1). Validates params against the registry, checks the
 * data layers a skill requires, runs it, enforces the evidence rule, fills meta,
 * and persists the run to skill_runs.
 */
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import { SkillDb } from "./db";
import { impls } from "./index";
import { getSkill, type SkillDef } from "./registry";
import { loadContext, ParamError, validateParams, type Context } from "./params";
import type { SkillOutput, SkillRequest, SkillResult } from "./types";
import { unavailable } from "./unavailable";

export type SkillImpl = (db: SkillDb, ctx: Context, def: SkillDef, params: Record<string, unknown>) => Promise<SkillOutput>;

const LAYER_TABLES = ["posts", "creators", "comments", "topics", "post_snapshots"] as const;

async function layerCounts(db: SkillDb, workspaceId: string): Promise<Record<string, number>> {
  const r = await db.one<Record<string, number>>(
    `select (select count(*) from posts where workspace_id = $1)::int as posts,
            (select count(*) from creators where workspace_id = $1)::int as creators,
            (select count(*) from comments where workspace_id = $1)::int as comments,
            (select count(*) from topics where workspace_id = $1)::int as topics,
            (select count(*) from post_snapshots)::int as post_snapshots`,
    [workspaceId],
  );
  return r ?? {};
}

async function platformsPresent(db: SkillDb, workspaceId: string): Promise<string[]> {
  const rows = await db.q<{ platform: string }>("select distinct platform from posts where workspace_id = $1", [workspaceId]);
  return rows.map((r) => r.platform);
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
    const ctx = await loadContext(db, workspaceId);
    const missing = await missingLayers();
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
        data_window: out.data_window ?? { from: ctx.earliest, to: ctx.asOf },
        freshness: ctx.freshness,
        caveats: out.caveats ?? [],
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
        [workspaceId, req.skill, JSON.stringify(req.params ?? {}), JSON.stringify(result.params_resolved), JSON.stringify(result), result.status, JSON.stringify(req.actor), result.meta.duration_ms],
      );
      result.run_id = row?.id;
    } catch (e) {
      result.meta.caveats.push(`run not persisted: ${(e as Error).message}`);
    }
  }
  return result;
}
