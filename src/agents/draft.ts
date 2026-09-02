/**
 * Conversational agent setup (PRD §6.5): free text -> create_agent_draft via the
 * model -> editable draft. Uses tool_choice auto plus an explicit instruction
 * (forced tool use is not portable across current models).
 */
import Anthropic from "@anthropic-ai/sdk";
import { hasModelCredentials, modelId } from "../chat/loop";
import { buildTools } from "../chat/tools";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { getSkill } from "../skills/registry";
import { defaultDiffConfig } from "./diff";
import type { AgentDraft } from "./promote";
import { relativizeParams } from "./promote";
import { DEFAULT_CRON, DEFAULT_TZ, humanize, validateCron } from "./schedule";

export async function draftFromText(text: string, workspaceId: string, opts: { email?: string } = {}): Promise<{ draft: AgentDraft } | { error: string }> {
  if (!hasModelCredentials()) return { error: "The chat model is not configured (ANTHROPIC_API_KEY is missing). Create the agent from a skill run instead: run a skill in Ask or /discovery and use 'Run this weekly'." };
  const ctx = await loadContext(new SkillDb(), workspaceId);
  const client = new Anthropic();
  const tool = buildTools().find((t) => t.name === "create_agent_draft")!;
  const response = await client.messages.create({
    model: modelId(),
    max_tokens: 2000,
    system: `You turn a request for a recurring analysis into an agent draft for Fair Intel. Call the create_agent_draft tool exactly once with your best reading, then stop; do not answer in prose. Choose the skill from this list and pass parameters as that skill defines them (brands accept slugs, handles or display names; relative windows are {last_n_days}). Default schedule when not stated: weekly Monday 07:00 Asia/Jakarta (cron "0 7 * * 1"). Delivery channels: email when the user mentions email or a person to send to, whatsapp when they mention WhatsApp, in_app always. only_if_changed defaults to true unless they ask for every run.\nSkills:\n${buildTools()[0].description}\nTracked brands: ${ctx.brands.map((b) => `${b.id} (${b.name})`).join(", ")}. Newest data: ${ctx.asOf}.`,
    tools: [tool],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: text }],
  });
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!use) {
    const said = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    return { error: said ? `The model did not produce a draft: ${said.slice(0, 300)}` : "The model did not produce a draft." };
  }
  const input = use.input as Record<string, any>;
  const skill = String(input.skill ?? "");
  if (!getSkill(skill)) return { error: `Unknown skill '${skill}' in the draft.` };
  const cronErr = validateCron(String(input.schedule?.cron ?? DEFAULT_CRON));
  const cron = cronErr ? DEFAULT_CRON : String(input.schedule?.cron ?? DEFAULT_CRON);
  const tz = String(input.schedule?.tz ?? DEFAULT_TZ);
  const { params, notes } = relativizeParams((input.params ?? {}) as Record<string, unknown>);
  const channels = Array.from(new Set<string>([...(input.delivery?.channels ?? []), "in_app"]));
  return {
    draft: {
      name: String(input.name ?? `Weekly /${skill}`),
      skill,
      params,
      schedule: { cron, tz, human: String(input.schedule?.human ?? humanize(cron, tz)) },
      delivery: { channels, email: opts.email },
      only_if_changed: input.only_if_changed !== false,
      diff_config: defaultDiffConfig(skill, getSkill(skill)?.output),
      from_skill_run_id: input.from_skill_run_id,
      notes: [...notes, ...(cronErr ? [`cron '${input.schedule?.cron}' was invalid; using the weekly default`] : [])],
    },
  };
}
