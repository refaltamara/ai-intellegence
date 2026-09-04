/**
 * Documents attached to a conversation (client briefs, competitor decks).
 *
 * A document supplies context and parameters — which brands, which window, which
 * themes to look for — never facts. Numbers read from a document are never turned
 * into evidence; the answer still comes from the database. See src/chat/system.md.
 */
import { sql } from "../db/client";

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 3;
export const ALLOWED_MEDIA_TYPES = ["application/pdf"] as const;

export type AttachmentRow = { id: string; workspace_id: string; conversation_id: string | null; user_id: string | null; filename: string; media_type: string; bytes: number; created_at: string };
export type AttachmentWithData = AttachmentRow & { data: string };

const META = "id, workspace_id, conversation_id, user_id, filename, media_type, bytes, created_at";

export function attachmentError(file: { size: number; type: string; name: string }): string | null {
  if (!ALLOWED_MEDIA_TYPES.includes(file.type as (typeof ALLOWED_MEDIA_TYPES)[number])) {
    return `${file.name || "That file"} is ${file.type || "an unknown type"}; only PDF is supported. Export a deck or brief to PDF first.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

export async function saveAttachment(a: { workspaceId: string; userId: string | null; filename: string; mediaType: string; data: string; bytes: number }): Promise<AttachmentRow> {
  const rows = (await sql.query(
    `insert into attachments (workspace_id, user_id, filename, media_type, bytes, data)
     values ($1, $2, $3, $4, $5, $6) returning ${META}`,
    [a.workspaceId, a.userId, a.filename.slice(0, 200), a.mediaType, a.bytes, a.data],
  )) as AttachmentRow[];
  return rows[0];
}

/** Attachments the user owns and has not yet bound to a conversation. */
export async function claimAttachments(ids: string[], conversationId: string, workspaceId: string, userId: string | null): Promise<AttachmentRow[]> {
  if (!ids.length || !userId) return [];
  const rows = (await sql.query(
    `update attachments set conversation_id = $1
     where id = any($2::uuid[]) and workspace_id = $3 and user_id = $4 and conversation_id is null
     returning ${META}`,
    [conversationId, ids.slice(0, MAX_ATTACHMENTS_PER_MESSAGE), workspaceId, userId],
  )) as AttachmentRow[];
  return rows;
}

/** Full documents for a conversation, oldest first, for replay into the model. */
export async function conversationAttachments(conversationId: string): Promise<AttachmentWithData[]> {
  return (await sql.query(
    `select ${META}, data from attachments where conversation_id = $1 order by created_at asc limit 12`,
    [conversationId],
  )) as AttachmentWithData[];
}

/** Metadata only, for rendering the thread. */
export async function conversationAttachmentMeta(conversationId: string): Promise<AttachmentRow[]> {
  return (await sql.query(`select ${META} from attachments where conversation_id = $1 order by created_at asc`, [conversationId])) as AttachmentRow[];
}

export async function deleteAttachment(id: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const rows = (await sql.query("delete from attachments where id = $1 and user_id = $2 returning id", [id, userId])) as { id: string }[];
  return rows.length > 0;
}
