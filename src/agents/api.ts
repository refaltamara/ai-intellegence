/** Shared validation for the agents API: turns a draft/body into an insertable agent. */
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import { getSkill } from "../skills/registry";
import { validateParams } from "../skills/params";
import { getSkillRun } from "../chat/persist";
import { defaultDiffConfig, type DiffConfig } from "./diff";
import { draftFromRun } from "./promote";
import { DEFAULT_CRON, DEFAULT_TZ, humanize, nextRunAt, validateCron } from "./schedule";
import type { AgentRow } from "./store";

export type AgentBody = {
  name?: string; skill?: string; params?: Record<string, unknown>;
  schedule?: { cron?: string; tz?: string; human?: string }; delivery?: { channels?: string[]; email?: string; whatsapp?: string };
  only_if_changed?: boolean; diff_config?: DiffConfig; from_skill_run_id?: string; status?: "active" | "paused" | "draft";
};

export async function agentFromBody(body: AgentBody, workspaceId = DEFAULT_WORKSPACE_ID): Promise<{ agent: Omit<AgentRow, "id" | "created_at" | "last_run_at">; notes: string[] } | { error: string }> {
  let base: AgentBody = body;
  const notes: string[] = [];
  if (body.from_skill_run_id && !body.skill) {
    const run = await getSkillRun(body.from_skill_run_id, workspaceId);
    if (!run) return { error: `skill run ${body.from_skill_run_id} not found` };
    const result = run.result as { params_resolved?: Record<string, unknown> };
    const d = draftFromRun({ id: run.id, skill: run.skill, params_resolved: result.params_resolved ?? {} }, { email: body.delivery?.email });
    notes.push(...d.notes);
    base = { ...d, ...body, skill: d.skill, params: body.params ?? d.params, schedule: { ...d.schedule, ...(body.schedule ?? {}) }, delivery: { ...d.delivery, ...(body.delivery ?? {}) } };
  }
  const skill = String(base.skill ?? "");
  const def = getSkill(skill);
  if (!def) return { error: `unknown skill '${skill}'` };
  let params: Record<string, unknown>;
  try {
    params = validateParams(def, base.params ?? {});
  } catch (e) {
    return { error: (e as Error).message };
  }
  const cron = String(base.schedule?.cron ?? DEFAULT_CRON);
  const cronErr = validateCron(cron);
  if (cronErr) return { error: `invalid cron '${cron}': ${cronErr}` };
  const tz = String(base.schedule?.tz ?? DEFAULT_TZ);
  const channels = Array.from(new Set<string>([...(base.delivery?.channels ?? []), "in_app"]));
  if (channels.includes("email") && base.delivery?.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(base.delivery.email)) return { error: `invalid email '${base.delivery.email}'` };
  const status = base.status ?? "active";
  return {
    agent: {
      workspace_id: workspaceId,
      user_id: null,
      name: String(base.name ?? `Weekly /${skill}`).slice(0, 120),
      skill,
      params,
      from_skill_run_id: base.from_skill_run_id ?? null,
      schedule_cron: cron,
      schedule_tz: tz,
      schedule_human: base.schedule?.human ?? humanize(cron, tz),
      delivery: { channels, email: base.delivery?.email, whatsapp: base.delivery?.whatsapp },
      only_if_changed: base.only_if_changed !== false,
      diff_config: base.diff_config ?? defaultDiffConfig(skill, def.output),
      status,
      next_run_at: status === "active" ? nextRunAt(cron, tz).toISOString() : null,
    },
    notes,
  };
}
