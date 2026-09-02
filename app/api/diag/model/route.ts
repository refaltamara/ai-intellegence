/**
 * Model diagnostics (login-protected): one small request with the same client,
 * system prompt and tools as Ask. Shows the exact API error when the chat fails.
 */
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { anthropicClient, chatEffort, describeModelError } from "@/chat/client";
import { buildSystem, hasModelCredentials, modelId } from "@/chat/loop";
import { buildTools } from "@/chat/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const started = Date.now();
  const withTools = new URL(req.url).searchParams.get("tools") !== "0";
  const steps: Record<string, unknown> = { model: modelId(), effort: chatEffort(), credentials: hasModelCredentials(), workspace_header: !!process.env.ANTHROPIC_WORKSPACE_ID, with_tools: withTools };
  try {
    const t0 = Date.now();
    const system = await buildSystem(DEFAULT_WORKSPACE_ID);
    steps.system = { ok: true, chars: system.length, ms: Date.now() - t0 };
    const tools = buildTools();
    steps.tools = tools.map((t: any) => ({ name: t.name, strict: !!t.strict, schema_chars: JSON.stringify(t.input_schema).length }));
    const client = anthropicClient();
    const t1 = Date.now();
    const res = await client.messages.create({
      model: modelId(),
      max_tokens: 60,
      output_config: { effort: chatEffort() },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      ...(withTools ? { tools, tool_choice: { type: "auto" as const } } : {}),
      messages: [{ role: "user", content: "Reply with the single word OK and do not call any tool." }],
    });
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    steps.model_call = { ok: true, ms: Date.now() - t1, stop_reason: res.stop_reason, text: text.slice(0, 80), usage: res.usage };
    return Response.json({ ok: true, duration_ms: Date.now() - started, ...steps });
  } catch (e) {
    const err = e as Error & { status?: number; request_id?: string };
    steps.error = { message: describeModelError(e), raw: err.message?.slice(0, 600), status: err.status ?? null, request_id: (err as any).request_id ?? (err as any).requestID ?? null, stack: err.stack?.split("\n").slice(0, 4) };
    return Response.json({ ok: false, duration_ms: Date.now() - started, ...steps }, { status: 500 });
  }
}
