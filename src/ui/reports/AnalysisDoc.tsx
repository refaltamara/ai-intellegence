"use client";
/** One analysis as a report (PRD §7, prototype "week-35" structure): the lead, What changed, the chart, the table, Worth acting on, caveats. */
import { useState } from "react";
import type { ReportRow } from "@/reports/store";
import type { ChartSpec, Evidence } from "@/skills/types";
import { RichText } from "../Ask";
import { Chart } from "../Chart";
import { cn } from "../cn";
import { EvidenceList } from "../Evidence";
import { StatusPill } from "../kit/StatusPill";
import { DataTable, DocCard, MUTED } from "./docParts";

const HIDE = new Set(["evidence_ids", "evidence_id", "post_id", "creator_id", "creator_key", "top_creator_ids", "brands", "used_by", "shared_list", "months_active_list", "top_posts", "caption", "hashtags", "positive_pct", "negative_pct", "top_topics", "top_questions", "topics"]);
const BAR_COLS = ["share_of_voice_pct", "share_of_posts_pct", "sov_posts_pct", "cart_pct", "cart_share_pct"];
const PREFER = ["brand_id", "source", "creator_handle", "week", "tier", "stage", "posts", "creators", "views", "share_of_voice_pct", "share_of_posts_pct", "cart_share_pct", "cart_pct", "er_pct", "comment_rate_pct", "in_wave", "multiple", "creators_now", "affiliate_accounts", "shared_creators", "consecutive_months", "views_per_1k", "url", "posted_at"];

export function AnalysisDoc({ report }: { report: ReportRow }) {
  const [openEv, setOpenEv] = useState<string[]>([]);
  const b = report.blocks;
  const evidence: Record<string, Evidence> = Object.fromEntries((b.evidence ?? []).map((e) => [e.id, e]));
  const rows = b.rows ?? [];
  const keys = rows.length ? Object.keys(rows[0]).filter((k) => !HIDE.has(k) && typeof rows[0][k] !== "object") : [];
  const cols = [...PREFER.filter((k) => keys.includes(k)), ...keys.filter((k) => !PREFER.includes(k))].slice(0, 8);
  const barCol = cols.find((c) => BAR_COLS.includes(c));

  return (
    <>
      <DocCard>
        <div className="max-w-3xl text-base leading-relaxed text-gray-800"><RichText text={b.sections?.headline ?? ""} onChip={(id) => setOpenEv((o) => (o[0] === id && o.length === 1 ? [] : [id]))} /></div>
        {openEv.length > 0 && <EvidenceList items={openEv.map((id) => evidence[id]).filter(Boolean)} title={`Evidence · ${openEv.join(", ")}`} />}
      </DocCard>
      {b.diff && (
        <DocCard title="What changed">
          {b.diff.first_run || !b.changed_entries?.length ? (
            <p className={MUTED}>{b.what_changed?.[0] ?? "No changes."}</p>
          ) : (
            <ul className="flex list-none flex-col divide-y divide-card-border">
              {b.changed_entries.map((e) => {
                const up = e.kind === "new" || (e.kind !== "gone" && (e.delta ?? 0) >= 0);
                return (
                  <li key={e.kind + e.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm first:pt-0 last:pb-0">
                    <b className="font-semibold text-gray-900">{e.label}</b>
                    <span className="min-w-0 flex-1 text-gray-600">{e.detail}</span>
                    {e.kind === "new" ? <StatusPill tone="brand">NEW</StatusPill> : e.kind === "gone" ? <StatusPill tone="neutral">GONE</StatusPill> : (
                      <span className={cn("font-semibold tabular-nums", up ? "text-green-700" : "text-red-700")}>{(e.delta ?? 0) > 0 ? "+" : ""}{e.delta}{e.unit === "pct" ? "%" : " pts"}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DocCard>
      )}
      {b.chart ? <DocCard title="Chart"><Chart spec={b.chart as ChartSpec} /></DocCard> : null}
      {rows.length > 0 && (
        <DocCard title={b.skill === "compare" ? "Brand table" : "Table"} hint={`${rows.length} of ${b.rows_total} rows${rows.length > 25 ? ", the first 25 shown" : ""}`}>
          <DataTable rows={rows.slice(0, 25)} cols={cols} bar={barCol} />
        </DocCard>
      )}
      {b.sections?.worth_acting_on && (
        <DocCard title="Worth acting on"><div className="max-w-3xl text-sm leading-relaxed text-gray-700"><RichText text={b.sections.worth_acting_on} onChip={(id) => setOpenEv([id])} /></div></DocCard>
      )}
      {!!b.caveats?.length && <DocCard title="Caveats"><ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-gray-500">{b.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul></DocCard>}
    </>
  );
}
