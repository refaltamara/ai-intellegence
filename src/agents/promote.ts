/**
 * Promotion of a skill run into an agent draft (PRD §6.2): params_resolved are
 * frozen verbatim except that absolute windows become relative so the agent
 * slides forward. Never re-parses the user's text.
 */
import { getSkill } from "../skills/registry";
import { defaultDiffConfig, type DiffConfig } from "./diff";
import { DEFAULT_CRON, DEFAULT_HUMAN, DEFAULT_TZ } from "./schedule";

export type AgentDraft = {
  name: string;
  skill: string;
  params: Record<string, unknown>;
  schedule: { cron: string; tz: string; human: string };
  delivery: { channels: string[]; email?: string; whatsapp?: string };
  only_if_changed: boolean;
  diff_config: DiffConfig;
  from_skill_run_id?: string;
  notes: string[];
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
}

/** Convert absolute windows/months/weeks to relative windows; keeps everything else verbatim. */
export function relativizeParams(params: Record<string, unknown>): { params: Record<string, unknown>; notes: string[] } {
  const p = structuredClone(params ?? {});
  const notes: string[] = [];
  const w = p.window as { from?: string; to?: string; last_n_days?: number } | undefined;
  if (w?.from && w?.to && !w.last_n_days) {
    const n = daysBetween(w.from, w.to);
    p.window = { last_n_days: n };
    notes.push(`window ${w.from} to ${w.to} became "last ${n} days" so the agent slides forward`);
  }
  if (typeof p.month === "string") {
    delete p.month;
    p.window = { last_n_days: 30 };
    notes.push("month became \"last 30 days\"");
  }
  if (typeof p.week === "string") {
    delete p.week;
    p.window = { last_n_days: 7 };
    notes.push("ISO week became \"last 7 days\"");
  }
  for (const k of ["brands", "used_by", "exclude_used_by", "compare_to"]) if (p[k] === "all") delete p[k];
  return { params: p, notes };
}

export function draftFromRun(run: { id: string; skill: string; params_resolved: Record<string, unknown> }, opts: { email?: string } = {}): AgentDraft {
  const def = getSkill(run.skill);
  const { params, notes } = relativizeParams(run.params_resolved);
  const subject = (params.brand as string) ?? (Array.isArray(params.brands) ? (params.brands as string[]).slice(0, 3).join(", ") : Array.isArray(params.used_by) ? `used by ${(params.used_by as string[]).slice(0, 3).join(", ")}` : null);
  const bits = [params.platform && params.platform !== "all" ? String(params.platform) : null, Array.isArray(params.tiers) ? (params.tiers as string[]).join("/") : null, subject].filter(Boolean);
  return {
    name: `Weekly /${run.skill}${bits.length ? " — " + bits.join(", ") : ""}`,
    skill: run.skill,
    params,
    schedule: { cron: DEFAULT_CRON, tz: DEFAULT_TZ, human: DEFAULT_HUMAN },
    delivery: { channels: opts.email ? ["email", "in_app"] : ["in_app"], email: opts.email },
    only_if_changed: true,
    diff_config: defaultDiffConfig(run.skill, def?.output),
    from_skill_run_id: run.id,
    notes,
  };
}
