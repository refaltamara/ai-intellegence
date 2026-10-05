/**
 * Runs one agent (PRD §6.3): skill with frozen params -> new skill_run, diff
 * against the previous successful run, report row, delivery, next_run_at.
 */
import { getWorkspace } from "../workspace/store";
import { appUrl as publicUrl } from "../config/app";
import { runSkill } from "../skills/runner";
import { renderHtml } from "../reports/render";
import { createReport } from "../reports/store";
import { deliver } from "../delivery";
import { diffResults, shouldDeliver, type Diff } from "./diff";
import { nextRunAt } from "./schedule";
import { finishRun, insertRun, lastSuccessfulRun, updateAgent, type AgentRow, type AgentRunRow } from "./store";
import { runWeekly } from "../competitor/scheduled";
import { signal } from "../learning/signals";

export type AgentRunOutcome = { run: AgentRunRow; diff: Diff | null; delivered: { channel: string; ok: boolean; detail: string }[]; result_status: string; report_id: string | null; message?: string };

export async function runAgent(agent: AgentRow, opts: { reason?: "schedule" | "manual"; week?: string } = {}): Promise<AgentRunOutcome> {
  const run = await insertRun(agent.id);
  if (agent.kind === "weekly_report") return runWeeklyAgent(agent, run, opts);
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
    const appUrl = publicUrl();
    const { report, sections, markdown } = await createReport({ workspaceId: agent.workspace_id, result, diff, source: "agent", agentName: agent.name, agentRunId: run.id, decisionId: agent.decision_id ?? null });
    reportId = report.id;
    const title = report.title;
    const plainHeadline = sections.headline.replace(/<ev id="(ev_\d+)"><\/ev>/g, "[$1]");
    const html = renderHtml({ title, result, diff, appUrl: appUrl ? `${appUrl}/reports/${report.id}` : undefined, agentName: agent.name, headline: plainHeadline });
    if (should) {
      const product = (await getWorkspace(agent.workspace_id).catch(() => null))?.product_name ?? "Fair Intelligence";
      delivered = await deliver(agent.delivery, { subject: `[${product}] ${title}`, html, text: markdown });
      const failed = delivered.filter((d) => !d.ok && d.channel !== "in_app");
      deliveryError = failed.length ? failed.map((d) => `${d.channel}: ${d.detail}`).join("; ") : null;
      deliveredAt = delivered.some((d) => d.ok && d.channel !== "in_app") ? new Date().toISOString() : null;
      if (deliveredAt) await signal({ ws: agent.workspace_id, role: null }, "alert.sent", { kind: agent.skill });
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

/** A Weekly Competitor Pulse schedule: the deck and its PDF, stored with the report and emailed (src/competitor/scheduled.ts). */
async function runWeeklyAgent(agent: AgentRow, run: AgentRunRow, opts: { reason?: "schedule" | "manual"; week?: string }): Promise<AgentRunOutcome> {
  let o: Awaited<ReturnType<typeof runWeekly>>;
  try {
    o = await runWeekly(agent, run.id, opts);
  } catch (e) {
    o = { status: "error", message: (e as Error).message, report_id: null, week: null, delivered: [] };
  }
  const failed = o.delivered.filter((d) => !d.ok && d.channel !== "in_app");
  const deliveredAt = o.delivered.some((d) => d.ok && d.channel !== "in_app") ? new Date().toISOString() : null;
  const deliveryError = o.status === "error" ? o.message : failed.length ? failed.map((d) => `${d.channel}: ${d.detail}`).join("; ") : null;
  const finished = await finishRun(run.id, { should_deliver: o.status === "ok", delivered_at: deliveredAt, delivery_error: deliveryError, report_id: o.report_id });
  await updateAgent(agent.id, agent.workspace_id, {
    last_run_at: new Date().toISOString(),
    next_run_at: agent.status === "active" ? nextRunAt(agent.schedule_cron, agent.schedule_tz).toISOString() : agent.next_run_at,
    // a scheduled run remembers the week it sent, so the next one waits for new data
    ...(o.status === "ok" && o.week && opts.reason !== "manual" ? { params: { ...agent.params, last_week: o.week } } : {}),
  });
  const delivered = o.status === "skipped" ? [{ channel: "in_app", ok: true, detail: o.message }] : o.delivered;
  return { run: finished, diff: null, delivered, result_status: o.status === "ok" ? "ok" : o.status, report_id: o.report_id, message: o.message };
}
