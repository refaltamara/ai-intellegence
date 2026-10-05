/**
 * Extensions as data (CMS plan, "Client extensions"). A definition rides on a creation
 * (src/company/creations.ts), so it has a maker, an approver and a badge like anything a
 * team makes: a Builder approves it (with the estimate in front of them) and a job fills
 * it. Removing it deletes its values; the core tables never change.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import type { Actor } from "../auth/can";
import type { RoleId } from "../roles/model";
import { audit } from "../roles/store";
import { canSpend } from "../credits/ledger";
import { validateExt, type Estimate, type ExtDef, type ExtDefInput } from "./spec";
import { sampleAndEstimate, type Tagger } from "./fill";

export async function getDef(id: string, ws: string): Promise<ExtDef | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const rows = (await sql.query("select * from ext_defs where id = $1 and workspace_id = $2", [id, ws])) as ExtDef[];
  return rows[0] ?? null;
}

export async function defForCreation(creationId: string): Promise<ExtDef | null> {
  const rows = (await sql.query("select * from ext_defs where creation_id = $1", [creationId])) as ExtDef[];
  return rows[0] ?? null;
}

export async function listDefs(ws: string): Promise<ExtDef[]> {
  return (await sql.query("select * from ext_defs where workspace_id = $1 order by created_at", [ws])) as ExtDef[];
}

const liveCache = new Map<string, { at: number; v: ExtDef[] }>();
/** what the query builder may join: definitions being filled or live */
export async function liveDefs(ws: string): Promise<ExtDef[]> {
  const hit = liveCache.get(ws);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const v = (await sql.query("select * from ext_defs where workspace_id = $1 and status in ('filling','live')", [ws])) as ExtDef[];
  liveCache.set(ws, { at: Date.now(), v });
  return v;
}
export const invalidateExt = (ws?: string) => (ws ? liveCache.delete(ws) : liveCache.clear());

/** The definition's draft, made with its creation; the key must be new in the workspace. */
export async function createDraftDef(ws: string, input: Partial<ExtDefInput>, maker: string, creationId: string): Promise<{ ok: true; def: ExtDef } | { ok: false; error: string }> {
  const v = validateExt(input);
  if (!v.ok) return { ok: false, error: v.errors.join(" ") };
  const taken = (await sql.query("select 1 from ext_defs where workspace_id = $1 and key = $2", [ws, v.def.key])) as unknown[];
  if (taken.length) return { ok: false, error: `This workspace already has "${v.def.key}"; pick another name.` };
  const d = v.def;
  const rows = (await sql.query(
    "insert into ext_defs (workspace_id, key, name, target, values, source, spec, maker_email, creation_id) values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9) returning *",
    [ws, d.key, d.name, d.target, toJson(d.values), d.source, toJson({ ...(d.rules ? { rules: d.rules } : {}), ...(d.guide ? { guide: d.guide } : {}), scope: d.scope ?? {} }), maker, creationId],
  )) as ExtDef[];
  return { ok: true, def: rows[0] };
}

export async function saveEstimate(def: ExtDef, est: Estimate): Promise<void> {
  await sql.query("update ext_defs set estimate = $2::jsonb, updated_at = now() where id = $1", [def.id, toJson(est)]);
}

/** Sample and estimate a draft (a rule is free; CeMO reads 50 rows), and keep the estimate on it. */
export async function estimateDef(def: ExtDef, who: { email: string; staff?: boolean }, tagger?: Tagger): Promise<Estimate & { stopped?: string }> {
  const est = await sampleAndEstimate(def, { tagger, email: who.email, staff: who.staff });
  await saveEstimate(def, est);
  return est;
}

/** Before a Builder approves: refused when the estimate is more than the month has left (only where billing is on). */
export async function approvalBlock(creationId: string): Promise<string | null> {
  const def = await defForCreation(creationId);
  if (!def) return "Its definition is gone; ask CeMO to draft it again.";
  const need = def.estimate?.credits_now ?? 0;
  const ok = await canSpend(def.workspace_id, need);
  return ok.ok ? null : `Filling it needs about ${Math.round(need).toLocaleString("en-US")} credits. ${ok.message}`;
}

export async function enqueueJob(ws: string, kind: string, params: Record<string, unknown>, by: string): Promise<string> {
  const rows = (await sql.query("insert into cms_jobs (workspace_id, kind, params, created_by) values ($1, $2, $3::jsonb, $4) returning id", [ws, kind, toJson(params), by])) as { id: string }[];
  return rows[0].id;
}

/** What happens to the data when its creation moves: approved fills it, removed or rejected deletes it, brought back fills it again. */
export async function onCreationStatus(c: { id: string; workspace_id: string; role: RoleId; spec: Record<string, unknown>; maker_email: string }, status: string, actor: Actor): Promise<void> {
  let def = await defForCreation(c.id);
  if (status === "approved") {
    if (!def) {
      // brought back after removal: the definition is kept on the creation
      const made = await createDraftDef(c.workspace_id, c.spec as Partial<ExtDefInput>, c.maker_email, c.id);
      if (!made.ok) return;
      def = made.def;
    }
    await sql.query("update ext_defs set status = 'approved', approver = $2, updated_at = now() where id = $1", [def.id, actor.email]);
    await enqueueJob(c.workspace_id, "ext_fill", { def_id: def.id }, actor.email);
    await audit({ workspace_id: c.workspace_id, actor: actor.email, area: "extension", action: "approve", path: def.key, new: { estimate: def.estimate?.credits_now ?? 0 } });
  } else if (["removed", "rejected"].includes(status) && def) {
    await sql.query("delete from ext_defs where id = $1", [def.id]);
    await sql.query("update cms_jobs set status = 'cancelled', updated_at = now() where status in ('queued','running') and params->>'def_id' = $1", [def.id]);
    await audit({ workspace_id: c.workspace_id, actor: actor.email, area: "extension", action: "remove", path: def.key });
  }
  invalidateExt(c.workspace_id);
}

export type ExtSummary = ExtDef & { counts: { value: string; n: number }[]; creation_status: string | null; maker_name: string | null };

/** Every extension of a workspace with how many rows hold each value (counted in SQL), for Our Chorus and the CMS. */
export async function extSummaries(ws: string): Promise<ExtSummary[]> {
  const defs = (await sql.query(
    "select d.*, c.status as creation_status, c.maker_name from ext_defs d left join creations c on c.id = d.creation_id where d.workspace_id = $1 order by d.created_at",
    [ws],
  )) as (ExtDef & { creation_status: string | null; maker_name: string | null })[];
  if (!defs.length) return [];
  const counts = (await sql.query("select def_id, coalesce(value, 'none') as value, count(*)::int as n from ext_values where def_id = any($1::uuid[]) group by 1, 2 order by 3 desc", [defs.map((d) => d.id)])) as { def_id: string; value: string; n: number }[];
  return defs.map((d) => ({ ...d, counts: counts.filter((c) => c.def_id === d.id).map(({ value, n }) => ({ value, n })) }));
}
