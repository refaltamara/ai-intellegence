/** Conversations and messages (PRD §5.5) over the Neon HTTP client. */
import { sql } from "../db/client";
import type { Evidence } from "../skills/types";

export type ConversationRow = { id: string; workspace_id: string; user_id: string | null; title: string | null; created_at: string; updated_at: string };
export type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content_json: { text: string; tools?: ToolCallRecord[]; draft?: unknown; error?: string };
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
};

export async function createConversation(workspaceId: string, title: string, userId: string | null): Promise<ConversationRow> {
  const rows = (await sql.query("insert into conversations (workspace_id, user_id, title) values ($1, $2, $3) returning *", [workspaceId, userId, title.slice(0, 120)])) as ConversationRow[];
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

export async function getSkillRun(id: string, workspaceId: string): Promise<{ id: string; skill: string; result: unknown; created_at: string } | null> {
  const rows = (await sql.query("select id, skill, result, created_at from skill_runs where id = $1 and workspace_id = $2", [id, workspaceId])) as { id: string; skill: string; result: unknown; created_at: string }[];
  return rows[0] ?? null;
}
