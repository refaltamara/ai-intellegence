import { runChatTurn, type ChatEvent } from "@/chat/loop";
import { currentSession } from "@/auth/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST { message, conversation_id? } -> SSE stream of ChatEvent */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { message?: string; conversation_id?: string | null; attachment_ids?: string[]; followup?: { label: string; skill: string; params?: Record<string, unknown> }; decision_id?: string | null; pane_action?: { run_id?: string; action?: string; ids?: unknown; params?: unknown; human?: string } };
  const session = await currentSession();
  const encoder = new TextEncoder();
  const pa = body.pane_action;
  const ACTIONS = ["exclude_rows", "include_rows", "clear_exclusions", "set_params"] as const;
  const paneAction = pa && typeof pa.run_id === "string" && (ACTIONS as readonly string[]).includes(String(pa.action))
    ? { run_id: pa.run_id, action: pa.action as (typeof ACTIONS)[number], ids: Array.isArray(pa.ids) ? pa.ids.filter((x): x is string => typeof x === "string").slice(0, 5000) : undefined, params: pa.params && typeof pa.params === "object" ? (pa.params as Record<string, unknown>) : undefined, human: String(pa.human ?? "You changed the list").slice(0, 200) }
    : undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      try {
        await runChatTurn({ userText: body.message ?? "", conversationId: body.conversation_id ?? null, userId: session?.uid ?? null, attachmentIds: Array.isArray(body.attachment_ids) ? body.attachment_ids : [], followup: body.followup && typeof body.followup === "object" ? body.followup : undefined, decisionId: body.decision_id && /^[0-9a-f-]{36}$/.test(body.decision_id) ? body.decision_id : null, paneAction }, send);
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
