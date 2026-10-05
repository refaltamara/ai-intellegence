/**
 * What a version can be measured by (CMS plan, "The learning loop", step 5): rates over
 * signals, compared before and after a version reached a workspace. A measure is a key:
 * fixed ones below, plus `analysis:<recipe or skill>` (its share of analyses) and
 * `tile_seen:<section>` (seen per Dashboard visit). Pure.
 */
import type { RoleModel } from "../roles/model";
import { SECTIONS } from "../dashboard/sections";

/** a count of one signal kind, optionally only where a payload field has a value */
export type Count = { kind: string; field?: string; value?: string };
/** a rate: num over den, or num per workspace-week */
export type Measure = { key: string; label: string; num: Count; den: Count | "week"; unit: "%" | "per week" };

const FIXED: Measure[] = [
  { key: "analyses_per_week", label: "analyses per workspace a week", num: { kind: "chat.analysis" }, den: "week", unit: "per week" },
  { key: "questions_per_week", label: "questions per workspace a week", num: { kind: "chat.turn" }, den: "week", unit: "per week" },
  { key: "company_share", label: "share of analyses that run a team's own skill", num: { kind: "chat.analysis", field: "layer", value: "company" }, den: { kind: "chat.analysis" }, unit: "%" },
  { key: "show_chart", label: "Show chart per analysis", num: { kind: "chat.show_chart" }, den: { kind: "chat.analysis" }, unit: "%" },
  { key: "pane_open", label: "evidence pane opened per analysis", num: { kind: "chat.pane_open" }, den: { kind: "chat.analysis" }, unit: "%" },
  { key: "clarify", label: "clarifying questions per turn", num: { kind: "chat.clarify" }, den: { kind: "chat.turn" }, unit: "%" },
  { key: "copy", label: "answers copied per turn", num: { kind: "chat.copy" }, den: { kind: "chat.turn" }, unit: "%" },
  { key: "ask_why", label: '"Ask why" per Dashboard visit', num: { kind: "dashboard.ask_why" }, den: { kind: "dashboard.view" }, unit: "%" },
  { key: "deck_opened", label: "deck opens per version made", num: { kind: "deck.version_opened" }, den: { kind: "deck.version_made" }, unit: "%" },
  { key: "creations_per_week", label: "creations made per workspace a week", num: { kind: "creation.made" }, den: "week", unit: "per week" },
];

const KEY = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;

export function measureOf(key: string, titles: Record<string, string> = {}): Measure | null {
  const f = FIXED.find((m) => m.key === key);
  if (f) return f;
  if (!KEY.test(key)) return null;
  if (key.startsWith("analysis:")) {
    const a = key.slice(9);
    return { key, label: `share of analyses that run ${titles[a] ?? a}`, num: { kind: "chat.analysis", field: "analysis", value: a }, den: { kind: "chat.analysis" }, unit: "%" };
  }
  if (key.startsWith("tile_seen:")) {
    const t = key.slice(10);
    const label = Object.values(SECTIONS).flat().find((s) => s.key === t)?.label ?? t;
    return { key, label: `"${label}" viewed per Dashboard visit`, num: { kind: "dashboard.tile_viewed", field: "tile", value: t }, den: { kind: "dashboard.view" }, unit: "%" };
  }
  return null;
}

export const FIXED_MEASURES = FIXED.map((m) => m.key);

/**
 * The measures a version suggests from what it changes against the one before: each
 * analysis it adds, each tile it shows or hides by default, then the general ones.
 */
export function suggestMeasures(before: Pick<RoleModel, "recipes" | "tiles" | "id">, after: Pick<RoleModel, "recipes" | "tiles" | "id">): string[] {
  const out: string[] = [];
  for (const r of after.recipes ?? []) if (!(before.recipes ?? []).includes(r)) out.push(`analysis:${r}`);
  const hb = new Set(before.tiles?.hidden ?? []), ha = new Set(after.tiles?.hidden ?? []);
  for (const t of SECTIONS[after.id].map((s) => s.key)) if (hb.has(t) !== ha.has(t)) out.push(`tile_seen:${t}`);
  out.push("analyses_per_week", "company_share");
  return [...new Set(out)];
}
