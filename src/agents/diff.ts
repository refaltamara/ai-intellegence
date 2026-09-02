/**
 * Diff two skill results on diff_key (PRD §6.3).
 *   new     = keys in current not in previous (surfaced first)
 *   gone    = keys in previous not in current
 *   changed = same key, a watched metric moved beyond its threshold, or an alert state flipped on
 */
import type { Row } from "../skills/types";

export type WatchRule = { pts?: number; pct?: number };
export type DiffConfig = { watch?: Record<string, WatchRule>; alert?: string };
export type DiffEntry = { key: string; row: Row; prev?: Row; changes?: { field: string; from: unknown; to: unknown; delta: number; unit: "pts" | "pct" }[] };
export type Diff = { new: DiffEntry[]; gone: DiffEntry[]; changed: DiffEntry[]; unchanged: number; diff_key: string; first_run?: boolean };

/** Registry-derived defaults; stored on the agent as diff_config so they can be edited later. */
export function defaultDiffConfig(skill: string, output?: Record<string, unknown>): DiffConfig {
  if (skill === "compare") return { watch: { share_of_voice_pct: { pts: 1 }, posts: { pct: 50 }, negative_pct: { pts: 5 } } };
  if (skill === "affiliates") return { watch: { affiliate_accounts: { pct: 20 }, share_of_posts_pct: { pts: 5 } } };
  if (skill === "funnel-mix") return { watch: { share_of_posts_pct: { pts: 5 } } };
  if (skill === "launch") return { watch: { posts: { pct: 50 }, creators: { pct: 50 } } };
  if (skill === "loyalists") return { watch: { consecutive_months: { pts: 1 } } };
  if (output?.alert_state) return { alert: String(output.alert_state) };
  return {};
}

export function rowKey(row: Row, diffKey: string): string {
  const base = row[diffKey] ?? row.post_id ?? row.creator_id ?? row.brand_id ?? row.pair_id ?? row.week;
  const parts = [base == null ? JSON.stringify(row) : String(base)];
  if (diffKey !== "source" && "source" in row && row.source != null) parts.push(String(row.source));
  if (diffKey === "brand_id" && "tier" in row && row.tier != null) parts.push(String(row.tier));
  return parts.join("|");
}

export function diffResults(prevRows: Row[] | null, curRows: Row[], diffKey: string, config: DiffConfig = {}): Diff {
  if (prevRows == null) {
    return { new: curRows.map((row) => ({ key: rowKey(row, diffKey), row })), gone: [], changed: [], unchanged: 0, diff_key: diffKey, first_run: true };
  }
  const prev = new Map(prevRows.map((r) => [rowKey(r, diffKey), r]));
  const cur = new Map(curRows.map((r) => [rowKey(r, diffKey), r]));
  const out: Diff = { new: [], gone: [], changed: [], unchanged: 0, diff_key: diffKey };
  for (const [key, row] of cur) {
    const p = prev.get(key);
    if (!p) {
      out.new.push({ key, row });
      continue;
    }
    const changes: NonNullable<DiffEntry["changes"]> = [];
    for (const [field, rule] of Object.entries(config.watch ?? {})) {
      const a = Number(p[field]);
      const b = Number(row[field]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (rule.pts != null && Math.abs(b - a) >= rule.pts) changes.push({ field, from: a, to: b, delta: round(b - a), unit: "pts" });
      else if (rule.pct != null && a !== 0 && Math.abs((b - a) / a) * 100 >= rule.pct) changes.push({ field, from: a, to: b, delta: round(((b - a) / a) * 100), unit: "pct" });
      else if (rule.pct != null && a === 0 && b !== 0) changes.push({ field, from: a, to: b, delta: 100, unit: "pct" });
    }
    if (config.alert && !p[config.alert] && row[config.alert]) changes.push({ field: config.alert, from: false, to: true, delta: 1, unit: "pts" });
    if (changes.length) out.changed.push({ key, row, prev: p, changes });
    else out.unchanged += 1;
  }
  for (const [key, row] of prev) if (!cur.has(key)) out.gone.push({ key, row });
  return out;
}

export function shouldDeliver(diff: Diff, onlyIfChanged: boolean, config: DiffConfig = {}): boolean {
  if (!onlyIfChanged) return true;
  if (config.alert) return diff.changed.length > 0 || diff.new.some((e) => !!e.row[config.alert!]);
  return diff.new.length > 0 || diff.gone.length > 0 || diff.changed.length > 0;
}

const round = (n: number) => Math.round(n * 100) / 100;
