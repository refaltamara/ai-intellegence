"use client";
import Link from "next/link";
import { sendSignal } from "./signal";
import { useState } from "react";
import type { ToolCallRecord } from "@/chat/persist";
import type { ChartSpec, Evidence } from "@/skills/types";
import { Chart } from "./Chart";
import { EvidenceList } from "./Evidence";
import { fmtNum } from "./format";
import { paneOf } from "../chat/pane";
import { ProposalCard } from "./ProposalCard";
import { cn } from "./cn";
import { Button } from "./kit/Button";

export { cellOf, columnsOf } from "./table";
import { cellOf, columnsOf } from "./table";

const MAX_ROWS = 12;

export function ResultCard(props: { tool: ToolCallRecord; evidence: Record<string, Evidence>; onOpenEvidence?: (ids: string[]) => void; decisionId?: string | null; onOpenPane?: () => void; codename?: string }) {
  // something CeMO made or proposed for the team has its own card and buttons
  if (props.tool.proposal) return <ProposalCard tool={props.tool} codename={props.codename} />;
  return <AnalysisCard {...props} />;
}

function AnalysisCard({ tool, evidence, onOpenEvidence, decisionId = null, onOpenPane }: { tool: ToolCallRecord; evidence: Record<string, Evidence>; onOpenEvidence?: (ids: string[]) => void; decisionId?: string | null; onOpenPane?: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [chartOn, setChartOn] = useState(false);
  const rows = tool.rows ?? [];
  const cols = columnsOf(rows);
  const title = tool.title ?? (tool.name === "query_metrics" ? "The numbers" : tool.skill ?? "Analysis");
  const meta = (tool.meta ?? {}) as { matched?: number; returned?: number; caveats?: string[]; data_window?: { from: string; to: string } };
  const isDiscovery = tool.skill === "discovery" && tool.run_id;
  const visible = showAll ? rows : rows.slice(0, MAX_ROWS);
  const numeric = (k: string) => rows.some((r) => typeof r[k] === "number");

  // with a pane on the page, the object lives there and the thread keeps a one-line strip
  const pane = onOpenPane ? paneOf(tool) : null;
  if (pane && pane.kind !== "file") {
    const m = (tool.meta ?? {}) as { matched?: number };
    const n = tool.status === "ok" ? `${fmtNum(m.matched ?? rows.length)} matched` : tool.status;
    return (
      <button type="button" onClick={onOpenPane} className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-card-border bg-white px-4 py-3 text-left transition-all hover:border-brand-palette-300 hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600">
        <span className="min-w-0 truncate text-sm font-semibold text-gray-900">{pane.title}</span>
        <span className="flex shrink-0 items-center gap-3 text-xs text-gray-500">
          {pane.kind === "agent_draft" ? "" : n}
          <b className="font-semibold text-brand-palette-700 group-hover:underline">{pane.kind === "table" ? "Open the list" : pane.kind === "chart" ? "Open the chart" : "Open"}</b>
        </span>
      </button>
    );
  }
  if (tool.name === "create_agent_draft") return <DraftCard draft={tool.draft as Record<string, unknown>} decisionId={decisionId} />;
  const chart = tool.chart as ChartSpec | undefined;
  // a chart with fewer than three points says nothing a sentence cannot
  const showChart = !!chart && Array.isArray(chart.x) && chart.x.length >= 3;
  const hasBody = rows.length > 0 || showChart;
  const count = tool.status === "ok" ? `${fmtNum(meta.matched ?? rows.length)} matched` : tool.status;
  const head = (
    <>
      <span className="min-w-0 text-sm font-semibold text-gray-900">{title}{meta.data_window ? <span className="font-normal text-gray-500"> · {meta.data_window.from} to {meta.data_window.to}</span> : null}</span>
      <span className="flex shrink-0 items-center gap-3 text-xs text-gray-500">
        {count}
        {hasBody ? <b className="font-semibold text-brand-palette-700">{open ? "Hide" : rows.length ? "Show the list" : "Show the chart"}</b> : null}
      </span>
    </>
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-white">
      {hasBody ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-palette-600">{head}</button>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-3">{head}</div>
      )}
      {tool.status === "unavailable" && <p className="mx-4 mb-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">{tool.message}</p>}
      {tool.status === "error" && <p role="alert" className="mx-4 mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{tool.message}</p>}
      {open && (
        <div className="border-t border-card-border">
          {isDiscovery && (
            <div className="flex flex-wrap items-center gap-3 px-4 pt-3">
              <Link className="inline-flex min-h-10 items-center rounded-xl bg-primary px-3 text-xs font-semibold text-white hover:bg-brand-palette-700" href={`/skills/discovery?run=${tool.run_id}`}>Open the full list</Link>
              <span className="text-xs text-gray-500">every row, filters, CSV export</span>
            </div>
          )}
          {showChart && rows.length > 0 ? (
            <div className="px-4 pt-3">
              <button type="button" className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:border-brand-palette-300 hover:text-brand-palette-700" onClick={() => { if (!chartOn) sendSignal("chat.show_chart", { where: "card" }); setChartOn((c) => !c); }}>{chartOn ? "Hide chart" : "Show chart"}</button>
            </div>
          ) : null}
          {showChart && (chartOn || rows.length === 0) ? <div className="px-4 pt-3"><Chart spec={chart} /></div> : null}
          {rows.length > 0 && (
            <div className="pt-3">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-0 border-y border-card-border bg-white">
                      {cols.map((c) => <th key={c} className={cn("whitespace-nowrap px-4 py-2.5 text-left text-sm font-semibold capitalize text-gray-900", numeric(c) && "text-right")}>{c.replace(/_/g, " ")}</th>)}
                      {onOpenEvidence && <th className="px-4 py-2.5"><span className="sr-only">Evidence</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r, i) => (
                      <tr key={i} onClick={() => onOpenEvidence?.((r.evidence_ids as string[]) ?? [])} className={cn("border-b border-gray-100 last:border-b-0 even:bg-gray-50/60", onOpenEvidence && "cursor-pointer hover:bg-brand-palette-50")}>
                        {cols.map((c) => <td key={c} className={cn("px-4 py-2.5 text-gray-700", numeric(c) && "text-right tabular-nums")}>{cellOf(c, r[c])}</td>)}
                        {onOpenEvidence && (
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            {((r.evidence_ids as string[]) ?? []).slice(0, 3).map((id) => <span key={id} className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-brand-palette-100 px-1.5 text-[11px] font-bold text-brand-palette-800">{id.replace("ev_", "")}</span>)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > MAX_ROWS && (
                <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-4 py-3">
                  <button type="button" className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:border-brand-palette-300 hover:text-brand-palette-700" onClick={() => setShowAll(!showAll)}>{showAll ? `Show first ${MAX_ROWS}` : `Show all ${rows.length}`}</button>
                  <span className="text-xs text-gray-500">Click a row to open its evidence</span>
                </div>
              )}
            </div>
          )}
          {!!meta.caveats?.length && (
            <div className="border-t border-gray-100 px-4 py-3">
              <button type="button" aria-expanded={about} className="cursor-pointer text-xs font-semibold text-brand-palette-700 underline-offset-2 hover:underline" onClick={() => setAbout((a) => !a)}>{about ? "Hide data notes" : "About this data"}</button>
              {about && <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-gray-600">{meta.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            </div>
          )}
          {rows.length === 0 && !showChart && tool.status === "ok" && <p className="px-4 py-3 text-sm text-gray-500">No rows matched.</p>}
          {!rows.length && !meta.caveats?.length ? <div className="h-3" /> : null}
        </div>
      )}
    </div>
  );
}

export function DraftCard({ draft, decisionId = null }: { draft: Record<string, unknown>; decisionId?: string | null }) {
  const [state, setState] = useState<{ busy: boolean; msg: string; done: boolean }>({ busy: false, msg: "", done: false });
  if (!draft) return null;
  const schedule = (draft.schedule ?? {}) as { human?: string; cron?: string; tz?: string };
  const delivery = (draft.delivery ?? {}) as { channels?: string[]; email?: string };
  async function create() {
    setState({ busy: true, msg: "", done: false });
    const r = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, decision_id: decisionId }) });
    const j = await r.json();
    setState({ busy: false, msg: j.error ? j.error : `Created "${j.agent.name}"`, done: !j.error });
  }
  const fields: [string, React.ReactNode][] = [
    ["Name", String(draft.name ?? "")],
    ["Skill", <><span className="text-gray-500">/</span>{String(draft.skill ?? "")}</>],
    ["Schedule", `${schedule.human ?? schedule.cron} · ${schedule.tz}`],
    ["Params", <code key="p" className="break-all text-xs">{JSON.stringify(draft.params ?? {})}</code>],
    ["Deliver to", (delivery.channels ?? []).join(", ") || "in_app"],
    ["Only if changed", draft.only_if_changed ? "yes" : "no"],
  ];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-card-border bg-white p-4">
      <h4 className="text-sm font-semibold text-gray-900">Here&apos;s how I read that. Schedule it as is, or edit it under Reports afterwards.</h4>
      <dl className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-100">
        {fields.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
            <dt className="text-gray-500">{k}</dt>
            <dd className="font-semibold text-gray-900">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {state.msg && <span role={state.done ? "status" : "alert"} className={cn("text-xs", state.done ? "text-green-700" : "text-red-700")}>{state.msg}</span>}
        {state.done
          ? <Link className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:border-brand-palette-300 hover:text-brand-palette-700" href="/reports">See it in Reports</Link>
          : <Button size="sm" isLoading={state.busy} loadingLabel="Starting…" onClick={create}>Schedule it</Button>}
      </div>
    </div>
  );
}

export function EvidencePanel({ ids, evidence, title }: { ids: string[]; evidence: Record<string, Evidence>; title?: string }) {
  const items = ids.map((id) => evidence[id]).filter(Boolean);
  return <EvidenceList items={items} title={title} />;
}
