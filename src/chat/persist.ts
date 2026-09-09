/** Conversations and messages (PRD §5.5) over the Neon HTTP client. */
import { sql } from "../db/client";
import type { Evidence } from "../skills/types";
import type { PaneAction, PaneState } from "./pane";

export type ConversationRow = { id: string; workspace_id: string; user_id: string | null; decision_id: string | null; title: string | null; created_at: string; updated_at: string };
export type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content_json: {
    text: string;
    tools?: ToolCallRecord[];
    draft?: unknown;
    error?: string;
    attachments?: { id: string; filename: string; bytes: number }[];
    /** the one clarifying question this assistant turn ended on; answered by the next user turn */
    ask?: { tool_use_id: string; question: string; options: { label: string; value: string }[]; why: string };
    followups?: { label: string; prompt: string; skill: string; params?: Record<string, unknown> }[];
    has_counter?: boolean;
    mechanism_leak?: string[];
    /** a pane action or a note ("You exported 41 rows"): shown as a grey line, never a bubble */
    hidden?: boolean;
    pane_action?: PaneAction;
    note?: string;
  };
  evidence_json: Record<string, Evidence> | null;
  skill_run_ids: string[] | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
};
export type ToolCallRecord = {
  id: string;
  name: string;
  input: unknown;
  skill?: string;
  /** plain-language title for the result card; never the skill name */
  title?: string;
  status: string;
  message?: string;
  run_id?: string;
  summary?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  chart?: unknown;
  meta?: Record<string, unknown>;
  params_resolved?: Record<string, unknown>;
  diff_key?: string;
  evidence_ids?: string[];
  draft?: unknown;
  /** export_run: the spreadsheet handed out */
  file?: { url: string; filename: string; format: "csv" | "xlsx"; rows: number; run_id: string };
  /** set by a re-run from the pane: the tab this object replaces */
  replaces?: string;
};

export async function createConversation(workspaceId: string, title: string, userId: string | null, decisionId: string | null = null): Promise<ConversationRow> {
  const rows = (await sql.query("insert into conversations (workspace_id, user_id, title, decision_id) values ($1, $2, $3, $4) returning *", [workspaceId, userId, title.slice(0, 120), decisionId])) as ConversationRow[];
  return rows[0];
}

/** A conversation belongs to the user who started it; other accounts in the workspace never see it. */
export async function getConversation(id: string, workspaceId: string, userId: string | null): Promise<ConversationRow | null> {
  if (!userId) return null;
  const rows = (await sql.query("select * from conversations where id = $1 and workspace_id = $2 and user_id = $3", [id, workspaceId, userId])) as ConversationRow[];
  return rows[0] ?? null;
}

export async function listConversations(workspaceId: string, userId: string | null, limit = 12): Promise<ConversationRow[]> {
  if (!userId) return [];
  return (await sql.query("select * from conversations where workspace_id = $1 and user_id = $2 order by updated_at desc limit $3", [workspaceId, userId, limit])) as ConversationRow[];
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  return (await sql.query("select * from messages where conversation_id = $1 order by created_at asc, id asc", [conversationId])) as MessageRow[];
}

export async function addMessage(m: { conversationId: string; role: "user" | "assistant"; content: MessageRow["content_json"]; evidence?: Record<string, Evidence>; skillRunIds?: string[]; tokensIn?: number; tokensOut?: number }): Promise<MessageRow> {
  const rows = (await sql.query(
    `insert into messages (conversation_id, role, content_json, evidence_json, skill_run_ids, tokens_in, tokens_out)
     values ($1, $2, $3::jsonb, $4::jsonb, $5::uuid[], $6, $7) returning *`,
    [m.conversationId, m.role, JSON.stringify(m.content), m.evidence ? JSON.stringify(m.evidence) : null, m.skillRunIds ?? null, m.tokensIn ?? null, m.tokensOut ?? null],
  )) as MessageRow[];
  await sql.query("update conversations set updated_at = now() where id = $1", [m.conversationId]);
  return rows[0];
}

export type SkillRunRow = { id: string; skill: string; result: unknown; created_at: string; pane_state: PaneState | null; pane_title: string | null };

export async function getSkillRun(id: string, workspaceId: string): Promise<SkillRunRow | null> {
  const rows = (await sql.query("select id, skill, result, created_at, pane_state, pane_title from skill_runs where id = $1 and workspace_id = $2", [id, workspaceId])) as SkillRunRow[];
  return rows[0] ?? null;
}

/** The pane's view of each run in a thread, keyed by run id. */
export async function paneStates(runIds: string[], workspaceId: string): Promise<Record<string, PaneState>> {
  const ids = [...new Set(runIds)].filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (!ids.length) return {};
  const rows = (await sql.query("select id, pane_state from skill_runs where workspace_id = $1 and id = any($2::uuid[]) and pane_state is not null", [workspaceId, ids])) as { id: string; pane_state: PaneState }[];
  return Object.fromEntries(rows.map((r) => [r.id, r.pane_state]));
}

export async function setPaneState(id: string, workspaceId: string, state: PaneState): Promise<boolean> {
  const rows = (await sql.query("update skill_runs set pane_state = $3::jsonb where id = $1 and workspace_id = $2 returning id", [id, workspaceId, JSON.stringify(state)])) as { id: string }[];
  return rows.length > 0;
}

export async function logExport(e: { workspaceId: string; skillRunId: string; userId: string | null; format: string; rows: number }): Promise<void> {
  await sql.query("insert into exports (workspace_id, skill_run_id, user_id, format, rows) values ($1, $2, $3, $4, $5)", [e.workspaceId, e.skillRunId, e.userId, e.format, e.rows]);
}

/** Runs referenced anywhere in a conversation, newest first, so "export the list" can default to the latest table. */
export async function conversationRunIds(conversationId: string): Promise<string[]> {
  const rows = (await sql.query("select skill_run_ids from messages where conversation_id = $1 and skill_run_ids is not null order by created_at desc", [conversationId])) as { skill_run_ids: string[] }[];
  return rows.flatMap((r) => [...r.skill_run_ids].reverse());
}
