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
import { getSkill, skillNames } from "../skills/registry";
import { impls } from "../skills/index";
import { activityDone, activityStart, workspaceCounts } from "./activity";
import { anthropicClient, chatEffort, describeModelError } from "./client";
import { renumberEvidence } from "./evidence";
import { scrubMechanism } from "./leak";
import { AnswerStream, usableFollowups, type Followup } from "./stream";
import { decisionContext } from "../decisions/store";
import { claimAttachments, conversationAttachments, type AttachmentRow } from "./attachments";
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
  /** what CeMO is looking at while a tool runs; replaces the previous line */
  | { type: "activity"; tool_id: string; text: string; step: number; total: number; done: boolean }
  /** the one clarifying question; the turn ends here and the next user message answers it */
  | { type: "ask"; question: string; options: { label: string; value: string }[]; why: string }
  | { type: "followups"; items: Followup[] }
  | { type: "done"; message_id: string; evidence: Record<string, Evidence>; evidence_miss: number; tokens_in: number; tokens_out: number; stop_reason: string | null; timings: Timings }
  | { type: "error"; message: string };

export type Timings = { total_ms: number; model_ms: number; model_calls: number; tools_ms: number; tool_calls: number; setup_ms: number; effort: string };

export type ChatTurnInput = {
  workspaceId?: string;
  conversationId?: string | null;
  userText: string;
  userId?: string | null;
  attachmentIds?: string[];
  /** set when the user tapped a suggested follow-up; the model gets the exact analysis and parameters as a hint */
  followup?: { label: string; skill: string; params?: Record<string, unknown> };
  /** the decision a new thread belongs to; when absent a new decision is opened, named from the first message */
  decisionId?: string | null;
};

const SYSTEM_TEMPLATE = readFileSync(path.join(process.cwd(), "src/chat/system.md"), "utf8");

export function modelId(): string {
  return process.env.ANTHROPIC_MODEL_CHAT || "claude-sonnet-5";
}

export function hasModelCredentials(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SYSTEM_TTL_MS = 5 * 60 * 1000;
const systemCache = new Map<string, { text: string; at: number }>();

/** Drop the cached prompt, e.g. after the client brand changes. */
export function invalidateSystem(workspaceId?: string): void {
  if (workspaceId) systemCache.delete(workspaceId);
  else systemCache.clear();
}

/** System prompt per workspace, cached for five minutes: it only changes when data is loaded or the client brand changes. */
export async function buildSystem(workspaceId: string): Promise<string> {
  const hit = systemCache.get(workspaceId);
  if (hit && Date.now() - hit.at < SYSTEM_TTL_MS) return hit.text;
  const text = await buildSystemUncached(workspaceId);
  systemCache.set(workspaceId, { text, at: Date.now() });
  return text;
}

async function buildSystemUncached(workspaceId: string): Promise<string> {
  const db = new SkillDb();
  const ctx = await loadContext(db, workspaceId);
  const ws = await db.one<{ name: string }>("select name from workspaces where id = $1", [workspaceId]);
  const platforms = await db.q<{ platform: string; posts: number; from: string; to: string }>(
    "select platform, count(*)::int as posts, to_char(min(posted_at at time zone $2), 'DD Mon YYYY') as from, to_char(max(posted_at at time zone $2), 'DD Mon YYYY') as to from posts where workspace_id = $1 group by 1 order by 1",
    [workspaceId, ctx.tz],
  );
  const client = ctx.clientBrandId ? ctx.brands.find((b) => b.id === ctx.clientBrandId) : null;
  const counts = await workspaceCounts(workspaceId, db);
  const available = Object.keys(impls);
  return SYSTEM_TEMPLATE.replace("{{workspace_name}}", ws?.name ?? workspaceId)
    .replace("{{client_line}}", client ? `You work for the ${client.name} team (${client.id}): "we", "us" and "our brand" mean ${client.name}, and every other tracked brand is a competitor. Take ${client.name}'s side — a good result for a competitor is a warning for us, not good news.` : "No client brand is set yet, so every tracked brand is a competitor and there is no \"our brand\". If the person says \"my brand\" or \"us\", ask which brand they mean (once), then continue.")
    .replace("{{creator_count}}", counts.creator_count.toLocaleString("en-US"))
    .replace("{{available_skills}}", available.join(", "))
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
  let conversation = input.conversationId ? await getConversation(input.conversationId, workspaceId, input.userId ?? null) : null;
  // Chats are free-form and stay unattached; only a thread started inside a decision joins it.
  if (!conversation) conversation = await createConversation(workspaceId, userText.replace(/\s+/g, " ").slice(0, 80), input.userId ?? null, input.decisionId ?? null);
  await emit({ type: "conversation", id: conversation.id, title: conversation.title });
  // Bind any freshly uploaded documents to this conversation before the turn runs.
  const claimed = await claimAttachments(input.attachmentIds ?? [], conversation.id, workspaceId, input.userId ?? null).catch(() => [] as AttachmentRow[]);
  try {
    await runTurnBody(conversation, userText, emit, claimed, input.followup);
  } catch (e) {
    const message = describeModelError(e);
    console.error("chat turn failed:", conversation.id, message, (e as Error).stack?.split("\n").slice(0, 3).join(" | "));
    await addMessage({ conversationId: conversation.id, role: "assistant", content: { text: "", error: message } }).catch(() => undefined);
    await emit({ type: "error", message });
  }
}

/** The user turn for the model: any attached documents first, then the text.
 *  The last document carries the cache breakpoint so follow-up questions about
 *  the same brief re-read it from cache instead of re-paying for it. */
export function userTurn(userText: string, docs: { filename: string; data: string }[], answersAsk: string | null = null): Anthropic.MessageParam {
  if (!docs.length && !answersAsk) return { role: "user", content: userText };
  const blocks: Anthropic.ContentBlockParam[] = [];
  // an answer to a pending ask_user call must come first, as the tool_result for that call
  if (answersAsk) blocks.push({ type: "tool_result", tool_use_id: answersAsk, content: userText });
  blocks.push(...docs.map((d, i): Anthropic.ContentBlockParam => ({
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: d.data },
    title: d.filename,
    ...(i === docs.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
  })));
  blocks.push({ type: "text", text: userText });
  return { role: "user", content: blocks };
}

/** Replay persisted history for the model. Plain turns become text; an assistant turn that
 *  ended on ask_user is replayed as its tool_use, and the user turn after it as the tool_result. */
export function historyTurns(history: { role: "user" | "assistant"; content_json: { text: string; ask?: { tool_use_id: string; question: string; options: unknown; why: string } } }[]): { messages: Anthropic.MessageParam[]; pendingAsk: string | null } {
  const messages: Anthropic.MessageParam[] = [];
  let pendingAsk: string | null = null;
  const plain = (t: string) => t.replace(/<ev id="(ev_\d+)"><\/ev>/g, "[$1]");
  for (const m of history) {
    const text = m.content_json?.text ?? "";
    if (m.role === "assistant" && m.content_json?.ask) {
      const a = m.content_json.ask;
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (text.trim()) blocks.push({ type: "text", text: plain(text) });
      blocks.push({ type: "tool_use", id: a.tool_use_id, name: "ask_user", input: { question: a.question, options: a.options, why: a.why } });
      messages.push({ role: "assistant", content: blocks });
      pendingAsk = a.tool_use_id;
      continue;
    }
    if (!text) continue;
    if (m.role === "user" && pendingAsk) {
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: pendingAsk, content: text }, { type: "text", text }] });
      pendingAsk = null;
      continue;
    }
    messages.push({ role: m.role, content: plain(text) });
  }
  return { messages, pendingAsk };
}

async function runTurnBody(conversation: { id: string; workspace_id: string; decision_id?: string | null }, userText: string, emit: (e: ChatEvent) => void | Promise<void>, claimed: AttachmentRow[] = [], followup?: ChatTurnInput["followup"]): Promise<void> {
  const workspaceId = conversation.workspace_id;
  const history = await listMessages(conversation.id);
  await addMessage({
    conversationId: conversation.id,
    role: "user",
    content: { text: userText, ...(claimed.length ? { attachments: claimed.map((a) => ({ id: a.id, filename: a.filename, bytes: a.bytes })) } : {}) },
  });

  // Evidence from earlier turns stays citable (ids are per turn, so latest wins on collision).
  const known = new Map<string, Evidence>();
  for (const m of history) if (m.evidence_json) for (const [id, ev] of Object.entries(m.evidence_json)) known.set(id, ev);

  if (!hasModelCredentials()) {
    const msg = "The chat model is not configured (ANTHROPIC_API_KEY is missing). Analyses still run from the Skills page and the CLI.";
    await addMessage({ conversationId: conversation.id, role: "assistant", content: { text: msg, error: "no_credentials" } });
    await emit({ type: "error", message: msg });
    return;
  }

  const turnStart = Date.now();
  const client = anthropicClient();
  const [system, counts, decisionNote] = await Promise.all([buildSystem(workspaceId), workspaceCounts(workspaceId), conversation.decision_id ? decisionContext(conversation.decision_id, workspaceId).catch(() => "") : Promise.resolve("")]);
  const systemBlocks: Anthropic.TextBlockParam[] = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }, ...(decisionNote ? [{ type: "text" as const, text: decisionNote }] : [])];
  const tools = buildTools();
  const timings: Timings = { total_ms: 0, model_ms: 0, model_calls: 0, tools_ms: 0, tool_calls: 0, setup_ms: Date.now() - turnStart, effort: chatEffort() };

  const replay = historyTurns(history.slice(-MAX_HISTORY_MESSAGES) as Parameters<typeof historyTurns>[0]);
  const messages: Anthropic.MessageParam[] = replay.messages;

  // Documents attached anywhere in this conversation ride on the current user turn,
  // cached so follow-up questions about the same brief do not re-pay for it.
  const docs = await conversationAttachments(conversation.id).catch(() => []);
  // A tapped follow-up carries the exact analysis; the person only ever sees the label.
  const modelText = followup?.skill
    ? `${userText}\n\n(The person tapped the suggestion "${followup.label}". Use the analysis "${followup.skill}"${followup.params ? ` with these parameters unless they changed the request: ${JSON.stringify(followup.params)}` : ""}.)`
    : userText;
  messages.push(userTurn(modelText, docs, replay.pendingAsk));

  const turnEvidence = new Map<string, Evidence>();
  const counter = { n: 0 };
  const toolRecords: ToolCallRecord[] = [];
  const runIds: string[] = [];
  const answer = new AnswerStream(new Set());
  const knownIds = () => new Set([...known.keys(), ...turnEvidence.keys()]);
  let fullText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let toolCalls = 0;
  let continued = false;
  let stopReason: string | null = null;
  let draft: unknown;
  let ask: NonNullable<Parameters<typeof addMessage>[0]["content"]["ask"]> | undefined;

  const toolsWithCache = tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t));

  try {
    for (let iter = 0; iter < MAX_TOOL_CALLS + 2; iter++) {
      const callStart = Date.now();
      const stream = client.messages.stream({
        model: modelId(),
        max_tokens: 8000,
        output_config: { effort: chatEffort() },
        system: systemBlocks,
        tools: toolsWithCache,
        tool_choice: { type: "auto" },
        messages,
      });
      answer.known = knownIds();
      stream.on("text", (delta) => {
        const out = answer.push(delta);
        if (out) {
          fullText += out;
          void emit({ type: "text", text: out });
        }
      });
      const message = await stream.finalMessage();
      timings.model_ms += Date.now() - callStart;
      timings.model_calls += 1;
      const tail = answer.flush();
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
        if (use.name === "ask_user") {
          // The turn ends on the question; the next user message answers it (PRD-v2 §5.1).
          const inp = (use.input ?? {}) as { question?: string; options?: { label: string; value: string }[]; why?: string };
          const options = (Array.isArray(inp.options) ? inp.options : []).filter((o) => o && o.label && o.value != null).slice(0, 4);
          if (options.length >= 2 && inp.question) {
            ask = { tool_use_id: use.id, question: String(inp.question), options: options.map((o) => ({ label: String(o.label), value: String(o.value) })), why: String(inp.why ?? "") };
            await emit({ type: "ask", question: ask.question, options: ask.options, why: ask.why });
          } else {
            results.push({ type: "tool_result", tool_use_id: use.id, content: "A question needs 2 to 4 options. Either ask again with options or make a sensible choice and continue.", is_error: true });
          }
          continue;
        }
        await emit({ type: "tool_start", id: use.id, name: use.name, input: use.input });
        const toolStart = Date.now();
        const stopActivity = use.name === "run_skill" ? startActivity(use, counts, emit) : () => undefined;
        const record = await executeTool(use, workspaceId, counter, turnEvidence);
        stopActivity();
        if (use.name === "run_skill" && record.result) {
          await emit({ type: "activity", tool_id: use.id, text: activityDone(getSkill(String((use.input as any)?.skill ?? "")), record.result, counts), step: 0, total: 0, done: true });
        }
        timings.tools_ms += Date.now() - toolStart;
        timings.tool_calls += 1;
        toolRecords.push(record.record);
        if (record.record.run_id) runIds.push(record.record.run_id);
        if (record.record.draft) draft = record.record.draft;
        await emit({ type: "tool_result", tool: record.record, evidence: record.evidence });
        results.push({ type: "tool_result", tool_use_id: use.id, content: record.content, is_error: record.isError });
      }
      if (ask) break; // do not continue the loop; the person answers first
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    const msg = describeModelError(e);
    console.error("chat model loop error:", conversation.id, msg, (e as any)?.request_id ?? "");
    await emit({ type: "error", message: msg });
    fullText += `\n\n(${msg})`;
  }

  // Never let the mechanism show: strip slashed skill names, count anything else.
  const scrubbed = scrubMechanism(fullText, skillNames());
  fullText = scrubbed.text;
  if (scrubbed.leaks.length) console.warn(`mechanism_leak ${conversation.id}: ${scrubbed.leaks.join(", ")}`);
  const followups = usableFollowups(answer.followups, new Set(Object.keys(impls)));
  if (followups.length && !ask) await emit({ type: "followups", items: followups });

  const evidenceMap: Record<string, Evidence> = {};
  for (const id of new Set(answer.cited)) {
    const ev = turnEvidence.get(id) ?? known.get(id);
    if (ev) evidenceMap[id] = ev;
  }
  // keep every evidence item produced this turn so result cards can expand it later
  for (const [id, ev] of turnEvidence) evidenceMap[id] = ev;
  const saved = await addMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: { text: fullText, tools: toolRecords, draft, ...(ask ? { ask } : {}), ...(followups.length && !ask ? { followups } : {}), ...(answer.hasCounter ? { has_counter: true } : {}), ...(scrubbed.leaks.length ? { mechanism_leak: scrubbed.leaks } : {}) },
    evidence: evidenceMap,
    skillRunIds: runIds,
    tokensIn,
    tokensOut,
  });
  timings.total_ms = Date.now() - turnStart;
  console.log(`chat turn ${conversation.id}: ${timings.total_ms}ms total, model ${timings.model_ms}ms/${timings.model_calls} calls, tools ${timings.tools_ms}ms/${timings.tool_calls}, setup ${timings.setup_ms}ms, effort ${timings.effort}, tokens ${tokensIn}/${tokensOut}${ask ? ", ended on a question" : ""}${answer.hasCounter ? ", counter" : ""}`);
  await emit({ type: "done", message_id: saved.id, evidence: evidenceMap, evidence_miss: answer.miss.length, tokens_in: tokensIn, tokens_out: tokensOut, stop_reason: stopReason, timings });
}

/** Emit the skill's activity lines while it runs: start now, then one step every ~700 ms until stopped. */
function startActivity(use: Anthropic.ToolUseBlock, counts: Awaited<ReturnType<typeof workspaceCounts>>, emit: (e: ChatEvent) => void | Promise<void>): () => void {
  const def = getSkill(String((use.input as any)?.skill ?? ""));
  const a = activityStart(def, counts);
  const total = a.steps.length + 1;
  void emit({ type: "activity", tool_id: use.id, text: a.start, step: 1, total, done: false });
  let i = 0;
  const timer = setInterval(() => {
    if (i >= a.steps.length) { clearInterval(timer); return; }
    void emit({ type: "activity", tool_id: use.id, text: a.steps[i], step: i + 2, total, done: false });
    i += 1;
  }, 700);
  return () => clearInterval(timer);
}

async function executeTool(use: Anthropic.ToolUseBlock, workspaceId: string, counter: { n: number }, turnEvidence: Map<string, Evidence>): Promise<{ record: ToolCallRecord; evidence: Evidence[]; content: string; isError: boolean; result?: SkillResult }> {
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
      const record: ToolCallRecord = { ...base, skill, title: getSkill(skill)?.title ?? "Analysis", status: result.status, message: result.message, run_id: result.run_id, summary: re.summary, rows: re.rows, chart: result.chart, meta: result.meta, params_resolved: result.params_resolved, diff_key: result.diff_key, evidence_ids: re.evidence.map((e) => e.id) };
      return { record, evidence: re.evidence, content: JSON.stringify(trimmed), isError: result.status === "error", result };
    }
    if (use.name === "query_metrics") {
      const result = await queryMetrics(input as unknown as QueryMetricsInput, workspaceId);
      const re = renumberEvidence(result.evidence, result.rows, {}, counter);
      for (const ev of re.evidence) turnEvidence.set(ev.id, ev);
      const record: ToolCallRecord = { ...base, title: "The numbers", status: result.status, message: result.message, rows: re.rows, meta: result.meta, evidence_ids: re.evidence.map((e) => e.id) };
      const content = JSON.stringify({ status: result.status, message: result.message, rows: re.rows.slice(0, MAX_ROWS_IN_CONTEXT), rows_total: re.rows.length, evidence: re.evidence, meta: result.meta });
      return { record, evidence: re.evidence, content, isError: result.status === "error" };
    }
    if (use.name === "create_agent_draft") {
      const record: ToolCallRecord = { ...base, title: "Watch this", status: "ok", draft: input };
      return { record, evidence: [], content: JSON.stringify({ status: "ok", draft: input, note: "Draft shown to the user for editing; not created." }), isError: false };
    }
    return { record: { ...base, status: "error", message: `Unknown tool ${use.name}` }, evidence: [], content: `Unknown tool ${use.name}`, isError: true };
  } catch (e) {
    const message = (e as Error).message;
    return { record: { ...base, status: "error", message }, evidence: [], content: JSON.stringify({ status: "error", message }), isError: true };
  }
}
