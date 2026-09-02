/**
 * Runs one agent (PRD §6.3): skill with frozen params -> new skill_run, diff
 * against the previous successful run, report row, delivery, next_run_at.
 */
import { runSkill } from "../skills/runner";
import { renderHtml } from "../reports/render";
import { createReport } from "../reports/store";
import { deliver } from "../delivery";
import { diffResults, shouldDeliver, type Diff } from "./diff";
import { nextRunAt } from "./schedule";
import { finishRun, insertRun, lastSuccessfulRun, updateAgent, type AgentRow, type AgentRunRow } from "./store";

export type AgentRunOutcome = { run: AgentRunRow; diff: Diff | null; delivered: { channel: string; ok: boolean; detail: string }[]; result_status: string; report_id: string | null };

export async function runAgent(agent: AgentRow, opts: { reason?: "schedule" | "manual" } = {}): Promise<AgentRunOutcome> {
  const run = await insertRun(agent.id);
  const previous = await lastSuccessfulRun(agent.id);
  const result = await runSkill({ skill: agent.skill, workspace_id: agent.workspace_id, params: agent.params, actor: { user_id: agent.user_id ?? "agent", via: "agent" } });
  let diff: Diff | null = null;
  let delivered: AgentRunOutcome["delivered"] = [];
  let reportId: string | null = null;
  let deliveryError: string | null = null;
  let deliveredAt: string | null = null;
  let should = false;

  if (result.status === "ok") {
    diff = diffResults(previous ? previous.rows : null, result.rows, result.diff_key, agent.diff_config ?? {});
    should = shouldDeliver(diff, agent.only_if_changed, agent.diff_config ?? {});
    const appUrl = process.env.APP_URL;
    const { report, sections, markdown } = await createReport({ workspaceId: agent.workspace_id, result, diff, source: "agent", agentName: agent.name, agentRunId: run.id });
    reportId = report.id;
    const title = report.title;
    const plainHeadline = sections.headline.replace(/<ev id="(ev_\d+)"><\/ev>/g, "[$1]");
    const html = renderHtml({ title, result, diff, appUrl: appUrl ? `${appUrl}/reports/${report.id}` : undefined, agentName: agent.name, headline: plainHeadline });
    if (should) {
      delivered = await deliver(agent.delivery, { subject: `[Fair Intel] ${title}`, html, text: markdown });
      const failed = delivered.filter((d) => !d.ok && d.channel !== "in_app");
      deliveryError = failed.length ? failed.map((d) => `${d.channel}: ${d.detail}`).join("; ") : null;
      deliveredAt = delivered.some((d) => d.ok && d.channel !== "in_app") ? new Date().toISOString() : null;
    } else {
      delivered = [{ channel: "in_app", ok: true, detail: "no changes; delivery skipped (only_if_changed)" }];
    }
  } else {
    deliveryError = `skill ${result.status}: ${result.message ?? ""}`;
  }

  const finished = await finishRun(run.id, { skill_run_id: result.run_id ?? null, diff, should_deliver: should, delivered_at: deliveredAt, delivery_error: deliveryError, report_id: reportId });
  await updateAgent(agent.id, agent.workspace_id, { last_run_at: new Date().toISOString(), next_run_at: nextRunAt(agent.schedule_cron, agent.schedule_tz).toISOString() });
  return { run: finished, diff, delivered, result_status: result.status, report_id: reportId };
}
