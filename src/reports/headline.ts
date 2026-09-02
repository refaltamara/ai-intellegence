/**
 * Report headline (PRD §7): one non-streaming model call with the result JSON in
 * the user message and the same system rules as Ask; capped output. Falls back
 * to a deterministic headline when the model is not configured or fails.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Diff } from "../agents/diff";
import { anthropicClient, describeModelError } from "../chat/client";
import { rewriteCitations } from "../chat/evidence";
import { buildSystem, hasModelCredentials, modelId } from "../chat/loop";
import type { Evidence, SkillResult } from "../skills/types";
import { whatChangedLines } from "./render";

export type ReportSections = { headline: string; worth_acting_on: string | null; evidence_ids: string[]; evidence_miss: number; generated_by: "model" | "fallback" };

const TOOL: Anthropic.Tool = {
  name: "write_report",
  description: "Write the two prose sections of a Fair Intel report from the analysis result provided. headline: 3 to 4 sentences that lead with the answer and cite evidence ids inline like [ev_03]. worth_acting_on: optional, 1 to 2 sentences on what a marketer should do, or null when nothing is actionable. No headers, no bullet points, no numbers that are not in the result.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string" },
      worth_acting_on: { type: ["string", "null"] },
    },
    required: ["headline", "worth_acting_on"],
    additionalProperties: false,
  },
  strict: true,
} as Anthropic.Tool;

export function fallbackHeadline(result: SkillResult, diff: Diff | null): ReportSections {
  const s = result.summary as Record<string, unknown>;
  const parts: string[] = [];
  parts.push(`/${result.skill} over ${result.meta.data_window.from} to ${result.meta.data_window.to} returned ${result.meta.returned} of ${result.meta.matched} matching rows.`);
  if (diff) {
    if (diff.first_run) parts.push(`This is the first run, so all ${diff.new.length} rows form the baseline for future diffs.`);
    else parts.push(`Versus the previous run: ${diff.new.length} new, ${diff.gone.length} gone, ${diff.changed.length} changed, ${diff.unchanged} unchanged.`);
  }
  if (typeof s.window === "string") parts.push(`Window: ${s.window}.`);
  if (result.status !== "ok") parts.unshift(`${result.status}: ${result.message ?? ""}`);
  return { headline: parts.join(" "), worth_acting_on: null, evidence_ids: [], evidence_miss: 0, generated_by: "fallback" };
}

export async function generateSections(result: SkillResult, diff: Diff | null, workspaceId: string, evidence: Evidence[] = result.evidence): Promise<ReportSections> {
  if (!hasModelCredentials() || result.status !== "ok") return fallbackHeadline(result, diff);
  try {
    const client = anthropicClient();
    const system = await buildSystem(workspaceId);
    const payload = {
      skill: result.skill,
      params_resolved: result.params_resolved,
      summary: result.summary,
      rows: result.rows.slice(0, 40),
      rows_total: result.rows.length,
      diff: diff ? { first_run: !!diff.first_run, what_changed: whatChangedLines(diff, result.diff_key).slice(0, 20), new: diff.new.length, gone: diff.gone.length, changed: diff.changed.length, unchanged: diff.unchanged } : null,
      evidence: evidence.slice(0, 80).map((e) => ({ id: e.id, label: e.label, metrics: e.metrics, sample_text: e.sample_text?.slice(0, 100) })),
      meta: { data_window: result.meta.data_window, caveats: result.meta.caveats },
    };
    const response = await client.messages.create({
      model: modelId(),
      max_tokens: 700,
      system: [{ type: "text", text: system + "\n\nYou are writing a report, not chatting: call write_report exactly once with the two sections and nothing else.", cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `Write the report sections for this result:\n${JSON.stringify(payload)}` }],
    });
    const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!use) return fallbackHeadline(result, diff);
    const input = use.input as { headline?: string; worth_acting_on?: string | null };
    const known = new Set(evidence.map((e) => e.id));
    const h = rewriteCitations(String(input.headline ?? ""), known);
    const w = input.worth_acting_on ? rewriteCitations(String(input.worth_acting_on), known) : null;
    const ids = Array.from(new Set([...h.cited, ...(w?.cited ?? [])]));
    if (!h.text.trim()) return fallbackHeadline(result, diff);
    return { headline: h.text, worth_acting_on: w?.text ?? null, evidence_ids: ids, evidence_miss: h.miss.length + (w?.miss.length ?? 0), generated_by: "model" };
  } catch (e) {
    console.error("headline generation failed:", describeModelError(e));
    return fallbackHeadline(result, diff);
  }
}
