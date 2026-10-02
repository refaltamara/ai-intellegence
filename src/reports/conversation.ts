/**
 * A report from a whole conversation (DECISIONS, 1 Oct 2026). "Turn into a
 * report" used to keep only the last analysis; now the report carries every
 * question, CeMO's answer, the tables and charts behind it and the evidence it
 * cited, under a summary of key findings and next steps. The summary is written
 * by the model from the answers only, and every number in it must already be in
 * the conversation (an answer or a result row); otherwise, or without a model,
 * the summary is the lead sentence of each answer.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, describeModelError, toolAnswer } from "../chat/client";
import { rewriteCitations } from "../chat/evidence";
import { hasModelCredentials, modelId } from "../chat/loop";
import { getConversation, listMessages, type MessageRow, type ToolCallRecord } from "../chat/persist";
import { numbersIn } from "../competitor/narrative";
import { sql } from "../db/client";
import { toJson } from "../db/json";
import type { Evidence } from "../skills/types";
import type { ReportRow } from "./store";

export type ConversationTool = { title: string; status: string; message?: string; rows: Record<string, unknown>[]; rows_total: number; chart: unknown | null; data_window: { from: string; to: string } | null; caveats: string[] };
export type ConversationSection = { question: string; context?: string; answer: string; tools: ConversationTool[] };
export type ConversationBlocks = {
  kind: "conversation";
  conversation_id: string;
  summary: { findings: string[]; actions: string[]; by: "model" | "fallback"; problems: string[] };
  sections: ConversationSection[];
  evidence: Evidence[];
  data_window: { from: string; to: string } | null;
  questions: number;
  analyses: number;
};

const SKIP_TOOLS = new Set(["export_run", "create_agent_draft"]);
const ROWS_KEPT = 12;
const EV = /<ev id="(ev_\d+)"><\/ev>/g;

/** Questions and answers in order: a visible user message opens a section; pane actions and their replies join the open one. */
export function sectionsOf(messages: MessageRow[]): ConversationSection[] {
  const out: ConversationSection[] = [];
  for (const m of messages) {
    const c = m.content_json ?? { text: "" };
    if (m.role === "user") {
      if (c.hidden && out.length) continue;
      const ctx = c.context as { label?: string; title?: string } | undefined;
      out.push({ question: (c.text ?? "").trim(), context: ctx ? String(ctx.label ?? ctx.title ?? "") || undefined : undefined, answer: "", tools: [] });
      continue;
    }
    if (!out.length) out.push({ question: "", answer: "", tools: [] });
    const s = out[out.length - 1];
    const text = (c.text ?? "").replace(/<\/?counter>/g, "").trim();
    if (text) s.answer = s.answer ? `${s.answer}\n\n${text}` : text;
    for (const t of (c.tools ?? []) as ToolCallRecord[]) {
      if (SKIP_TOOLS.has(t.name)) continue;
      const meta = (t.meta ?? {}) as { data_window?: { from: string; to: string }; caveats?: string[] };
      s.tools.push({ title: t.title ?? "Analysis", status: t.status, message: t.message, rows: (t.rows ?? []).slice(0, ROWS_KEPT), rows_total: (t.rows ?? []).length, chart: t.chart ?? null, data_window: meta.data_window ?? null, caveats: meta.caveats ?? [] });
    }
  }
  return out.filter((s) => s.answer || s.tools.length);
}

/** Every number the conversation already showed: in an answer, or in a result row. */
function numberPool(sections: ConversationSection[]) {
  const said = new Set<string>();
  const values: number[] = [];
  for (const s of sections) {
    for (const n of numbersIn(s.answer.replace(EV, " "))) said.add(`${n.value}|${n.unit}`);
    for (const t of s.tools) for (const r of t.rows) for (const v of Object.values(r)) if (typeof v === "number" && Number.isFinite(v)) values.push(v);
  }
  return { said, values };
}

function known(n: ReturnType<typeof numbersIn>[number], pool: ReturnType<typeof numberPool>): boolean {
  if (pool.said.has(`${n.value}|${n.unit}`)) return true;
  const scale = n.unit === "M" ? 1e6 : n.unit === "K" ? 1e3 : n.unit === "B" ? 1e9 : 1;
  const f = 10 ** n.decimals;
  return pool.values.some((v) => Math.round((Math.abs(v) / scale) * f) / f === n.value);
}

export function checkSummary(s: { findings: string[]; actions: string[] }, sections: ConversationSection[]): string[] {
  const pool = numberPool(sections);
  const problems: string[] = [];
  [...s.findings.map((t, i) => [`findings[${i}]`, t] as const), ...s.actions.map((t, i) => [`actions[${i}]`, t] as const)].forEach(([where, text]) => {
    for (const n of numbersIn(text.replace(EV, " "))) if (!known(n, pool)) problems.push(`${where}: "${n.raw}" is not a number in this conversation`);
  });
  return problems;
}

/** The lead sentence of each answer: the summary when the model is not there or its draft does not check out. */
/** a scope line ("TikTok, last 90 days, ranked by views, excluding …") says what was read, not what was found */
const SCOPE = /^(tiktok|instagram|nano|micro|mid|macro|mega|all|both)\b.*\b(last \d+ days|ranked by|excluding|window|combined)\b/i;

export function plainSummary(sections: ConversationSection[]): { findings: string[]; actions: string[] } {
  const findings = sections
    .map((s) => s.answer.split("\n").map((l) => l.trim()).find((l) => l && !/^[-•*]/.test(l) && !SCOPE.test(l)) ?? "")
    .map((l) => { const m = /^(.+?[.!?])(\s|$)/.exec(l); return (m ? m[1] : l).trim(); })
    .filter(Boolean)
    .slice(0, 6);
  return { findings, actions: [] };
}

const TOOL: Anthropic.Tool = {
  name: "write_chat_report",
  description: "Write the summary of a report made from a conversation.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "The report's title, at most 10 words: what was found, not 'Report'." },
      findings: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" }, description: "Key findings, one sentence each, most important first, citing evidence ids [ev_03] where the answers did." },
      actions: { type: "array", maxItems: 4, items: { type: "string" }, description: "What the team should do next, one sentence each, specific (who, what, when). Empty when the conversation gives no basis." },
    },
    required: ["title", "findings", "actions"],
  },
} as Anthropic.Tool;

async function writeSummary(sections: ConversationSection[], evidenceIds: Set<string>): Promise<{ title: string | null; findings: string[]; actions: string[]; by: "model" | "fallback"; problems: string[] }> {
  const plain = plainSummary(sections);
  if (!hasModelCredentials()) return { title: null, ...plain, by: "fallback", problems: ["the model is not configured"] };
  const transcript = sections.map((s, i) => `Q${i + 1}: ${s.question}\nA${i + 1}: ${s.answer}${s.tools.length ? `\nResults: ${s.tools.map((t) => `${t.title} (${t.rows_total} rows; first rows ${JSON.stringify(t.rows.slice(0, 5))})`).join("; ")}` : ""}`).join("\n\n");
  let messages: Anthropic.MessageParam[] = [{ role: "user", content: `Summarise this conversation as a report for a brand's marketing team. Use only numbers that appear in the answers or result rows, written the same way. Plain English, no filler.\n\n${transcript.slice(0, 60_000)}` }];
  let problems: string[] = [];
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const client = anthropicClient();
      const answered = await toolAnswer((req) => client.messages.create(req), { model: modelId(), max_tokens: 6000, tools: [TOOL], messages }, TOOL.name);
      const { res, use } = answered;
      messages = answered.messages;
      if (!use) break;
      const o = use.input as { title?: unknown; findings?: unknown; actions?: unknown };
      const clean = (a: unknown) => (Array.isArray(a) ? a.map((x) => rewriteCitations(String(x), evidenceIds).text.trim()).filter(Boolean) : []);
      const draft = { findings: clean(o.findings).slice(0, 6), actions: clean(o.actions).slice(0, 4) };
      problems = checkSummary(draft, sections);
      if (!problems.length && draft.findings.length) return { title: typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 100) : null, ...draft, by: "model", problems: [] };
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: use.id, is_error: true, content: `Rejected: ${problems.join("; ") || "no findings"}. Write it again with only numbers from the conversation.` }] });
    }
  } catch (e) {
    problems = [`model error: ${describeModelError(e)}`];
  }
  return { title: null, ...plain, by: "fallback", problems };
}

function markdown(title: string, b: ConversationBlocks): string {
  const strip = (t: string) => t.replace(EV, (_m, id) => `[${id}]`);
  const lines = [`# ${title}`, "", "## Key findings", ...b.summary.findings.map((f) => `- ${strip(f)}`)];
  if (b.summary.actions.length) lines.push("", "## What to do next", ...b.summary.actions.map((a) => `- ${strip(a)}`));
  b.sections.forEach((s, i) => {
    lines.push("", `## ${i + 1}. ${s.question || "Answer"}`, "", strip(s.answer));
    for (const t of s.tools) lines.push("", `_${t.title}: ${t.rows_total} rows${t.data_window ? `, ${t.data_window.from} to ${t.data_window.to}` : ""}_`);
  });
  if (b.evidence.length) lines.push("", "## Evidence", ...b.evidence.map((e) => `- [${e.id}] ${e.label}${e.url ? ` ${e.url}` : ""}`));
  return lines.join("\n");
}

/** Build and store the report for one of the user's conversations. */
export async function createConversationReport(o: { workspaceId: string; userId: string | null; conversationId: string; title?: string }): Promise<ReportRow | { error: string; status: number }> {
  const conv = await getConversation(o.conversationId, o.workspaceId, o.userId);
  if (!conv) return { error: "conversation not found", status: 404 };
  const messages = await listMessages(conv.id);
  const sections = sectionsOf(messages);
  if (!sections.length) return { error: "Nothing to report on yet: ask a question first.", status: 400 };
  const evidence = new Map<string, Evidence>();
  for (const m of messages) for (const [id, e] of Object.entries(m.evidence_json ?? {})) evidence.set(id, e);
  const cited = new Set<string>();
  for (const s of sections) for (const m of s.answer.matchAll(EV)) cited.add(m[1]);
  const summary = await writeSummary(sections, new Set(evidence.keys()));
  for (const t of [...summary.findings, ...summary.actions]) for (const m of t.matchAll(EV)) cited.add(m[1]);
  const windows = sections.flatMap((s) => s.tools.map((t) => t.data_window)).filter((w): w is { from: string; to: string } => !!w);
  const blocks: ConversationBlocks = {
    kind: "conversation",
    conversation_id: conv.id,
    summary: { findings: summary.findings, actions: summary.actions, by: summary.by, problems: summary.problems },
    sections,
    evidence: [...cited].map((id) => evidence.get(id)).filter((e): e is Evidence => !!e),
    data_window: windows.length ? { from: windows.map((w) => w.from).sort()[0], to: windows.map((w) => w.to).sort().pop()! } : null,
    questions: sections.filter((s) => s.question).length,
    analyses: sections.reduce((a, s) => a + s.tools.length, 0),
  };
  const title = (o.title ?? summary.title ?? conv.title ?? sections[0].question ?? "Report from Chats").slice(0, 120);
  const rows = (await sql.query(
    "insert into reports (workspace_id, title, source, skill_run_id, agent_run_id, body_md, blocks) values ($1, $2, 'ask', null, null, $3, $4::jsonb) returning *",
    [o.workspaceId, title, markdown(title, blocks), toJson(blocks)],
  )) as ReportRow[];
  return rows[0];
}
