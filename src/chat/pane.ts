/**
 * The evidence pane (PRD-v2 §2): which tool results become an object on the right,
 * what the tab is called, how the pane's state (sort, filter, exclusions) applies
 * to the rows, and the plain-language delta the server hands the model after a
 * pane action. Shared by the server (events, exports, deltas) and the client
 * (rebuilding tabs from history). No numbers are computed by the model: every
 * count in a delta line comes from here.
 */
import type { ChartSpec } from "../skills/types";

export type PaneKind = "table" | "chart" | "agent_draft" | "file";
export type PaneState = { sort?: { key: string; dir: "asc" | "desc" } | null; filter?: string; excluded?: string[] };
export type PaneActionKind = "exclude_rows" | "include_rows" | "clear_exclusions" | "set_params";
export type PaneAction = { run_id: string; action: PaneActionKind; ids?: string[]; params?: Record<string, unknown>; human: string };

/** The slice of a ToolCallRecord the pane needs; kept loose so persisted history of any age fits. */
export type PaneTool = {
  id: string;
  name: string;
  status: string;
  skill?: string;
  title?: string;
  run_id?: string;
  rows?: Record<string, unknown>[];
  chart?: unknown;
  meta?: Record<string, unknown>;
  params_resolved?: Record<string, unknown>;
  diff_key?: string;
  draft?: unknown;
  file?: unknown;
};

const SMALL_FIGURE_ROWS = 3;

/** Whether a tool result opens the pane, and as what. A sentence answer stays in the thread. */
export function paneOf(tool: PaneTool): { kind: PaneKind; title: string } | null {
  if (tool.name === "create_agent_draft" && tool.draft) return { kind: "agent_draft", title: tool.title ?? "Watch this" };
  if (tool.name === "export_run" && tool.file) return { kind: "file", title: tool.title ?? "Spreadsheet" };
  if (tool.status !== "ok") return null;
  const rows = tool.rows ?? [];
  const chart = tool.chart as ChartSpec | undefined;
  const chartOk = !!chart && Array.isArray(chart.x) && chart.x.length >= 3;
  // a handful of figures from the query builder reads better inline with a chip
  if (tool.name === "query_metrics" && rows.length <= SMALL_FIGURE_ROWS && !chartOk) return null;
  if (rows.length > 0) return { kind: "table", title: paneTitle(tool) };
  if (chartOk) return { kind: "chart", title: paneTitle(tool) };
  return null;
}

const TIER_SHORT: Record<string, string> = { nano: "nano", micro: "micro", mid: "mid", macro: "macro", mega: "mega" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}` : iso;
}

/** "Creator discovery · nano, micro · TikTok · Apr–Jun 26": never the skill name. */
export function paneTitle(tool: PaneTool): string {
  const base = tool.title ?? (tool.name === "query_metrics" ? "The numbers" : "Analysis");
  const p = tool.params_resolved ?? {};
  const bits: string[] = [];
  const tiers = Array.isArray(p.tiers) ? (p.tiers as string[]).map((t) => TIER_SHORT[t] ?? t) : [];
  if (tiers.length && tiers.length < 5) bits.push(tiers.join(", "));
  if (typeof p.platform === "string" && p.platform !== "all") bits.push(p.platform === "tiktok" ? "TikTok" : p.platform === "instagram" ? "Instagram" : p.platform);
  const w = (tool.meta?.data_window ?? p.window) as { from?: string; to?: string } | undefined;
  if (w?.from && w?.to) {
    const a = shortMonth(w.from), b = shortMonth(w.to);
    bits.push(a === b ? a : `${a.split(" ")[0]}–${b}`);
  }
  return [base, ...bits].join(" · ");
}

/** Stable identity for a row: the skill's diff_key (possibly composite "a|b"), else its position. */
export function rowKey(row: Record<string, unknown>, diffKey: string | undefined, index: number): string {
  if (diffKey) {
    const parts = diffKey.split("|").map((k) => row[k]);
    if (parts.every((v) => v != null && v !== "")) return parts.map(String).join("|");
  }
  return `#${index}`;
}

/** The rows the person sees and exports: exclusions removed, text filter applied, sorted. Keeps original order otherwise. */
export function applyPaneState(rows: Record<string, unknown>[], state: PaneState | null | undefined, diffKey?: string): Record<string, unknown>[] {
  let out = rows.map((row, i) => ({ row, key: rowKey(row, diffKey, i), i }));
  const excluded = new Set(state?.excluded ?? []);
  if (excluded.size) out = out.filter((x) => !excluded.has(x.key));
  const needle = state?.filter?.trim().toLowerCase();
  if (needle) out = out.filter((x) => Object.values(x.row).some((v) => v != null && typeof v !== "object" && String(v).toLowerCase().includes(needle)));
  if (state?.sort?.key) {
    const { key, dir } = state.sort;
    const sign = dir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const va = a.row[key], vb = b.row[key];
      if (va == null && vb == null) return a.i - b.i;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sign || a.i - b.i;
      return String(va).localeCompare(String(vb)) * sign || a.i - b.i;
    });
  }
  return out.map((x) => x.row);
}

const LABEL_KEYS = ["creator_handle", "brand_id", "hashtag", "theme", "product", "label", "group", "brand_a", "url", "week", "month"];

/** What a row is called in a sentence. */
export function rowLabel(row: Record<string, unknown>): string {
  for (const k of LABEL_KEYS) {
    const v = row[k];
    if (v != null && v !== "") return k === "creator_handle" ? `@${v}` : k === "brand_a" ? `${v} × ${row.brand_b ?? ""}`.trim() : String(v);
  }
  const first = Object.values(row).find((v) => typeof v === "string");
  return first ? String(first) : "row";
}

function topThree(rows: Record<string, unknown>[]): string[] {
  return rows.slice(0, 3).map(rowLabel);
}

/** Server-computed lines the model repeats after exclusions change (PRD-v2 §2.5). */
export function describeExclusion(all: Record<string, unknown>[], before: PaneState | null | undefined, after: PaneState | null | undefined, diffKey?: string): string[] {
  const prev = applyPaneState(all, { excluded: before?.excluded ?? [] }, diffKey);
  const next = applyPaneState(all, { excluded: after?.excluded ?? [] }, diffKey);
  const removed = new Set(after?.excluded ?? []);
  const named = all.map((r, i) => ({ r, k: rowKey(r, diffKey, i) })).filter((x) => removed.has(x.k) && !(before?.excluded ?? []).includes(x.k)).map((x) => rowLabel(x.r));
  const lines = [`Rows shown: ${prev.length} before, ${next.length} now (${all.length} in the full list).`];
  if (named.length) lines.push(`Removed: ${named.slice(0, 8).join(", ")}${named.length > 8 ? ` and ${named.length - 8} more` : ""}.`);
  const a = topThree(prev), b = topThree(next);
  if (a.join() !== b.join()) lines.push(`Top three in the list's own order: ${b.join(", ")} (before: ${a.join(", ")}).`);
  else if (b.length) lines.push(`The top three are unchanged: ${b.join(", ")}.`);
  return lines;
}

/** Server-computed lines after a re-run with new parameters: size, overlap, what is new. */
export function describeRerun(oldRows: Record<string, unknown>[], newRows: Record<string, unknown>[], oldMatched: number | undefined, newMatched: number | undefined, diffKey?: string): string[] {
  const oldKeys = new Set(oldRows.map((r, i) => rowKey(r, diffKey, i)));
  const kept = newRows.filter((r, i) => oldKeys.has(rowKey(r, diffKey, i)));
  const fresh = newRows.filter((r, i) => !oldKeys.has(rowKey(r, diffKey, i)));
  const lines = [`Matched ${oldMatched ?? oldRows.length} before, ${newMatched ?? newRows.length} now; the list shows ${newRows.length} rows (was ${oldRows.length}).`];
  lines.push(`${kept.length} of the ${newRows.length} rows were already in the previous list; ${fresh.length} are new${fresh.length ? ` (first: ${topThree(fresh).join(", ")})` : ""}.`);
  const a = topThree(oldRows), b = topThree(newRows);
  if (a.join() !== b.join()) lines.push(`Top three now: ${b.join(", ")} (before: ${a.join(", ")}).`);
  else if (b.length) lines.push(`The top three are unchanged: ${b.join(", ")}.`);
  return lines;
}

/** A pane action as the person reads it in the thread and as the model sees it (PRD-v2 §5.5). */
export function humanAction(action: PaneActionKind, n: number, what = "rows"): string {
  switch (action) {
    case "exclude_rows": return `You excluded ${n} ${what}`;
    case "include_rows": return `You put ${n} ${what} back`;
    case "clear_exclusions": return "You cleared the exclusions";
    case "set_params": return "You changed the filters";
  }
}

/** Merge an exclusion action into the stored state. */
export function nextState(state: PaneState | null | undefined, action: PaneAction): PaneState {
  const cur = { ...(state ?? {}) };
  const set = new Set(cur.excluded ?? []);
  if (action.action === "exclude_rows") for (const id of action.ids ?? []) set.add(id);
  if (action.action === "include_rows") for (const id of action.ids ?? []) set.delete(id);
  if (action.action === "clear_exclusions") set.clear();
  cur.excluded = [...set];
  return cur;
}

const TIER_LABEL: Record<string, string> = { nano: "Nano", micro: "Micro", mid: "Mid", macro: "Macro", mega: "Mega" };
const RANK_LABEL: Record<string, string> = { views: "views", avg_views: "average views per post", comment_rate: "comment rate", er_pct: "engagement rate", views_per_1k: "views per 1k followers", median_views: "median views" };

const fmtDate = (iso: string) => {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};
const fmtNum = (n: unknown) => (typeof n === "number" ? n.toLocaleString("en-US") : String(n));

/** "Nano, micro · TikTok · 1 Apr to 30 Jun 2026 · used by Skintific · excluding Wardah · ranked by views". */
export function describeParams(p: Record<string, unknown>, names: Record<string, string> = {}): string {
  const name = (id: unknown) => names[String(id)] ?? String(id);
  const bits: string[] = [];
  if (Array.isArray(p.tiers) && p.tiers.length) bits.push((p.tiers as string[]).map((t) => TIER_LABEL[t] ?? t).join(", "));
  if (typeof p.platform === "string" && p.platform !== "all") bits.push(p.platform === "tiktok" ? "TikTok" : p.platform === "instagram" ? "Instagram" : p.platform);
  const w = p.window as { from?: string; to?: string } | undefined;
  if (w?.from && w?.to) bits.push(`${fmtDate(w.from)} to ${fmtDate(w.to)}`);
  if (typeof p.brand === "string") bits.push(name(p.brand));
  if (Array.isArray(p.brands) && p.brands.length) bits.push((p.brands as string[]).map(name).join(", "));
  if (Array.isArray(p.used_by) && p.used_by.length) bits.push(`used by ${(p.used_by as string[]).map(name).join(", ")}`);
  if (Array.isArray(p.exclude_used_by) && p.exclude_used_by.length) bits.push(`excluding anyone who posted for ${(p.exclude_used_by as string[]).map(name).join(", ")}`);
  if (p.min_followers != null || p.max_followers != null) bits.push(`followers ${p.min_followers != null ? fmtNum(p.min_followers) : "0"} to ${p.max_followers != null ? fmtNum(p.max_followers) : "any"}`);
  if (typeof p.rank_by === "string") bits.push(`ranked by ${RANK_LABEL[p.rank_by] ?? p.rank_by.replace(/_/g, " ")}`);
  if (typeof p.min_views === "number" && p.min_views > 0) bits.push(`at least ${fmtNum(p.min_views)} views`);
  if (typeof p.limit === "number") bits.push(`top ${p.limit}`);
  const known = new Set(["tiers", "platform", "window", "brand", "brands", "used_by", "exclude_used_by", "min_followers", "max_followers", "rank_by", "min_views", "limit", "min_posts_for_brands"]);
  for (const [k, v] of Object.entries(p)) {
    if (known.has(k) || v == null || v === "all" || v === true || (Array.isArray(v) && !v.length)) continue; // a true flag is the default; only say when it is off
    bits.push(v === false ? `no ${k.replace(/_/g, " ")}` : `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return bits.join(" · ");
}


/** Column labels for people: "Cart share (%)", not cart_pct. */
const LABELS: Record<string, string> = {
  creator_handle: "Creator", brand_id: "Brand", brand_a: "Brand A", brand_b: "Brand B", platform: "Platform", tier: "Tier", followers: "Followers", posts: "Posts", creators: "Creators", views: "Views",
  avg_views: "Avg views per post", median_views: "Median views", engagements: "Engagements", er_pct: "Engagement rate (%)", comment_rate_pct: "Comment rate (%)", cart_pct: "Cart share (%)", cart_share_pct: "Cart share (%)",
  share_of_voice_pct: "Share of voice (%)", views_per_1k: "Views per 1k followers", for_you: "For you", used_by: "Worked for", last_brand_post_at: "Last brand post", brand_count: "Brands worked for", url: "URL",
  posted_at: "Posted", caption: "Caption", hashtag: "Hashtag", theme: "Theme", product: "Product", week: "Week", month: "Month", multiple: "Multiple", in_wave: "In wave", jaccard: "Overlap (Jaccard)", shared_creators: "Shared creators",
};
export function columnLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const pct = key.endsWith("_pct");
  const base = key.replace(/_pct$/, "").replace(/_/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1) + (pct ? " (%)" : "");
}

