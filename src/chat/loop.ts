/**
 * The Ask chat loop (PRD §5.1). One turn: build history, call Claude with the
 * three tools (streaming), run tools server-side, rewrite evidence citations,
 * persist the assistant message. Emits events the SSE route forwards to the UI.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import { queryMetrics, type QueryMetricsInput } from "../query/builder";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { runSkill } from "../skills/runner";
import type { Evidence, SkillResult } from "../skills/types";
import { CitationStream, renumberEvidence } from "./evidence";
import { addMessage, createConversation, getConversation, listMessages, type ToolCallRecord } from "./persist";
import { buildTools } from "./tools";

export const MAX_TOOL_CALLS = 6;
const MAX_ROWS_IN_CONTEXT = 60;
const MAX_HISTORY_MESSAGES = 20;

export type ChatEvent =
  | { type: "conversation"; id: string; title: string | null }
  | { type: "text"; text: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool: ToolCallRecord; evidence: Evidence[] }
  | { type: "done"; message_id: string; evidence: Record<string, Evidence>; evidence_miss: number; tokens_in: number; tokens_out: number; stop_reason: string | null }
  | { type: "error"; message: string };

export type ChatTurnInput = { workspaceId?: string; conversationId?: string | null; userText: string; userId?: string | null };

const SYSTEM_TEMPLATE = readFileSync(path.join(process.cwd(), "src/chat/system.md"), "utf8");

export function modelId(): string {
  return process.env.ANTHROPIC_MODEL_CHAT || "claude-sonnet-5";
}

export function hasModelCredentials(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

async function buildSystem(workspaceId: string): Promise<string> {
  const db = new SkillDb();
  const ctx = await loadContext(db, workspaceId);
  const ws = await db.one<{ name: string }>("select name from workspaces where id = $1", [workspaceId]);
  const platforms = await db.q<{ platform: string; posts: number; from: string; to: string }>(
    "select platform, count(*)::int as posts, to_char(min(posted_at at time zone $2), 'DD Mon YYYY') as from, to_char(max(posted_at at time zone $2), 'DD Mon YYYY') as to from posts where workspace_id = $1 group by 1 order by 1",
    [workspaceId, ctx.tz],
  );
  const client = ctx.clientBrandId ? ctx.brands.find((b) => b.id === ctx.clientBrandId) : null;
  return SYSTEM_TEMPLATE.replace("{{workspace_name}}", ws?.name ?? workspaceId)
    .replace("{{client_line}}", client ? `The client brand is ${client.name} (${client.id}); the other tracked brands are competitors.` : "This workspace has no client brand yet: every tracked brand is a competitor and there is no 'your brand'. If the user says 'my brand', ask which brand they mean.")
    .replace("{{data_line}}", platforms.map((p) => `${p.platform} ${p.posts.toLocaleString("en-US")} posts from ${p.from} to ${p.to}`).join("; ") + ". No comment text, no day-by-day snapshots, no Threads/X.")
    .replace("{{as_of}}", ctx.asOf)
    .replace("{{brands}}", ctx.brands.map((b) => `${b.id} (${b.name})`).join(", "));
}

function trimForModel(result: SkillResult, evidence: Evidence[]) {
  return {
    skill: result.skill,
    status: result.status,
    message: result.message,
    params_resolved: result.params_resolved,
    summary: result.summary,
    rows: result.rows.slice(0, MAX_ROWS_IN_CONTEXT),
    rows_total: result.rows.length,
    chart: result.chart ? { type: result.chart.type, x: result.chart.x, series: result.chart.series.map((s) => s.name), note: "chart is rendered in the UI" } : undefined,
    evidence: evidence.map((e) => ({ id: e.id, type: e.type, label: e.label, url: e.url, metrics: e.metrics, sample_text: e.sample_text?.slice(0, 120) })),
    meta: { matched: result.meta.matched, returned: result.meta.returned, data_window: result.meta.data_window, freshness: result.meta.freshness, caveats: result.meta.caveats },
    run_id: result.run_id,
  };
}

export async function runChatTurn(input: ChatTurnInput, emit: (e: ChatEvent) => void | Promise<void>): Promise<void> {
  const workspaceId = input.workspaceId || DEFAULT_WORKSPACE_ID;
  const userText = input.userText.trim();
  if (!userText) {
    await emit({ type: "error", message: "Empty message" });
    return;
  }
  let conversation = input.conversationId ? await getConversation(input.conversationId, workspaceId) : null;
  if (!conversation) conversation = await createConversation(workspaceId, userText.replace(/\s+/g, " ").slice(0, 80), input.userId ?? null);
  await emit({ type: "conversation", id: conversation.id, title: conversation.title });

  const history = await listMessages(conversation.id);
  await addMessage({ conversationId: conversation.id, role: "user", content: { text: userText } });

  // Evidence from earlier turns stays citable (ids are per turn, so latest wins on collision).
  const known = new Map<string, Evidence>();
  for (const m of history) if (m.evidence_json) for (const [id, ev] of Object.entries(m.evidence_json)) known.set(id, ev);

  if (!hasModelCredentials()) {
    const msg = "The chat model is not configured (ANTHROPIC_API_KEY is missing). Skills still work from the Skills page and the CLI.";
    await addMessage({ conversationId: conversation.id, role: "assistant", content: { text: msg, error: "no_credentials" } });
    await emit({ type: "error", message: msg });
    return;
  }

  const client = new Anthropic();
  const system = await buildSystem(workspaceId);
  const tools = buildTools();
  const messages: Anthropic.MessageParam[] = [];
  for (const m of history.slice(-MAX_HISTORY_MESSAGES)) {
    const text = m.content_json?.text ?? "";
    if (!text) continue;
    messages.push({ role: m.role, content: text.replace(/<ev id="(ev_\d+)"><\/ev>/g, "[$1]") });
  }
  messages.push({ role: "user", content: userText });

  const turnEvidence = new Map<string, Evidence>();
  const counter = { n: 0 };
  const toolRecords: ToolCallRecord[] = [];
  const runIds: string[] = [];
  const cite = new CitationStream(new Set());
  const knownIds = () => new Set([...known.keys(), ...turnEvidence.keys()]);
  let fullText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let toolCalls = 0;
  let continued = false;
  let stopReason: string | null = null;
  let draft: unknown;

  const toolsWithCache = tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t));

  try {
    for (let iter = 0; iter < MAX_TOOL_CALLS + 2; iter++) {
      const stream = client.messages.stream({
        model: modelId(),
        max_tokens: 8000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: toolsWithCache,
        tool_choice: { type: "auto" },
        messages,
      });
      (cite as any).known = knownIds();
      stream.on("text", (delta) => {
        const out = cite.push(delta);
        if (out) {
          fullText += out;
          void emit({ type: "text", text: out });
        }
      });
      const message = await stream.finalMessage();
      const tail = cite.flush();
      if (tail) {
        fullText += tail;
        await emit({ type: "text", text: tail });
      }
      tokensIn += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
      tokensOut += message.usage.output_tokens;
      stopReason = message.stop_reason;

      if (message.stop_reason === "refusal") {
        const note = "\n\nI can't help with that request.";
        fullText += note;
        await emit({ type: "text", text: note });
        break;
      }
      if (message.stop_reason === "max_tokens" && !continued) {
        continued = true;
        messages.push({ role: "assistant", content: message.content });
        messages.push({ role: "user", content: "Continue from where you stopped; do not repeat yourself." });
        continue;
      }
      if (message.stop_reason !== "tool_use") break;

      const uses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: message.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of uses) {
        toolCalls += 1;
        if (toolCalls > MAX_TOOL_CALLS) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: `Tool budget for this turn (${MAX_TOOL_CALLS} calls) is exhausted. Answer with what you already have and say what is missing.`, is_error: true });
          continue;
        }
        await emit({ type: "tool_start", id: use.id, name: use.name, input: use.input });
        const record = await executeTool(use, workspaceId, counter, turnEvidence);
        toolRecords.push(record.record);
        if (record.record.run_id) runIds.push(record.record.run_id);
        if (record.record.draft) draft = record.record.draft;
        await emit({ type: "tool_result", tool: record.record, evidence: record.evidence });
        results.push({ type: "tool_result", tool_use_id: use.id, content: record.content, is_error: record.isError });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    const err = e as Error;
    const msg = e instanceof Anthropic.APIError ? `Model error ${e.status}: ${e.message}` : err.message;
    await emit({ type: "error", message: msg });
    fullText += `\n\n(${msg})`;
  }

  const evidenceMap: Record<string, Evidence> = {};
  for (const id of new Set(cite.cited)) {
    const ev = turnEvidence.get(id) ?? known.get(id);
    if (ev) evidenceMap[id] = ev;
  }
  // keep every evidence item produced this turn so result cards can expand it later
  for (const [id, ev] of turnEvidence) evidenceMap[id] = ev;
  const saved = await addMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: { text: fullText, tools: toolRecords, draft },
    evidence: evidenceMap,
    skillRunIds: runIds,
    tokensIn,
    tokensOut,
  });
  await emit({ type: "done", message_id: saved.id, evidence: evidenceMap, evidence_miss: cite.miss.length, tokens_in: tokensIn, tokens_out: tokensOut, stop_reason: stopReason });
}

async function executeTool(use: Anthropic.ToolUseBlock, workspaceId: string, counter: { n: number }, turnEvidence: Map<string, Evidence>): Promise<{ record: ToolCallRecord; evidence: Evidence[]; content: string; isError: boolean }> {
  const input = (use.input ?? {}) as Record<string, unknown>;
  const base: ToolCallRecord = { id: use.id, name: use.name, input, status: "ok" };
  try {
    if (use.name === "run_skill") {
      const skill = String(input.skill ?? "");
      const params = (input.params ?? {}) as Record<string, unknown>;
      const result = await runSkill({ skill, workspace_id: workspaceId, params, actor: { user_id: "chat", via: "chat" } });
      const re = renumberEvidence(result.evidence, result.rows, result.summary, counter);
      for (const ev of re.evidence) turnEvidence.set(ev.id, ev);
      const trimmed = trimForModel({ ...result, rows: re.rows, summary: re.summary }, re.evidence);
      const record: ToolCallRecord = { ...base, skill, status: result.status, message: result.message, run_id: result.run_id, summary: re.summary, rows: re.rows, chart: result.chart, meta: result.meta, params_resolved: result.params_resolved, diff_key: result.diff_key, evidence_ids: re.evidence.map((e) => e.id) };
      return { record, evidence: re.evidence, content: JSON.stringify(trimmed), isError: result.status === "error" };
    }
    if (use.name === "query_metrics") {
      const result = await queryMetrics(input as unknown as QueryMetricsInput, workspaceId);
      const re = renumberEvidence(result.evidence, result.rows, {}, counter);
      for (const ev of re.evidence) turnEvidence.set(ev.id, ev);
      const record: ToolCallRecord = { ...base, status: result.status, message: result.message, rows: re.rows, meta: result.meta, evidence_ids: re.evidence.map((e) => e.id) };
      const content = JSON.stringify({ status: result.status, message: result.message, rows: re.rows.slice(0, MAX_ROWS_IN_CONTEXT), rows_total: re.rows.length, evidence: re.evidence, meta: result.meta });
      return { record, evidence: re.evidence, content, isError: result.status === "error" };
    }
    if (use.name === "create_agent_draft") {
      const record: ToolCallRecord = { ...base, status: "ok", draft: input };
      return { record, evidence: [], content: JSON.stringify({ status: "ok", draft: input, note: "Draft shown to the user for editing; not created." }), isError: false };
    }
    return { record: { ...base, status: "error", message: `Unknown tool ${use.name}` }, evidence: [], content: `Unknown tool ${use.name}`, isError: true };
  } catch (e) {
    const message = (e as Error).message;
    return { record: { ...base, status: "error", message }, evidence: [], content: JSON.stringify({ status: "error", message }), isError: true };
  }
}
