/**
 * Document upload for Ask. Accepts one PDF per request as multipart/form-data,
 * stores it against the signed-in user, and returns its id and metadata. The id
 * is passed with the next chat message, which binds it to the conversation.
 */
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { currentSession } from "@/auth/current";
import { attachmentError, deleteAttachment, saveAttachment, MAX_ATTACHMENT_BYTES } from "@/chat/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "no file" }, { status: 400 });

  const bad = attachmentError({ size: file.size, type: file.type, name: file.name });
  if (bad) return Response.json({ error: bad }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_ATTACHMENT_BYTES) return Response.json({ error: "file too large" }, { status: 413 });
  // PDFs start with %PDF-; reject anything mislabelled by the browser
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return Response.json({ error: `${file.name} is not a readable PDF.` }, { status: 400 });

  try {
    const row = await saveAttachment({
      workspaceId: DEFAULT_WORKSPACE_ID,
      userId: session.uid,
      filename: file.name,
      mediaType: "application/pdf",
      data: buf.toString("base64"),
      bytes: buf.byteLength,
    });
    return Response.json({ id: row.id, filename: row.filename, bytes: row.bytes, media_type: row.media_type });
  } catch (e) {
    return Response.json({ error: `Could not store ${file.name}: ${(e as Error).message.slice(0, 160)}` }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  return Response.json({ removed: await deleteAttachment(id, session.uid) });
}
