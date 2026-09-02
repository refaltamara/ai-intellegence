/** Reports persistence and creation (PRD §7). A report is a rendered skill run (+ optional agent diff). */
import { sql } from "../db/client";
import type { Diff } from "../agents/diff";
import type { SkillResult } from "../skills/types";
import { generateSections, type ReportSections } from "./headline";
import { renderMarkdown, whatChangedLines } from "./render";

export type ReportBlocks = {
  skill: string;
  status: string;
  summary: Record<string, unknown>;
  rows: Record<string, unknown>[];
  rows_total: number;
  chart: unknown | null;
  diff: { new: number; gone: number; changed: number; unchanged: number; first_run: boolean } | null;
  what_changed: string[];
  changed_entries: { key: string; label: string; kind: "new" | "gone" | "changed"; detail: string; delta?: number; unit?: string }[];
  caveats: string[];
  data_window: { from: string; to: string };
  freshness: string;
  params_resolved: Record<string, unknown>;
  diff_key: string;
  sections: ReportSections;
  evidence: SkillResult["evidence"];
  agent_name?: string;
};
export type ReportRow = { id: string; workspace_id: string; title: string; source: "agent" | "ask"; skill_run_id: string | null; agent_run_id: string | null; body_md: string | null; blocks: ReportBlocks; created_at: string };

export async function listReports(workspaceId: string, limit = 50): Promise<ReportRow[]> {
  return (await sql.query("select id, workspace_id, title, source, skill_run_id, agent_run_id, created_at, jsonb_build_object('skill', blocks->'skill', 'diff', blocks->'diff', 'data_window', blocks->'data_window', 'agent_name', blocks->'agent_name') as blocks from reports where workspace_id = $1 order by created_at desc limit $2", [workspaceId, limit])) as ReportRow[];
}
export async function getReport(id: string, workspaceId: string): Promise<ReportRow | null> {
  const r = (await sql.query("select * from reports where id = $1 and workspace_id = $2", [id, workspaceId])) as ReportRow[];
  return r[0] ?? null;
}
export async function deleteReport(id: string, workspaceId: string): Promise<boolean> {
  const r = (await sql.query("delete from reports where id = $1 and workspace_id = $2 returning id", [id, workspaceId])) as { id: string }[];
  return r.length > 0;
}

function changedEntries(diff: Diff | null, diffKey: string): ReportBlocks["changed_entries"] {
  if (!diff || diff.first_run) return [];
  const label = (e: { key: string; row: Record<string, unknown> }) => String(e.row.creator_handle ? "@" + e.row.creator_handle : e.row[diffKey] ?? e.key);
  const out: ReportBlocks["changed_entries"] = [];
  for (const e of diff.new.slice(0, 20)) out.push({ key: e.key, label: label(e), kind: "new", detail: "new entrant" });
  for (const e of diff.changed.slice(0, 20)) {
    const c = e.changes?.[0];
    out.push({ key: e.key, label: label(e), kind: "changed", detail: (e.changes ?? []).map((x) => `${x.field.replace(/_/g, " ")} ${x.from} → ${x.to}`).join(", "), delta: c?.delta, unit: c?.unit });
  }
  for (const e of diff.gone.slice(0, 20)) out.push({ key: e.key, label: label(e), kind: "gone", detail: "dropped out" });
  return out;
}

export async function createReport(opts: { workspaceId: string; result: SkillResult; diff: Diff | null; source: "agent" | "ask"; title?: string; agentName?: string; agentRunId?: string | null }): Promise<{ report: ReportRow; sections: ReportSections; markdown: string }> {
  const { result, diff } = opts;
  const sections = await generateSections(result, diff, opts.workspaceId);
  const changes = diff && !diff.first_run ? diff.new.length + diff.gone.length + diff.changed.length : 0;
  const title = opts.title ?? (opts.source === "agent" && opts.agentName ? `${opts.agentName} — ${diff?.first_run ? "first run" : `${changes} change${changes === 1 ? "" : "s"}`}` : `/${result.skill} · ${result.meta.data_window.from} to ${result.meta.data_window.to}`);
  const markdown = renderMarkdown({ title, result, diff, headline: sections.headline.replace(/<ev id="(ev_\d+)"><\/ev>/g, "[$1]"), appUrl: process.env.APP_URL });
  const citedEvidence = result.evidence.filter((e) => sections.evidence_ids.includes(e.id));
  const blocks: ReportBlocks = {
    skill: result.skill, status: result.status, summary: result.summary, rows: result.rows.slice(0, 50), rows_total: result.rows.length, chart: result.chart ?? null,
    diff: diff ? { new: diff.new.length, gone: diff.gone.length, changed: diff.changed.length, unchanged: diff.unchanged, first_run: !!diff.first_run } : null,
    what_changed: whatChangedLines(diff, result.diff_key), changed_entries: changedEntries(diff, result.diff_key), caveats: result.meta.caveats, data_window: result.meta.data_window, freshness: result.meta.freshness,
    params_resolved: result.params_resolved, diff_key: result.diff_key, sections, evidence: citedEvidence.length ? citedEvidence : result.evidence.slice(0, 20), agent_name: opts.agentName,
  };
  const rows = (await sql.query(
    "insert into reports (workspace_id, title, source, skill_run_id, agent_run_id, body_md, blocks) values ($1, $2, $3, $4, $5, $6, $7::jsonb) returning *",
    [opts.workspaceId, title, opts.source, result.run_id ?? null, opts.agentRunId ?? null, markdown, JSON.stringify(blocks)],
  )) as ReportRow[];
  return { report: rows[0], sections, markdown };
}
