"use client";
/** Choose what a card shows: its kind (for a new card), filters, and the kind's own settings. */
import { useState } from "react";
import type { CardConfig, CardKind, CardSize } from "@/pulses/cards";
import { MultiSelect } from "../MultiSelect";
import { SelectInput } from "../kit/SelectInput";

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
        {/* divs, not labels: a label around the select's button would open it on a click on its text */}
        <div className="wf"><span>Platform</span>
          <SelectInput withSearch size="sm" ariaLabel="Platform" value={platform ?? "all"} onChange={(v) => setPlatform(v as CardConfig["platform"])}
            options={[{ value: "all", label: "TikTok + Instagram" }, { value: "tiktok", label: "TikTok" }, { value: "instagram", label: "Instagram" }]} />
        </div>
        <div className="wf"><span>Period</span>
          <SelectInput withSearch size="sm" ariaLabel="Period" value={period} onChange={setPeriod} searchPlaceholder="Search periods"
            options={[
              { value: "latest-month", label: "Latest month", group: "Moves with the data" },
              { value: "latest-week", label: "Latest full week", group: "Moves with the data" },
              ...options.months.map((m) => ({ value: m.key, label: m.label, group: "Months" })),
              ...options.weeks.map((w) => ({ value: w.key, label: w.label, group: "Weeks" })),
            ]} />
        </div>
        <div className="wf"><span>Size</span>
          <SelectInput withSearch size="sm" ariaLabel="Size" value={size} onChange={(v) => setSize(v as CardSize)}
            options={[{ value: "s", label: "Small (a third)" }, { value: "m", label: "Half" }, { value: "l", label: "Full width" }]} />
        </div>
        <div className="wf wide"><span>{kind === "closeup" ? <>Brand <small>(one; empty = the most-posted brand)</small></> : LANDSCAPE.has(kind) ? <>Brands <small>(up to 8; empty = the 8 most-posted)</small></> : <>Brands <small>(empty = all brands)</small></>}</span><MultiSelect options={options.brands} value={brands} onChange={(ids) => setBrands(kind === "closeup" ? ids.slice(-1) : ids)} placeholder={kind === "closeup" ? "Most-posted brand" : LANDSCAPE.has(kind) ? "Most-posted brands" : "All brands"} /></div>
        {kind === "kpi" && (
          <div className="wf"><span>Number</span>
            <SelectInput withSearch size="sm" ariaLabel="Number" value={metric} onChange={(v) => setMetric(v as CardConfig["metric"] & string)}
              options={[{ value: "views", label: "Views" }, { value: "posts", label: "Content" }, { value: "engagements", label: "Engagement" }, { value: "er", label: "Engagement rate" }]} />
          </div>
        )}
        {kind === "trend" && (
          <div className="wf"><span>Lines show</span>
            <SelectInput withSearch size="sm" ariaLabel="Lines show" value={metric} onChange={(v) => setMetric(v as CardConfig["metric"] & string)}
              options={[{ value: "posts", label: "Content" }, { value: "views", label: "Views" }]} />
          </div>
        )}
        {kind === "content" && (
          <>
            <div className="wf"><span>Sort by</span>
              <SelectInput withSearch size="sm" ariaLabel="Sort by" value={sort} onChange={(v) => setSort(v as CardConfig["sort"] & string)}
                options={[{ value: "views", label: "Views" }, { value: "engagement", label: "Engagement" }, { value: "er", label: "Engagement rate" }]} />
            </div>
            <label className="wf"><span>Keyword or @username</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="optional" maxLength={80} /></label>
          </>
        )}
        {kind === "creators" && (
          <div className="wf"><span>Rank by</span>
            <SelectInput withSearch size="sm" ariaLabel="Rank by" value={by} onChange={(v) => setBy(v as "views" | "comments")}
              options={[{ value: "views", label: "Views" }, { value: "comments", label: "Comments" }]} />
          </div>
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
