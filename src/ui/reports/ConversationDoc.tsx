"use client";
/** A report made from a whole conversation: key findings and next steps, then each question with its answer, tables and evidence. */
import { useState } from "react";
import type { ConversationBlocks, ConversationTool } from "@/reports/conversation";
import type { ChartSpec, Evidence } from "@/skills/types";
import { RichText } from "../Ask";
import { Chart } from "../Chart";
import { EvidenceList } from "../Evidence";
import { fmtNum } from "../format";
import { Button } from "../kit/Button";
import { sendSignal } from "../signal";
import { DataTable, DocCard, MUTED } from "./docParts";

const HIDE = new Set(["evidence_ids", "evidence_id", "post_id", "creator_id", "creator_key", "top_creator_ids", "used_by", "shared_list", "months_active_list", "top_posts", "caption", "hashtags", "top_topics", "top_questions", "topics"]);
const LIST = "flex list-outside flex-col gap-2 pl-5 text-sm leading-relaxed text-gray-800 marker:text-gray-500";

function ToolTable({ t }: { t: ConversationTool }) {
  const [chart, setChart] = useState(false);
  const rows = t.rows;
  const first = rows[0] ?? {};
  const cols = Object.keys(first).filter((k) => !HIDE.has(k) && (first[k] == null || typeof first[k] !== "object")).slice(0, 7);
  const spec = t.chart as ChartSpec | null;
  const hasChart = !!spec && Array.isArray(spec.x) && spec.x.length >= 3;
  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-0 border-b border-card-border px-4 py-3">
        <b className="text-sm font-semibold text-gray-900">{t.title}</b>
        <span className="text-xs text-gray-500">{t.status === "ok" ? `${fmtNum(t.rows_total)} row${t.rows_total === 1 ? "" : "s"}` : t.status}{t.data_window ? ` · ${t.data_window.from} to ${t.data_window.to}` : ""}</span>
        {hasChart && <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { if (!chart) sendSignal("chat.show_chart", { where: "doc" }); setChart((c) => !c); }}>{chart ? "Hide chart" : "Show chart"}</Button>}
      </div>
      <div className="flex flex-col gap-3 p-4">
        {t.status !== "ok" && t.message && <p className={MUTED}>{t.message}</p>}
        {hasChart && (chart || !rows.length) && <Chart spec={spec!} />}
        {rows.length > 0 && <DataTable rows={rows.slice(0, 8)} cols={cols} />}
        {t.rows_total > 8 && <small className="text-xs text-gray-500">First 8 of {fmtNum(t.rows_total)} rows.</small>}
      </div>
    </div>
  );
}

export function ConversationDoc({ blocks: b }: { blocks: ConversationBlocks }) {
  const [openEv, setOpenEv] = useState<string[]>([]);
  const evidence: Record<string, Evidence> = Object.fromEntries((b.evidence ?? []).map((e) => [e.id, e]));
  const chip = (id: string) => setOpenEv((o) => (o[0] === id && o.length === 1 ? [] : [id]));
  return (
    <>
      <DocCard title="Key findings">
        <ul className={`${LIST} list-disc`}>{b.summary.findings.map((f, i) => <li key={i}><RichText text={f} onChip={chip} /></li>)}</ul>
        {b.summary.actions.length > 0 && (
          <>
            <h3 className="text-base font-semibold text-gray-900">What to do next</h3>
            <ol className={`${LIST} list-decimal`}>{b.summary.actions.map((a, i) => <li key={i}><RichText text={a} onChip={chip} /></li>)}</ol>
          </>
        )}
        {openEv.length > 0 && <EvidenceList items={openEv.map((id) => evidence[id]).filter(Boolean)} title={`Evidence · ${openEv.join(", ")}`} />}
      </DocCard>
      {b.sections.map((s, i) => (
        <DocCard key={i}>
          <div className="flex items-start gap-3">
            <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-brand-palette-100 px-1 text-xs font-bold tabular-nums text-brand-palette-800">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight text-gray-900">{s.question || "Answer"}</h2>
              {s.context && <p className="text-xs text-gray-500">Asked from: {s.context}</p>}
            </div>
          </div>
          {s.answer && <div className="max-w-3xl text-sm leading-relaxed text-gray-800"><RichText text={s.answer} onChip={chip} /></div>}
          {s.tools.map((t, j) => <ToolTable key={j} t={t} />)}
        </DocCard>
      ))}
      {b.evidence.length > 0 && <DocCard title="Evidence"><EvidenceList items={b.evidence} /></DocCard>}
    </>
  );
}
