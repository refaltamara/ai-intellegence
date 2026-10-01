"use client";
/** Choose what a card shows: its kind (for a new card), filters, and the kind's own settings. */
import { useState } from "react";
import type { CardConfig, CardKind, CardSize } from "@/pulses/cards";
import { MultiSelect } from "../MultiSelect";

export type Options = { brands: { id: string; name: string }[]; months: { key: string; label: string }[]; weeks: { key: string; label: string }[] };
const KINDS: { kind: CardKind; label: string; hint: string }[] = [
  { kind: "kpi", label: "Headline number", hint: "One number against the period before" },
  { kind: "rankings", label: "Brand rankings", hint: "Brands by views, with growth" },
  { kind: "trend", label: "Mentions over time", hint: "Weekly lines per brand" },
  { kind: "tiers", label: "Creator tiers", hint: "Nano to mega" },
  { kind: "creators", label: "Top creators", hint: "By views or comments" },
  { kind: "content", label: "Trending content", hint: "Posts that travelled" },
  { kind: "tier_mix", label: "Tier mix by brand", hint: "Who wins views at which tier" },
  { kind: "products", label: "What creators push", hint: "Categories and cart products" },
  { kind: "posting", label: "Posting pattern", hint: "Days, peaks, promo, time of day" },
  { kind: "closeup", label: "Brand close-up", hint: "One brand in depth" },
  { kind: "patterns", label: "Patterns", hint: "Clippers, seeding tags, affiliates" },
];

const LANDSCAPE = new Set<CardKind>(["tier_mix", "products", "posting", "closeup", "patterns"]);

export function CardEditor({ options, initial, onSave, onCancel, busy }: {
  options: Options;
  initial?: { kind: CardKind; title: string | null; size: CardSize; config: CardConfig };
  onSave: (v: { kind: CardKind; title: string; size: CardSize; config: CardConfig }) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [kind, setKind] = useState<CardKind>(initial?.kind ?? "kpi");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [size, setSize] = useState<CardSize>(initial?.size ?? "m");
  const c = initial?.config;
  const [platform, setPlatform] = useState(c?.platform ?? "all");
  const [brands, setBrands] = useState<string[]>(c?.brands ?? []);
  const [period, setPeriod] = useState(c?.period ?? "latest-month");
  const [metric, setMetric] = useState(c?.metric ?? (kind === "trend" ? "posts" : "views"));
  const [sort, setSort] = useState(c?.sort ?? "views");
  const [by, setBy] = useState(c?.by ?? "views");
  const [limit, setLimit] = useState(c?.limit ?? 8);
  const [q, setQ] = useState(c?.q ?? "");
  const DEFAULT_SIZE: Record<string, CardSize> = { kpi: "s", creators: "m", closeup: "m" };

  return (
    <div className="ceditor">
      {!initial && (
        <div className="ckinds">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" className={kind === k.kind ? "on" : ""} onClick={() => { setKind(k.kind); setSize(DEFAULT_SIZE[k.kind] ?? "l"); if (k.kind === "trend") setMetric("posts"); }}>
              <b>{k.label}</b><small>{k.hint}</small>
            </button>
          ))}
        </div>
      )}
      <div className="cgrid">
        <label className="wf"><span>Title <small>(optional)</small></span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Say what it is for" maxLength={80} /></label>
        <label className="wf"><span>Platform</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as CardConfig["platform"])}><option value="all">TikTok + Instagram</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option></select>
        </label>
        <label className="wf"><span>Period</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <optgroup label="Moves with the data"><option value="latest-month">Latest month</option><option value="latest-week">Latest full week</option></optgroup>
            <optgroup label="Months">{options.months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
            <optgroup label="Weeks">{options.weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}</optgroup>
          </select>
        </label>
        <label className="wf"><span>Size</span>
          <select value={size} onChange={(e) => setSize(e.target.value as CardSize)}><option value="s">Small (a third)</option><option value="m">Half</option><option value="l">Full width</option></select>
        </label>
        <div className="wf wide"><span>{kind === "closeup" ? <>Brand <small>(one; empty = the most-posted brand)</small></> : LANDSCAPE.has(kind) ? <>Brands <small>(up to 8; empty = the 8 most-posted)</small></> : <>Brands <small>(empty = all brands)</small></>}</span><MultiSelect options={options.brands} value={brands} onChange={(ids) => setBrands(kind === "closeup" ? ids.slice(-1) : ids)} placeholder={kind === "closeup" ? "Most-posted brand" : LANDSCAPE.has(kind) ? "Most-posted brands" : "All brands"} /></div>
        {kind === "kpi" && (
          <label className="wf"><span>Number</span>
            <select value={metric} onChange={(e) => setMetric(e.target.value as CardConfig["metric"] & string)}><option value="views">Views</option><option value="posts">Content</option><option value="engagements">Engagement</option><option value="er">Engagement rate</option></select>
          </label>
        )}
        {kind === "trend" && (
          <label className="wf"><span>Lines show</span>
            <select value={metric} onChange={(e) => setMetric(e.target.value as CardConfig["metric"] & string)}><option value="posts">Content</option><option value="views">Views</option></select>
          </label>
        )}
        {kind === "content" && (
          <>
            <label className="wf"><span>Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as CardConfig["sort"] & string)}><option value="views">Views</option><option value="engagement">Engagement</option><option value="er">Engagement rate</option></select>
            </label>
            <label className="wf"><span>Keyword or @username</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="optional" maxLength={80} /></label>
          </>
        )}
        {kind === "creators" && (
          <label className="wf"><span>Rank by</span>
            <select value={by} onChange={(e) => setBy(e.target.value as "views" | "comments")}><option value="views">Views</option><option value="comments">Comments</option></select>
          </label>
        )}
        {(kind === "rankings" || kind === "creators" || kind === "content") && (
          <label className="wf"><span>How many</span><input type="number" min={3} max={kind === "content" ? 12 : kind === "creators" ? 10 : 25} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></label>
        )}
      </div>
      <div className="wactions">
        <button className="btn sm ghost" onClick={onCancel}>Cancel</button>
        <button className="btn pri sm" disabled={busy} onClick={() => onSave({ kind, title, size, config: { platform, brands, period, metric, sort, by, limit, q } as CardConfig })}>{busy ? "Saving…" : initial ? "Save card" : "Add card"}</button>
      </div>
    </div>
  );
}
