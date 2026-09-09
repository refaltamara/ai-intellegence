/**
 * Export of a skill run's rows (PRD-v2 §13): the full result with the pane's
 * state applied (exclusions removed, filter and sort honoured), human column
 * labels, numbers as numbers, and an "About this list" block that says what the
 * list is, how it was filtered, how fresh the data is and what to be careful of.
 */
import { applyPaneState, columnLabel, describeParams, paneTitle, type PaneState } from "../chat/pane";
export { columnLabel, describeParams };
import { getSkill } from "../skills/registry";
import type { Evidence, SkillResult } from "../skills/types";
import { xlsx, type Cell } from "./xlsx";

export type ExportBuild = { title: string; filename: string; columns: { key: string; label: string }[]; rows: Cell[][]; about: [string, string][]; rows_before: number; rows_after: number };

const HIDE = new Set(["evidence_ids", "evidence_id", "creator_key", "top_creator_ids", "run_id", "shared_list", "months_active_list", "top_posts", "only_focus", "only_other"]);
// jsonb loses key order, so the sheet follows the same reading order as the pane's table
const PREFER = ["creator_handle", "brand_id", "brand_a", "brand_b", "hashtag", "theme", "label", "group", "product", "campaign_id", "url", "platform", "tier", "followers", "posts", "creators", "views", "avg_views", "median_views", "engagements", "er_pct", "comment_rate_pct", "share_of_voice_pct", "cart_pct", "cart_share_pct", "views_per_1k", "brand_count", "used_by", "last_brand_post_at", "for_you"];

function visibleColumns(rows: Record<string, unknown>[]): string[] {
  const keys: string[] = [];
  for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  const shown = keys.filter((k) => !HIDE.has(k) && !(k.endsWith("_id") && !["brand_id", "campaign_id"].includes(k)));
  return [...PREFER.filter((k) => shown.includes(k)), ...shown.filter((k) => !PREFER.includes(k)).sort()];
}

function cell(v: unknown): Cell {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) {
    if (!v.length) return null;
    return v.map((x) => (x && typeof x === "object" ? ("brand" in (x as object) ? `${(x as { brand: string; posts?: number }).brand}${(x as { posts?: number }).posts != null ? ` ×${(x as { posts?: number }).posts}` : ""}` : JSON.stringify(x)) : String(x))).join("; ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16).replace("T", " ") : s;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};
const fmtNum = (n: unknown) => (typeof n === "number" ? n.toLocaleString("en-US") : String(n));

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "list";

export function buildExport(run: { id: string; skill: string; result: unknown; pane_state: PaneState | null; created_at: string }, opts: { decisionName?: string | null; brandNames?: Record<string, string>; tz?: string; now?: Date } = {}): ExportBuild {
  const result = run.result as SkillResult;
  const def = getSkill(run.skill);
  const tool = { id: run.id, name: run.skill === "query_metrics" ? "query_metrics" : "run_skill", status: result.status, skill: run.skill, title: def?.title ?? "The numbers", run_id: run.id, rows: result.rows, meta: result.meta as unknown as Record<string, unknown>, params_resolved: result.params_resolved, diff_key: result.diff_key };
  const title = paneTitle(tool);
  const all = result.rows ?? [];
  const rows = applyPaneState(all, run.pane_state, result.diff_key);
  const keys = visibleColumns(all);
  const evidence = new Map<string, Evidence>((result.evidence ?? []).map((e) => [e.id, e]));
  const columns = [...keys.map((k) => ({ key: k, label: columnLabel(k) })), { key: "__evidence_url", label: "Evidence url" }];
  const out = rows.map((r) => {
    const ids = (r.evidence_ids as string[] | undefined) ?? [];
    const ev = ids.map((id) => evidence.get(id)).find((e) => e?.url);
    return [...keys.map((k) => cell(r[k])), ev?.url ?? null];
  });
  const tz = opts.tz ?? "Asia/Jakarta";
  const when = (opts.now ?? new Date()).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz });
  const state = run.pane_state ?? {};
  const about: [string, string][] = [
    ["List", title],
    ["Exported", `${when} (${tz.replace("_", " ")})`],
    ["Filters", describeParams(result.params_resolved ?? {}, opts.brandNames) || "none"],
    ["Data through", result.meta?.freshness ? fmtDate(result.meta.freshness.slice(0, 10)) : "unknown"],
    ["Rows", `${all.length} in the result, ${out.length} exported${state.excluded?.length ? ` (${state.excluded.length} excluded by hand)` : ""}${state.filter ? ` (filtered on "${state.filter}")` : ""}`],
    ["Matched", result.meta?.matched != null ? `${fmtNum(result.meta.matched)} matched in the database` : "n/a"],
    ["Decision", opts.decisionName ?? "none"],
    ["Run", `${run.id} · ${run.created_at}`],
  ];
  for (const c of result.meta?.caveats ?? []) about.push(["Note", c]);
  const date = (opts.now ?? new Date()).toLocaleDateString("en-CA", { timeZone: tz });
  return { title, filename: `${slug(title)}-${date}`, columns, rows: out, about, rows_before: all.length, rows_after: out.length };
}

const q = (v: Cell) => (v == null ? "" : typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, '""')}"`);

/** CSV with the About block as commented lines on top: spreadsheets skip it, people read it. */
export function toCsv(b: ExportBuild): string {
  const head = b.about.map(([k, v]) => `# ${k}: ${v.replace(/\r?\n/g, " ")}`);
  const lines = [b.columns.map((c) => q(c.label)).join(","), ...b.rows.map((r) => r.map(q).join(","))];
  return [...head, ...lines].join("\n") + "\n";
}

export function toXlsx(b: ExportBuild): Buffer {
  const widths = b.columns.map((c, i) => Math.min(48, Math.max(c.label.length + 2, ...b.rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2))));
  return xlsx([
    { name: b.title.slice(0, 31), rows: [b.columns.map((c) => c.label), ...b.rows], widths },
    { name: "About this list", rows: [["What", "Value"], ...b.about], widths: [16, 100] },
  ]);
}
