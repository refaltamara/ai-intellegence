/**
 * Renders a skill run (+ optional agent diff) as Markdown and HTML (PRD §7).
 * M3 ships the deterministic sections (what changed, table, caveats); M4 adds
 * the model-written headline and the Reports screen.
 */
import type { Diff } from "../agents/diff";
import type { SkillResult } from "../skills/types";

const HIDE = new Set(["evidence_ids", "evidence_id", "post_id", "creator_id", "creator_key", "top_creator_ids", "brands", "used_by", "shared_list", "months_active_list", "top_posts", "caption", "hashtags"]);

export function pickColumns(rows: Record<string, unknown>[], max = 8): string[] {
  if (!rows.length) return [];
  return Object.keys(rows[0]).filter((k) => !HIDE.has(k) && typeof rows[0][k] !== "object").slice(0, max);
}

export const fmt = (v: unknown): string => {
  if (v == null) return "–";
  if (typeof v === "number") return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T?/.test(v)) return v.slice(0, 10);
  return String(v);
};

export function whatChangedLines(diff: Diff | null, diffKey: string): string[] {
  if (!diff) return [];
  if (diff.first_run) return [`First run: ${diff.new.length} rows recorded as the baseline.`];
  const label = (e: { key: string; row: Record<string, unknown> }) => String(e.row.creator_handle ? "@" + e.row.creator_handle : e.row[diffKey] ?? e.key);
  const lines: string[] = [];
  for (const e of diff.new.slice(0, 15)) lines.push(`NEW ${label(e)}`);
  if (diff.new.length > 15) lines.push(`… and ${diff.new.length - 15} more new`);
  for (const e of diff.changed.slice(0, 15)) lines.push(`CHANGED ${label(e)}: ${(e.changes ?? []).map((c) => `${c.field} ${fmt(c.from)} → ${fmt(c.to)} (${c.delta > 0 ? "+" : ""}${c.delta}${c.unit === "pct" ? "%" : " pts"})`).join(", ")}`);
  for (const e of diff.gone.slice(0, 15)) lines.push(`GONE ${label(e)}`);
  if (diff.gone.length > 15) lines.push(`… and ${diff.gone.length - 15} more gone`);
  if (!lines.length) lines.push(`No changes: ${diff.unchanged} rows unchanged.`);
  return lines;
}

export function renderMarkdown(opts: { title: string; result: SkillResult; diff: Diff | null; headline?: string; appUrl?: string }): string {
  const { title, result, diff } = opts;
  const cols = pickColumns(result.rows);
  const md: string[] = [`# ${title}`, ""];
  md.push(`/${result.skill} · ${result.meta.data_window.from} to ${result.meta.data_window.to} · ${result.meta.returned} of ${result.meta.matched} rows`, "");
  if (opts.headline) md.push(opts.headline, "");
  if (result.status !== "ok") md.push(`**${result.status}**: ${result.message ?? ""}`, "");
  if (diff) md.push("## What changed", "", ...whatChangedLines(diff, result.diff_key).map((l) => `- ${l}`), "");
  if (cols.length) {
    md.push("## Table", "", `| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`);
    for (const r of result.rows.slice(0, 25)) md.push(`| ${cols.map((c) => fmt(r[c])).join(" | ")} |`);
    if (result.rows.length > 25) md.push("", `${result.rows.length - 25} more rows in the app.`);
    md.push("");
  }
  if (result.meta.caveats.length) md.push("## Caveats", "", ...result.meta.caveats.map((c) => `- ${c}`), "");
  return md.join("\n");
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderHtml(opts: { title: string; result: SkillResult; diff: Diff | null; headline?: string; appUrl?: string; agentName?: string }): string {
  const { title, result, diff } = opts;
  const cols = pickColumns(result.rows);
  const changed = diff ? whatChangedLines(diff, result.diff_key) : [];
  const chip = (l: string) => {
    const m = /^(NEW|CHANGED|GONE|…|First run|No changes)/.exec(l);
    const color = m?.[1] === "NEW" ? "#0E9F6E" : m?.[1] === "GONE" ? "#E5484D" : m?.[1] === "CHANGED" ? "#D98E04" : "#526278";
    return `<li style="padding:8px 0;border-bottom:1px solid #E6EBF2"><span style="color:${color};font-weight:700">${esc(m?.[1] ?? "")}</span> ${esc(l.replace(/^(NEW|CHANGED|GONE)\s*/, ""))}</li>`;
  };
  return `<!doctype html><html><body style="margin:0;background:#F7F9FC;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0F1B2D">
<div style="max-width:680px;margin:0 auto;padding:24px">
  <div style="background:#fff;border:1px solid #E6EBF2;border-radius:12px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid #E6EBF2">
      <div style="font-size:11px;color:#8593A8;font-weight:600;letter-spacing:.04em">FAIR INTEL${opts.agentName ? " · " + esc(opts.agentName) : ""}</div>
      <h1 style="font-size:20px;margin:6px 0 4px">${esc(title)}</h1>
      <div style="font-size:12px;color:#8593A8">/${esc(result.skill)} · ${esc(result.meta.data_window.from)} to ${esc(result.meta.data_window.to)} · ${result.meta.returned} of ${result.meta.matched} rows · data through ${esc(result.meta.freshness.slice(0, 10))}</div>
    </div>
    ${opts.headline ? `<div style="padding:18px 24px;border-bottom:1px solid #E6EBF2;font-size:15px;line-height:1.55">${esc(opts.headline)}</div>` : ""}
    ${result.status !== "ok" ? `<div style="padding:14px 24px;background:#FFF4DE;color:#D98E04;font-weight:600">${esc(result.status)}: ${esc(result.message)}</div>` : ""}
    ${diff ? `<div style="padding:18px 24px;border-bottom:1px solid #E6EBF2"><h4 style="margin:0 0 6px;font-size:13px;color:#526278">What changed</h4><ul style="list-style:none;padding:0;margin:0;font-size:13px">${changed.map(chip).join("")}</ul></div>` : ""}
    ${cols.length ? `<div style="padding:18px 24px;overflow:auto"><h4 style="margin:0 0 10px;font-size:13px;color:#526278">Table</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>${cols.map((c) => `<th style="text-align:left;padding:8px;border-bottom:1px solid #E6EBF2;color:#8593A8;font-weight:600">${esc(c.replace(/_/g, " "))}</th>`).join("")}</tr></thead>
      <tbody>${result.rows.slice(0, 20).map((r) => `<tr>${cols.map((c) => `<td style="padding:8px;border-bottom:1px solid #E6EBF2;white-space:nowrap">${esc(fmt(r[c]))}</td>`).join("")}</tr>`).join("")}</tbody></table>
      ${result.rows.length > 20 ? `<div style="font-size:12px;color:#8593A8;margin-top:8px">${result.rows.length - 20} more rows in the app.</div>` : ""}</div>` : ""}
    ${result.meta.caveats.length ? `<div style="padding:14px 24px;border-top:1px solid #E6EBF2;font-size:12px;color:#8593A8"><ul style="margin:0;padding-left:18px">${result.meta.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
    ${opts.appUrl ? `<div style="padding:14px 24px;border-top:1px solid #E6EBF2"><a href="${esc(opts.appUrl)}/agents" style="color:#1E5EFF;font-weight:600;font-size:13px">Open in Fair Intel</a></div>` : ""}
  </div>
</div></body></html>`;
}
