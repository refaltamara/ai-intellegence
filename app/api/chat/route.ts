import { runChatTurn, type ChatEvent } from "@/chat/loop";
import { currentSession } from "@/auth/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST { message, conversation_id? } -> SSE stream of ChatEvent */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { message?: string; conversation_id?: string | null; attachment_ids?: string[] };
  const session = await currentSession();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      try {
        await runChatTurn({ userText: body.message ?? "", conversationId: body.conversation_id ?? null, userId: session?.uid ?? null, attachmentIds: Array.isArray(body.attachment_ids) ? body.attachment_ids : [] }, send);
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
