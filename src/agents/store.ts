/** agents / agent_runs persistence over the Neon HTTP client. */
import { sql } from "../db/client";
import type { Diff, DiffConfig } from "./diff";

export type AgentRow = {
  id: string; workspace_id: string; user_id: string | null; name: string; skill: string; params: Record<string, unknown>;
  from_skill_run_id: string | null; schedule_cron: string; schedule_tz: string; schedule_human: string | null;
  delivery: { channels: string[]; email?: string; whatsapp?: string }; only_if_changed: boolean; diff_config: DiffConfig;
  status: "active" | "paused" | "draft"; last_run_at: string | null; next_run_at: string | null; created_at: string;
};
export type AgentRunRow = {
  id: string; agent_id: string; skill_run_id: string | null; started_at: string; finished_at: string | null;
  diff: Diff | null; should_deliver: boolean | null; delivered_at: string | null; delivery_error: string | null; report_id: string | null;
};

export async function listAgents(workspaceId: string): Promise<AgentRow[]> {
  return (await sql.query("select * from agents where workspace_id = $1 order by created_at desc", [workspaceId])) as AgentRow[];
}
export async function getAgent(id: string, workspaceId: string): Promise<AgentRow | null> {
  const r = (await sql.query("select * from agents where id = $1 and workspace_id = $2", [id, workspaceId])) as AgentRow[];
  return r[0] ?? null;
}
export async function dueAgents(workspaceId: string | null, now = new Date()): Promise<AgentRow[]> {
  return (await sql.query(
    `select * from agents where status = 'active' and next_run_at is not null and next_run_at <= $1 ${workspaceId ? "and workspace_id = $2" : ""} order by next_run_at asc`,
    workspaceId ? [now.toISOString(), workspaceId] : [now.toISOString()],
  )) as AgentRow[];
}
export async function insertAgent(a: Omit<AgentRow, "id" | "created_at" | "last_run_at">): Promise<AgentRow> {
  const r = (await sql.query(
    `insert into agents (workspace_id, user_id, name, skill, params, from_skill_run_id, schedule_cron, schedule_tz, schedule_human, delivery, only_if_changed, diff_config, status, next_run_at)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb, $13, $14) returning *`,
    [a.workspace_id, a.user_id, a.name, a.skill, JSON.stringify(a.params), a.from_skill_run_id, a.schedule_cron, a.schedule_tz, a.schedule_human, JSON.stringify(a.delivery), a.only_if_changed, JSON.stringify(a.diff_config), a.status, a.next_run_at],
  )) as AgentRow[];
  return r[0];
}
export async function updateAgent(id: string, workspaceId: string, patch: Partial<Pick<AgentRow, "name" | "params" | "schedule_cron" | "schedule_tz" | "schedule_human" | "delivery" | "only_if_changed" | "diff_config" | "status" | "next_run_at" | "last_run_at">>): Promise<AgentRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [id, workspaceId];
  const push = (col: string, v: unknown, cast = "") => { vals.push(v); sets.push(`${col} = $${vals.length}${cast}`); };
  if (patch.name !== undefined) push("name", patch.name);
  if (patch.params !== undefined) push("params", JSON.stringify(patch.params), "::jsonb");
  if (patch.schedule_cron !== undefined) push("schedule_cron", patch.schedule_cron);
  if (patch.schedule_tz !== undefined) push("schedule_tz", patch.schedule_tz);
  if (patch.schedule_human !== undefined) push("schedule_human", patch.schedule_human);
  if (patch.delivery !== undefined) push("delivery", JSON.stringify(patch.delivery), "::jsonb");
  if (patch.only_if_changed !== undefined) push("only_if_changed", patch.only_if_changed);
  if (patch.diff_config !== undefined) push("diff_config", JSON.stringify(patch.diff_config), "::jsonb");
  if (patch.status !== undefined) push("status", patch.status);
  if (patch.next_run_at !== undefined) push("next_run_at", patch.next_run_at);
  if (patch.last_run_at !== undefined) push("last_run_at", patch.last_run_at);
  if (!sets.length) return getAgent(id, workspaceId);
  const r = (await sql.query(`update agents set ${sets.join(", ")} where id = $1 and workspace_id = $2 returning *`, vals)) as AgentRow[];
  return r[0] ?? null;
}
export async function deleteAgent(id: string, workspaceId: string): Promise<boolean> {
  const r = (await sql.query("delete from agents where id = $1 and workspace_id = $2 returning id", [id, workspaceId])) as { id: string }[];
  return r.length > 0;
}

export async function listRuns(agentId: string, limit = 10): Promise<AgentRunRow[]> {
  return (await sql.query("select * from agent_runs where agent_id = $1 order by started_at desc limit $2", [agentId, limit])) as AgentRunRow[];
}
export async function lastSuccessfulRun(agentId: string): Promise<(AgentRunRow & { rows: Record<string, unknown>[] }) | null> {
  const r = (await sql.query(
    `select ar.*, (sr.result->'rows') as rows from agent_runs ar join skill_runs sr on sr.id = ar.skill_run_id
     where ar.agent_id = $1 and ar.finished_at is not null and sr.status = 'ok' order by ar.started_at desc limit 1`,
    [agentId],
  )) as (AgentRunRow & { rows: Record<string, unknown>[] })[];
  return r[0] ?? null;
}
export async function insertRun(agentId: string): Promise<AgentRunRow> {
  const r = (await sql.query("insert into agent_runs (agent_id) values ($1) returning *", [agentId])) as AgentRunRow[];
  return r[0];
}
export async function finishRun(id: string, patch: { skill_run_id?: string | null; diff?: Diff | null; should_deliver?: boolean; delivered_at?: string | null; delivery_error?: string | null; report_id?: string | null }): Promise<AgentRunRow> {
  const r = (await sql.query(
    `update agent_runs set finished_at = now(), skill_run_id = $2, diff = $3::jsonb, should_deliver = $4, delivered_at = $5, delivery_error = $6, report_id = $7 where id = $1 returning *`,
    [id, patch.skill_run_id ?? null, patch.diff ? JSON.stringify(patch.diff) : null, patch.should_deliver ?? null, patch.delivered_at ?? null, patch.delivery_error ?? null, patch.report_id ?? null],
  )) as AgentRunRow[];
  return r[0];
}
export async function insertReport(r: { workspace_id: string; title: string; source: "agent" | "ask"; skill_run_id: string | null; agent_run_id: string | null; body_md: string; blocks: unknown }): Promise<{ id: string }> {
  const rows = (await sql.query(
    "insert into reports (workspace_id, title, source, skill_run_id, agent_run_id, body_md, blocks) values ($1, $2, $3, $4, $5, $6, $7::jsonb) returning id",
    [r.workspace_id, r.title, r.source, r.skill_run_id, r.agent_run_id, r.body_md, JSON.stringify(r.blocks)],
  )) as { id: string }[];
  return rows[0];
}
