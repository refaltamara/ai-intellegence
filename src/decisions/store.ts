/**
 * Decisions (PRD-v2 §6): the unit work attaches to. Threads, pins, agents and
 * reports hang off a decision. A decision may set the brand CeMO is on the side
 * of; otherwise the workspace client applies. Threads stay private to their
 * author; the decision itself is shared across the workspace.
 */
import { sql } from "../db/client";
import type { ConversationRow } from "../chat/persist";

export type DecisionStatus = "open" | "decided" | "archived";
export type DecisionRow = { id: string; workspace_id: string; user_id: string | null; name: string; status: DecisionStatus; outcome: string | null; client_brand_id: string | null; created_at: string; updated_at: string };
export type DecisionSummary = DecisionRow & { threads: number; pinned: number; watching: number; client_name: string | null; last_activity: string };
export type PinRow = { id: string; decision_id: string; skill_run_id: string; note: string | null; created_at: string; skill: string; title: string; window: { from: string; to: string } | null; matched: number | null };

const SUMMARY = `
  select d.*, b.name as client_name,
         (select count(*) from conversations c where c.decision_id = d.id)::int as threads,
         (select count(*) from pins p where p.decision_id = d.id)::int as pinned,
         (select count(*) from agents a where a.decision_id = d.id and a.status = 'active')::int as watching,
         greatest(d.updated_at, coalesce((select max(c.updated_at) from conversations c where c.decision_id = d.id), d.updated_at)) as last_activity
  from decisions d left join brands b on b.id = d.client_brand_id`;

export async function listDecisions(workspaceId: string, status?: DecisionStatus): Promise<DecisionSummary[]> {
  return (await sql.query(`${SUMMARY} where d.workspace_id = $1 ${status ? "and d.status = $2" : ""} order by last_activity desc`, status ? [workspaceId, status] : [workspaceId])) as DecisionSummary[];
}

export async function getDecision(id: string, workspaceId: string): Promise<DecisionSummary | null> {
  const r = (await sql.query(`${SUMMARY} where d.id = $1 and d.workspace_id = $2`, [id, workspaceId])) as DecisionSummary[];
  return r[0] ?? null;
}

export function decisionNameFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").replace(/^\/[\w-]+\s*/, "").trim();
  return (t.length > 72 ? t.slice(0, 69).replace(/\s+\S*$/, "") + "…" : t) || "Untitled";
}

export async function createDecision(workspaceId: string, userId: string | null, name: string, clientBrandId: string | null = null): Promise<DecisionRow> {
  const r = (await sql.query("insert into decisions (workspace_id, user_id, name, client_brand_id) values ($1, $2, $3, $4) returning *", [workspaceId, userId, name.slice(0, 120) || "Untitled", clientBrandId])) as DecisionRow[];
  return r[0];
}

export async function updateDecision(id: string, workspaceId: string, patch: { name?: string; status?: DecisionStatus; outcome?: string | null; client_brand_id?: string | null }): Promise<DecisionRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [id, workspaceId];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (patch.name !== undefined) add("name", patch.name.slice(0, 120) || "Untitled");
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.outcome !== undefined) add("outcome", patch.outcome);
  if (patch.client_brand_id !== undefined) add("client_brand_id", patch.client_brand_id);
  if (!sets.length) return (await sql.query("select * from decisions where id = $1 and workspace_id = $2", [id, workspaceId]) as unknown as DecisionRow[])[0] ?? null;
  const r = (await sql.query(`update decisions set ${sets.join(", ")}, updated_at = now() where id = $1 and workspace_id = $2 returning *`, vals)) as DecisionRow[];
  return r[0] ?? null;
}

/** The signed-in user's own threads in a decision (threads are private to their author). */
export async function decisionThreads(decisionId: string, userId: string | null): Promise<ConversationRow[]> {
  if (!userId) return [];
  return (await sql.query("select * from conversations where decision_id = $1 and user_id = $2 order by updated_at desc", [decisionId, userId])) as ConversationRow[];
}

export async function moveThread(conversationId: string, decisionId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const r = (await sql.query("update conversations set decision_id = $2 where id = $1 and user_id = $3 returning id", [conversationId, decisionId, userId])) as { id: string }[];
  return r.length > 0;
}

export async function listPins(decisionId: string): Promise<PinRow[]> {
  const rows = (await sql.query(
    `select p.id, p.decision_id, p.skill_run_id, p.note, p.created_at, r.skill,
            r.result->'meta'->'data_window' as window, (r.result->'meta'->>'matched')::int as matched
     from pins p join skill_runs r on r.id = p.skill_run_id where p.decision_id = $1 order by p.created_at desc`,
    [decisionId],
  )) as unknown as Omit<PinRow, "title">[];
  return rows.map((x) => ({ ...x, title: x.skill }));
}

export async function pinRun(workspaceId: string, decisionId: string, skillRunId: string, userId: string | null, note: string | null = null): Promise<PinRow | null> {
  await sql.query(
    "insert into pins (workspace_id, decision_id, skill_run_id, created_by, note) values ($1, $2, $3, $4, $5) on conflict (decision_id, skill_run_id) do nothing",
    [workspaceId, decisionId, skillRunId, userId, note],
  );
  await sql.query("update decisions set updated_at = now() where id = $1", [decisionId]);
  return (await listPins(decisionId)).find((p) => p.skill_run_id === skillRunId) ?? null;
}

export async function unpin(decisionId: string, pinId: string): Promise<boolean> {
  const r = (await sql.query("delete from pins where id = $1 and decision_id = $2 returning id", [pinId, decisionId])) as { id: string }[];
  return r.length > 0;
}

/** What the model is told about the decision a thread belongs to. */
export async function decisionContext(decisionId: string, workspaceId: string): Promise<string> {
  const d = await getDecision(decisionId, workspaceId);
  if (!d) return "";
  const pins = await listPins(decisionId);
  const lines = [`Decision context: this conversation belongs to the decision "${d.name}" (${d.status}${d.outcome ? `, outcome: ${d.outcome}` : ""}).`];
  if (d.client_name) lines.push(`For this decision the client is ${d.client_name} (${d.client_brand_id}): "we" and "us" mean ${d.client_name}; other tracked brands are competitors. This overrides any workspace-level client.`);
  if (pins.length) lines.push(`Pinned so far: ${pins.slice(0, 6).map((p) => `${p.skill.replace(/-/g, " ")} for ${p.window?.from ?? "?"} to ${p.window?.to ?? "?"}${p.matched != null ? ` (${p.matched} matched)` : ""}`).join("; ")}. Prefer continuity with what is pinned: if a creator list is pinned, note overlap with it when you return creators.`);
  else lines.push("Nothing is pinned to this decision yet.");
  return lines.join(" ");
}
