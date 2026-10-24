"use client";
/**
 * The creator-discovery filter form, shared by the Skills library page and the
 * evidence pane's "Refine" drawer (PRD-v2 amendment: discovery folds into the pane).
 * Pure form state in, skill parameters out; nothing here runs anything.
 */
import { MultiSelect } from "./MultiSelect";
import { cn } from "./cn";
import { Chip, Field, TextField } from "./kit/Form";
import { SelectInput } from "./kit/SelectInput";

export const TIERS = ["nano", "micro", "mid", "macro", "mega"];
export const TIER_LABEL: Record<string, string> = { nano: "Nano · ≤10K", micro: "Micro · 10K–50K", mid: "Mid · 50K–500K", macro: "Macro · 500K–1M", mega: "Mega · 1M+" };
export const RANK_LABEL: Record<string, string> = { views: "Views at day 7 (total in window)", avg_views: "Avg views per post", comment_rate: "Comment rate", er_pct: "Engagement rate", views_per_1k: "Views per 1k followers", median_views: "Median views" };
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03" -> "Mar 2026" */
export function monthLabel(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  return `${MONTH_NAMES[(mm ?? 1) - 1]} ${y}`;
}
/** Selected months (YYYY-MM) -> one contiguous {from,to}; months between the first and last are included. */
export function monthsToWindow(months: string[]): { from: string; to: string } | null {
  if (!months.length) return null;
  const sorted = [...months].sort();
  const [ly, lm] = sorted[sorted.length - 1].split("-").map(Number);
  const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate();
  return { from: `${sorted[0]}-01`, to: `${sorted[sorted.length - 1]}-${String(lastDay).padStart(2, "0")}` };
}
export function monthsBetween(months: string[]): number {
  if (months.length < 2) return 0;
  const sorted = [...months].sort();
  const idx = (m: string) => { const [y, mm] = m.split("-").map(Number); return y * 12 + mm; };
  return idx(sorted[sorted.length - 1]) - idx(sorted[0]) + 1 - sorted.length;
}

export type DiscoveryForm = { platform: string; tiers: string[]; used_by: string[]; exclude_used_by: string[]; rank_by: string; months: string[]; min_followers: string; max_followers: string; limit: string };

export function defaultForm(months: string[]): DiscoveryForm {
  return { platform: "tiktok", tiers: [], used_by: [], exclude_used_by: [], rank_by: "views", months: months.slice(-3), min_followers: "", max_followers: "", limit: "50" };
}

/** A form prefilled from a run's resolved parameters, so "Refine" starts from what produced the list. */
export function formFromParams(p: Record<string, unknown>, months: string[]): DiscoveryForm {
  const w = p.window as { from?: string; to?: string } | undefined;
  const picked = w?.from && w?.to ? months.filter((m) => m >= w.from!.slice(0, 7) && m <= w.to!.slice(0, 7)) : months.slice(-3);
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  return {
    platform: typeof p.platform === "string" ? p.platform : "all",
    tiers: arr(p.tiers), used_by: arr(p.used_by), exclude_used_by: arr(p.exclude_used_by),
    rank_by: typeof p.rank_by === "string" ? p.rank_by : "views",
    months: picked,
    min_followers: p.min_followers != null ? String(p.min_followers) : "",
    max_followers: p.max_followers != null ? String(p.max_followers) : "",
    limit: p.limit != null ? String(p.limit) : "50",
  };
}

export function formToParams(form: DiscoveryForm): Record<string, unknown> {
  const window = monthsToWindow(form.months) ?? { last_n_days: 90 };
  const params: Record<string, unknown> = { platform: form.platform, rank_by: form.rank_by, limit: Number(form.limit) || 50, window };
  if (form.tiers.length) params.tiers = form.tiers;
  if (form.used_by.length) params.used_by = form.used_by;
  // an explicit empty list means "exclude nobody"; the skill's default would exclude the client
  params.exclude_used_by = form.exclude_used_by;
  const minF = Number(form.min_followers), maxF = Number(form.max_followers);
  if (form.min_followers !== "" && Number.isFinite(minF)) params.min_followers = minF;
  if (form.max_followers !== "" && Number.isFinite(maxF)) params.max_followers = maxF;
  return params;
}

export function followersInvalid(form: DiscoveryForm): boolean {
  return form.min_followers !== "" && form.max_followers !== "" && Number(form.min_followers) > Number(form.max_followers);
}

export function DiscoveryFilters({ form, onChange, brands, months, compact = false }: { form: DiscoveryForm; onChange: (f: DiscoveryForm) => void; brands: { id: string; name: string; hint?: string }[]; months: string[]; compact?: boolean }) {
  const set = <K extends keyof DiscoveryForm>(k: K, v: DiscoveryForm[K]) => onChange({ ...form, [k]: v });
  const toggleIn = (k: "tiers" | "months", v: string) => set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v]);
  const gap = monthsBetween(form.months);
  const invalid = followersInvalid(form);
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", !compact && "lg:grid-cols-4")}>
      <Field label="Platform" group>
        <SelectInput withSearch size="sm" ariaLabel="Platform" value={form.platform} onChange={(v) => set("platform", v)}
          options={[{ value: "tiktok", label: "TikTok" }, { value: "instagram", label: "Instagram" }, { value: "all", label: "All" }]} />
      </Field>
      <Field label="Rank by" group>
        <SelectInput withSearch size="sm" ariaLabel="Rank by" value={form.rank_by} onChange={(v) => set("rank_by", v)}
          options={Object.entries(RANK_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
      </Field>
      <Field group label="Followers" hint={invalid ? <span className="font-semibold text-amber-700">min is above max</span> : undefined}>
        <div className="grid grid-cols-2 gap-2">
          <TextField inputMode="numeric" aria-label="Minimum followers" value={form.min_followers} onChange={(e) => set("min_followers", e.target.value.replace(/[^\d]/g, ""))} placeholder="min" />
          <TextField inputMode="numeric" aria-label="Maximum followers" value={form.max_followers} onChange={(e) => set("max_followers", e.target.value.replace(/[^\d]/g, ""))} placeholder="max" />
        </div>
      </Field>
      <Field label="Limit">
        <TextField inputMode="numeric" value={form.limit} onChange={(e) => set("limit", e.target.value.replace(/[^\d]/g, ""))} />
      </Field>
      <Field wide group label="Tiers" hint={form.tiers.length ? `${form.tiers.length} selected` : "none selected = any tier"}>
        <div className="flex flex-wrap gap-1.5">{TIERS.map((t) => <Chip key={t} on={form.tiers.includes(t)} onClick={() => toggleIn("tiers", t)}>{TIER_LABEL[t]}</Chip>)}</div>
      </Field>
      <Field wide group label="Months" hint={form.months.length === 0 ? "none selected = last 90 days of data" : gap > 0 ? `${gap} month${gap > 1 ? "s" : ""} in between included too (one continuous window)` : `${form.months.length} selected`}>
        <div className="flex flex-wrap gap-1.5">
          {months.map((m) => <Chip key={m} on={form.months.includes(m)} onClick={() => toggleIn("months", m)}>{monthLabel(m)}</Chip>)}
          <Chip dashed onClick={() => set("months", form.months.length === months.length ? [] : [...months])}>{form.months.length === months.length ? "Clear" : "All"}</Chip>
        </div>
      </Field>
      <Field wide group label="Used by brands" hint="creator must have posted for any of these; empty = any tracked brand">
        <MultiSelect options={brands} value={form.used_by} onChange={(v) => set("used_by", v)} placeholder="Search a brand…" />
      </Field>
      <Field wide group label="Exclude used by" hint="creator must not have posted for these">
        <MultiSelect options={brands} value={form.exclude_used_by} onChange={(v) => set("exclude_used_by", v)} placeholder="Search a brand…" />
      </Field>
    </div>
  );
}
