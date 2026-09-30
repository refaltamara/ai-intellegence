/** Pulses and their cards over the Neon HTTP client; every query is scoped by workspace. */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import type { CardConfig, CardKind, CardRow, CardSize } from "./cards";

export type PulseRow = { id: string; workspace_id: string; user_id: string | null; name: string; description: string | null; created_at: string; updated_at: string; cards?: number };

export async function listPulses(workspaceId: string): Promise<(PulseRow & { cards: number; kinds: string[] })[]> {
  return (await sql.query(
    `select p.*, count(c.id)::int as cards, coalesce(array_agg(c.kind order by c.position) filter (where c.id is not null), '{}') as kinds
     from pulses p left join pulse_cards c on c.pulse_id = p.id
     where p.workspace_id = $1 group by p.id order by p.updated_at desc`,
    [workspaceId],
  )) as (PulseRow & { cards: number; kinds: string[] })[];
}

export async function getPulse(id: string, workspaceId: string): Promise<PulseRow | null> {
  const r = (await sql.query("select * from pulses where id = $1 and workspace_id = $2", [id, workspaceId])) as PulseRow[];
  return r[0] ?? null;
}

export async function createPulse(p: { workspaceId: string; userId: string | null; name: string; description?: string | null }): Promise<PulseRow> {
  const r = (await sql.query("insert into pulses (workspace_id, user_id, name, description) values ($1, $2, $3, $4) returning *", [p.workspaceId, p.userId, p.name, p.description ?? null])) as PulseRow[];
  return r[0];
}

export async function updatePulse(id: string, workspaceId: string, patch: { name?: string; description?: string | null }): Promise<PulseRow | null> {
  const r = (await sql.query(
    "update pulses set name = coalesce($3, name), description = case when $4::boolean then $5 else description end, updated_at = now() where id = $1 and workspace_id = $2 returning *",
    [id, workspaceId, patch.name ?? null, patch.description !== undefined, patch.description ?? null],
  )) as PulseRow[];
  return r[0] ?? null;
}

export async function touchPulse(id: string, workspaceId: string): Promise<void> {
  await sql.query("update pulses set updated_at = now() where id = $1 and workspace_id = $2", [id, workspaceId]);
}

export async function deletePulse(id: string, workspaceId: string): Promise<boolean> {
  const r = (await sql.query("delete from pulses where id = $1 and workspace_id = $2 returning id", [id, workspaceId])) as { id: string }[];
  return r.length > 0;
}

export async function listCards(pulseId: string, workspaceId: string): Promise<CardRow[]> {
  return (await sql.query("select id, pulse_id, kind, title, config, size, position, skill_run_id from pulse_cards where pulse_id = $1 and workspace_id = $2 order by position, created_at", [pulseId, workspaceId])) as CardRow[];
}

export async function getCard(id: string, workspaceId: string): Promise<CardRow | null> {
  const r = (await sql.query("select id, pulse_id, kind, title, config, size, position, skill_run_id from pulse_cards where id = $1 and workspace_id = $2", [id, workspaceId])) as CardRow[];
  return r[0] ?? null;
}

export async function addCard(c: { workspaceId: string; pulseId: string; kind: CardKind; title?: string | null; config: CardConfig; size: CardSize; skillRunId?: string | null }): Promise<CardRow> {
  const r = (await sql.query(
    `insert into pulse_cards (workspace_id, pulse_id, kind, title, config, size, skill_run_id, position)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, coalesce((select max(position) + 1 from pulse_cards where pulse_id = $2), 0))
     returning id, pulse_id, kind, title, config, size, position, skill_run_id`,
    [c.workspaceId, c.pulseId, c.kind, c.title ?? null, toJson(c.config), c.size, c.skillRunId ?? null],
  )) as CardRow[];
  await touchPulse(c.pulseId, c.workspaceId);
  return r[0];
}

export async function updateCard(id: string, workspaceId: string, patch: { title?: string | null; config?: CardConfig; size?: CardSize; skillRunId?: string }): Promise<CardRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [id, workspaceId];
  const push = (col: string, v: unknown, cast = "") => { vals.push(v); sets.push(`${col} = $${vals.length}${cast}`); };
  if (patch.title !== undefined) push("title", patch.title);
  if (patch.config !== undefined) push("config", toJson(patch.config), "::jsonb");
  if (patch.size !== undefined) push("size", patch.size);
  if (patch.skillRunId !== undefined) push("skill_run_id", patch.skillRunId);
  if (!sets.length) return getCard(id, workspaceId);
  const r = (await sql.query(`update pulse_cards set ${sets.join(", ")} where id = $1 and workspace_id = $2 returning id, pulse_id, kind, title, config, size, position, skill_run_id`, vals)) as CardRow[];
  if (r[0]) await touchPulse(r[0].pulse_id, workspaceId);
  return r[0] ?? null;
}

export async function deleteCard(id: string, workspaceId: string): Promise<boolean> {
  const r = (await sql.query("delete from pulse_cards where id = $1 and workspace_id = $2 returning pulse_id", [id, workspaceId])) as { pulse_id: string }[];
  if (r[0]) await touchPulse(r[0].pulse_id, workspaceId);
  return r.length > 0;
}

/** Put the cards in the given order; ids not on this Pulse are ignored. */
export async function reorderCards(pulseId: string, workspaceId: string, ids: string[]): Promise<void> {
  await sql.query(
    `update pulse_cards c set position = o.pos - 1 from unnest($3::uuid[]) with ordinality as o(id, pos)
     where c.id = o.id and c.pulse_id = $1 and c.workspace_id = $2`,
    [pulseId, workspaceId, ids],
  );
  await touchPulse(pulseId, workspaceId);
}
