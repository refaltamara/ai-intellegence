"use client";
/**
 * The evidence pane (PRD-v2 §2): the object on the right of the thread. One tab per
 * object; a table you can sort, filter, select and exclude from; a chart with a
 * range and series toggles; an agent draft you can edit and start. The footer holds
 * the only three actions: Pin to decision, Watch this, Export. Anything that changes
 * the meaning of the object goes to the model as a pane action; sort and filter stay here.
 */
import { AddToDeck } from "./AddToDeck";
import { sendSignal } from "./signal";
import { AddToPulse } from "./AddToPulse";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ToolCallRecord } from "@/chat/persist";
import type { ChartSpec, Evidence } from "@/skills/types";
import { applyPaneState, columnLabel, describeParams, rowKey, rowLabel, type PaneAction, type PaneKind, type PaneState } from "../chat/pane";
import { Chart } from "./Chart";
import { DiscoveryFilters, followersInvalid, formFromParams, formToParams, monthLabel, type DiscoveryForm } from "./DiscoveryFilters";
import { EvidenceList } from "./Evidence";
import { fmtDate, fmtNum } from "./format";
import { columnsOf, cellOf } from "./ResultCard";
import { cn } from "./cn";
import { Button } from "./kit/Button";
import { Chip, Field, TextField } from "./kit/Form";
import { SelectInput } from "./kit/SelectInput";

/** a Refine drawer: under the pane's header, above the list it re-runs */
const REFINE = "mx-5 mt-3 flex shrink-0 flex-col gap-4 rounded-2xl border border-card-border bg-gray-50 p-4";

export type PaneObject = { id: string; kind: PaneKind; title: string; tool: ToolCallRecord; evidence: Record<string, Evidence>; messageId: string };

type Props = {
  objects: PaneObject[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onCloseTab: (id: string) => void;
  states: Record<string, PaneState>;
  onState: (runId: string, state: PaneState) => void;
  onAction: (action: PaneAction) => void;
  onNote: (text: string) => void;
  busy: boolean;
  decisionId: string | null;
  conversationId: string | null;
  brands: { id: string; name: string; hint?: string }[];
  months: string[];
  expanded: boolean;
  onExpand: () => void;
  toast: (m: string) => void;
  /** a team with a brand panel pins into decks; a PR team into Pulses */
  kind?: string;
};

const ICON_BTN = "flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-base text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-brand-palette-600";
const LINKISH = "cursor-pointer text-xs font-semibold text-brand-palette-700 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50";

const WHAT: Record<string, string> ={ creator_id: "creators", brand_id: "brands", post_id: "posts", hashtag: "hashtags", theme: "themes", product_id: "products", campaign_id: "campaigns" };

export function Pane(p: Props) {
  const active = p.objects.find((o) => o.id === p.activeId) ?? p.objects[p.objects.length - 1];
  if (!active) return null;
  return (
    // beside the thread from 1101px; under that a sheet from the bottom, over the thread
    <aside aria-label="Evidence" className={cn(
      "flex min-h-0 min-w-0 flex-col bg-white font-sans",
      "min-[1101px]:flex-1 min-[1101px]:border-l min-[1101px]:border-gray-200",
      "max-[1100px]:fixed max-[1100px]:inset-x-0 max-[1100px]:bottom-0 max-[1100px]:z-45 max-[1100px]:h-[72vh] max-[1100px]:rounded-t-3xl max-[1100px]:border-t max-[1100px]:border-gray-200 max-[1100px]:shadow-2xl",
    )}>
      <div className="flex shrink-0 items-stretch border-b border-gray-200 max-[1100px]:rounded-t-3xl">
        <div role="tablist" aria-label="Open results" className="no-scrollbar flex min-w-0 flex-1 overflow-x-auto">
          {p.objects.map((o) => {
            const on = o.id === active.id;
            return (
              <div key={o.id} className={cn("group relative flex min-w-0 max-w-64 shrink-0 items-center border-r border-gray-100", on ? "bg-white" : "bg-gray-50")}>
                <button type="button" role="tab" aria-selected={on} onClick={() => p.onSelect(o.id)} title={o.title}
                  className={cn("flex h-12 min-w-0 cursor-pointer items-center gap-2 pl-4 text-xs font-semibold outline-none focus-visible:bg-gray-100", p.objects.length > 1 ? "pr-1" : "pr-4", on ? "text-gray-900" : "text-gray-500 hover:text-gray-900")}>
                  <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-sm", o.kind === "chart" ? "bg-brand-palette-400" : o.kind === "agent_draft" ? "bg-amber-500" : "bg-gray-400")} />
                  <span className="truncate">{o.title}</span>
                </button>
                {p.objects.length > 1 && (
                  <button type="button" onClick={() => p.onCloseTab(o.id)} aria-label={`Close ${o.title}`} className="mr-1.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-brand-palette-600">×</button>
                )}
                {on && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-palette-600" />}
              </div>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1 px-2">
          <button type="button" onClick={p.onExpand} aria-label={p.expanded ? "Back to split view" : "Give the pane the room"} title={p.expanded ? "Back to split view" : "Give the pane the room"} className={cn(ICON_BTN, "max-[1100px]:hidden")}>{p.expanded ? "⇤" : "⇥"}</button>
          <button type="button" onClick={p.onClose} aria-label="Close the pane" title="Close the pane" className={ICON_BTN}>×</button>
        </div>
      </div>
      {active.kind === "agent_draft" ? (
        <DraftObject key={active.id} obj={active} decisionId={p.decisionId} onDone={() => p.onCloseTab(active.id)} toast={p.toast} />
      ) : (
        <DataObject key={active.id} obj={active} p={p} />
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ table + chart */

function DataObject({ obj, p }: { obj: PaneObject; p: Props }) {
  const tool = obj.tool;
  const runId = tool.run_id ?? null;
  const state = (runId && p.states[runId]) || {};
  const rows = tool.rows ?? [];
  const diffKey = tool.diff_key;
  const cols = useMemo(() => columnsOf(rows), [rows]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showExcluded, setShowExcluded] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [refine, setRefine] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // chart series turned off
  // a chart only when asked for (DECISIONS, 1 Oct 2026); a result that is only a chart shows it
  const [chartOn, setChartOn] = useState(false);
  const excluded = new Set(state.excluded ?? []);
  const visible = useMemo(() => applyPaneState(rows, showExcluded ? { ...state, excluded: [] } : state, diffKey), [rows, state, showExcluded, diffKey]);
  const keyOf = (r: Record<string, unknown>) => rowKey(r, diffKey, rows.indexOf(r));
  const what = WHAT[diffKey ?? ""] ?? "rows";
  const meta = (tool.meta ?? {}) as { matched?: number; caveats?: string[]; data_window?: { from: string; to: string }; freshness?: string };
  const chart = tool.chart as ChartSpec | undefined;
  const showChart = !!chart && Array.isArray(chart.x) && chart.x.length >= 3;
  const chartSpec = showChart && chart && (chartOn || rows.length === 0) ? { ...chart, series: chart.series.filter((s) => !hidden.has(s.name)) } : null;
  const numeric = (k: string) => rows.some((r) => typeof r[k] === "number");
  const setState = (patch: Partial<PaneState>) => { if (runId) p.onState(runId, { ...state, ...patch }); };
  const sortBy = (k: string) => setState({ sort: state.sort?.key === k ? (state.sort.dir === "desc" ? { key: k, dir: "asc" } : null) : { key: k, dir: "desc" } });
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const canAct = !!runId && !p.busy;
  const hasWindow = !!(tool.params_resolved && "window" in tool.params_resolved);

  function exclude() {
    if (!runId || !selected.size) return;
    const ids = [...selected];
    p.onAction({ run_id: runId, action: "exclude_rows", ids, human: `You excluded ${ids.length} ${what}` });
    setSelected(new Set());
  }
  function putBack(ids: string[]) {
    if (!runId || !ids.length) return;
    p.onAction({ run_id: runId, action: "include_rows", ids, human: `You put ${ids.length} ${what} back` });
  }
  function setRange(days: number, label: string) {
    if (!runId) return;
    p.onAction({ run_id: runId, action: "set_params", params: { window: { last_n_days: days } }, human: `You changed the range to the last ${label}` });
  }
  function applyParams(params: Record<string, unknown>, human: string) {
    if (!runId) return;
    setRefine(false);
    p.onAction({ run_id: runId, action: "set_params", params, human });
  }
  async function watch() {
    if (!runId) return;
    const r = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from_skill_run_id: runId, decision_id: p.decisionId }) });
    const j = await r.json();
    p.toast(j.error ? j.error : "Scheduled for every Monday. Edit it under Reports.");
  }
  async function pin() {
    if (!runId || !p.decisionId) return;
    const r = await fetch(`/api/decisions/${p.decisionId}/pins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill_run_id: runId }) });
    const j = await r.json();
    p.toast(j.error ? j.error : "Pinned to this decision");
  }
  function exportAs(format: "csv" | "xlsx") {
    setExportMenu(false);
    if (!runId) return;
    const a = document.createElement("a");
    a.href = `/api/runs/${runId}/export?format=${format}${p.conversationId ? `&c=${p.conversationId}` : ""}`;
    a.download = "";
    a.click();
    p.onNote(`You exported ${visible.length} ${what} as ${format === "csv" ? "CSV" : "Excel"}`);
  }

  const filtersLine = describeParams(tool.params_resolved ?? {}, Object.fromEntries(p.brands.map((b) => [b.id, b.name])));
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <p className="text-sm text-gray-600">
          <b className="font-semibold text-gray-900">{tool.status === "ok" ? `${fmtNum(meta.matched ?? rows.length)} matched` : tool.status}</b>
          {rows.length > 0 && <span> · {visible.length} shown{excluded.size ? ` · ${excluded.size} excluded` : ""}</span>}
          {meta.freshness && <span> · data through {fmtDate(meta.freshness)}</span>}
        </p>
        {runId && (tool.skill === "discovery" || hasWindow) && <Button variant={refine ? "secondary" : "outline"} size="sm" aria-expanded={refine} onClick={() => setRefine((r) => !r)} disabled={p.busy}>{refine ? "Close" : "Refine"}</Button>}
      </div>
      {filtersLine && <p className="shrink-0 px-5 pt-1 text-xs text-gray-500" title="How this list was built">{filtersLine}</p>}

      {refine && runId && (
        tool.skill === "discovery"
          ? <RefineDiscovery params={tool.params_resolved ?? {}} brands={p.brands} months={p.months} onApply={applyParams} onCancel={() => setRefine(false)} />
          : <RefineWindow params={tool.params_resolved ?? {}} months={p.months} onApply={applyParams} onCancel={() => setRefine(false)} />
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {showChart && rows.length > 0 && (
          <div><Button variant="outline" size="sm" onClick={() => { if (!chartOn) sendSignal("chat.show_chart", { where: "pane" }); setChartOn((c) => !c); }}>{chartOn ? "Hide chart" : "Show chart"}</Button></div>
        )}
        {chartSpec && (
          <div className="flex flex-col gap-3 rounded-2xl border border-card-border p-4">
            {hasWindow && runId && (
              <div role="group" aria-label="Range" className="flex flex-wrap gap-1.5">
                {[[28, "4 weeks"], [56, "8 weeks"], [91, "13 weeks"], [182, "26 weeks"]].map(([d, l]) => (
                  <Chip key={d} disabled={p.busy} onClick={() => setRange(Number(d), String(l))} aria-label={`Last ${l}`}>{String(l).replace(" weeks", "w")}</Chip>
                ))}
              </div>
            )}
            <Chart spec={chartSpec} />
            {chart && chart.series.length > 1 && (
              <div role="group" aria-label="Series shown" className="flex flex-wrap gap-1.5">
                {chart.series.map((s) => (
                  <Chip key={s.name} on={!hidden.has(s.name)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(s.name)) n.delete(s.name); else n.add(s.name); return n; })}>{s.name}</Chip>
                ))}
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <TextField className="max-w-60" aria-label={`Filter ${what}`} placeholder={`Filter ${what}…`} value={state.filter ?? ""} onChange={(e) => setState({ filter: e.target.value })} />
              {selected.size > 0 && <Button size="sm" disabled={!canAct} onClick={exclude}>Exclude {selected.size} selected</Button>}
              {excluded.size > 0 && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setShowExcluded((s) => !s)}>{showExcluded ? "Hide excluded" : `Show ${excluded.size} excluded`}</Button>
                  <Button variant="ghost" size="sm" disabled={!canAct} onClick={() => runId && p.onAction({ run_id: runId, action: "clear_exclusions", human: "You cleared the exclusions" })}>Put all back</Button>
                </>
              )}
              {state.sort && <Button variant="ghost" size="sm" onClick={() => setState({ sort: null })}>Original order</Button>}
            </div>
            <div className="overflow-x-auto rounded-2xl border border-card-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-0 border-b border-card-border bg-white">
                    {runId && (
                      <th className="w-10 px-3 py-2.5">
                        <input type="checkbox" aria-label="Select every row shown" className="h-4 w-4 cursor-pointer accent-brand-palette-600" checked={visible.length > 0 && visible.every((r) => selected.has(keyOf(r)) || excluded.has(keyOf(r)))} onChange={(e) => setSelected(e.target.checked ? new Set(visible.filter((r) => !excluded.has(keyOf(r))).map(keyOf)) : new Set())} />
                      </th>
                    )}
                    <th className="w-10 px-3 py-2.5 text-left text-sm font-semibold text-gray-900">#</th>
                    {cols.map((c) => {
                      const on = state.sort?.key === c;
                      return (
                        <th key={c} aria-sort={on ? (state.sort!.dir === "desc" ? "descending" : "ascending") : undefined} className={cn("whitespace-nowrap px-3 py-2.5 text-sm font-semibold", numeric(c) ? "text-right" : "text-left")}>
                          <button type="button" onClick={() => sortBy(c)} className={cn("cursor-pointer rounded-md hover:text-brand-palette-700 focus-visible:outline-2 focus-visible:outline-brand-palette-600", on ? "text-brand-palette-700" : "text-gray-900")}>
                            {columnLabel(c)}{on ? (state.sort!.dir === "desc" ? " ↓" : " ↑") : ""}
                          </button>
                        </th>
                      );
                    })}
                    <th className="px-3 py-2.5"><span className="sr-only">Evidence</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => {
                    const k = keyOf(r);
                    const ex = excluded.has(k);
                    const ids = ((r.evidence_ids as string[]) ?? []);
                    const opened = openRow === k;
                    return (
                      <tr key={k} onClick={() => setOpenRow(opened ? null : k)} aria-expanded={opened}
                        className={cn("cursor-pointer border-b border-gray-100 last:border-b-0", opened ? "bg-brand-palette-50" : "even:bg-gray-50/60 hover:bg-brand-palette-50/60", ex && "text-gray-400 line-through decoration-gray-300")}>
                        {runId && (
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            {ex ? <button type="button" className={cn(LINKISH, "no-underline")} disabled={!canAct} onClick={() => putBack([k])}>put back</button>
                              : <input type="checkbox" aria-label={`Select ${rowLabel(r)}`} className="h-4 w-4 cursor-pointer accent-brand-palette-600" checked={selected.has(k)} onChange={() => toggle(k)} />}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-xs tabular-nums text-gray-500">{i + 1}</td>
                        {cols.map((c) => <td key={c} className={cn("px-3 py-2.5", ex ? "" : "text-gray-700", numeric(c) && "text-right tabular-nums")}>{cellOf(c, r[c])}</td>)}
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">{ids.slice(0, 2).map((id) => <span key={id} className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-brand-palette-100 px-1.5 text-[11px] font-bold text-brand-palette-800 no-underline">{id.replace("ev_", "")}</span>)}</td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && <tr><td colSpan={cols.length + 3} className="px-4 py-6 text-center text-sm text-gray-500">Nothing matches the filter.</td></tr>}
                </tbody>
              </table>
            </div>
            {openRow && (() => {
              const row = visible.find((r) => keyOf(r) === openRow);
              const ids = ((row?.evidence_ids as string[]) ?? []);
              const items = ids.map((id) => obj.evidence[id]).filter(Boolean);
              return items.length
                ? <EvidenceList items={items} title={`Evidence · ${row ? rowLabel(row) : ""}`} />
                : <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500">No posts kept for this row.</p>;
            })()}
          </>
        )}
        {!!meta.caveats?.length && (
          <details className="rounded-2xl border border-card-border px-4 py-3 text-xs">
            <summary className="cursor-pointer font-semibold text-gray-700 hover:text-brand-palette-700">About this data</summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-gray-600">{meta.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </details>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-gray-200 bg-gray-50/60 px-5 py-3">
        {p.decisionId && <Button variant="outline" size="sm" disabled={!runId} onClick={pin}>Pin to decision</Button>}
        <Button variant="outline" size="sm" disabled={!runId} onClick={watch}>Get this every Monday</Button>
        {runId && (p.kind === "profile" ? <AddToPulse up payload={{ kind: "skill", skill_run_id: runId }} onDone={p.toast} /> : <AddToDeck up payload={{ skill_run_id: runId }} onDone={p.toast} />)}
        <span className="relative ml-auto inline-flex">
          <Button variant="outline" size="sm" disabled={!runId || !rows.length} aria-haspopup="menu" aria-expanded={exportMenu} onClick={() => setExportMenu((m) => !m)}>Export ▾</Button>
          {exportMenu && (
            <span role="menu" onMouseLeave={() => setExportMenu(false)} onKeyDown={(e) => { if (e.key === "Escape") setExportMenu(false); }}
              className="absolute bottom-full right-0 z-40 mb-2 flex w-72 flex-col rounded-2xl border border-gray-100 bg-white p-1.5 shadow-xl">
              <button type="button" role="menuitem" autoFocus onClick={() => exportAs("xlsx")} className="min-h-10 cursor-pointer rounded-xl px-3 py-2 text-left text-sm text-gray-800 outline-none hover:bg-gray-100 focus-visible:bg-gray-100">Excel (.xlsx) with “About this list”</button>
              <button type="button" role="menuitem" onClick={() => exportAs("csv")} className="min-h-10 cursor-pointer rounded-xl px-3 py-2 text-left text-sm text-gray-800 outline-none hover:bg-gray-100 focus-visible:bg-gray-100">CSV</button>
            </span>
          )}
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ refine drawers */

function RefineDiscovery({ params, brands, months, onApply, onCancel }: { params: Record<string, unknown>; brands: { id: string; name: string; hint?: string }[]; months: string[]; onApply: (params: Record<string, unknown>, human: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState<DiscoveryForm>(() => formFromParams(params, months));
  const invalid = followersInvalid(form);
  const names = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  return (
    <div className={REFINE}>
      <DiscoveryFilters form={form} onChange={setForm} brands={brands} months={months} compact />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={invalid} onClick={() => { const next = formToParams(form); onApply(next, `You changed the filters: ${describeParams(next, names)}`); }}>Apply and re-run</Button>
      </div>
    </div>
  );
}

function RefineWindow({ params, months, onApply, onCancel }: { params: Record<string, unknown>; months: string[]; onApply: (params: Record<string, unknown>, human: string) => void; onCancel: () => void }) {
  const w = params.window as { from?: string; to?: string } | undefined;
  const [mode, setMode] = useState<"days" | "months">("days");
  const [days, setDays] = useState(30);
  const [picked, setPicked] = useState<string[]>(w?.from && w?.to ? months.filter((m) => m >= w.from!.slice(0, 7) && m <= w.to!.slice(0, 7)) : months.slice(-1));
  const [platform, setPlatform] = useState(typeof params.platform === "string" ? params.platform : "all");
  const hasPlatform = "platform" in params;
  function apply() {
    const next: Record<string, unknown> = {};
    if (mode === "days") next.window = { last_n_days: days };
    else { const s = [...picked].sort(); if (!s.length) return; const [y, m] = s[s.length - 1].split("-").map(Number); next.window = { from: `${s[0]}-01`, to: `${s[s.length - 1]}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` }; }
    if (hasPlatform) next.platform = platform;
    const human = mode === "days" ? `You changed the window to the last ${days} days${hasPlatform && platform !== "all" ? ` on ${platform}` : ""}` : `You changed the window to ${picked.sort().map(monthLabel).join(", ")}${hasPlatform && platform !== "all" ? ` on ${platform}` : ""}`;
    onApply(next, human);
  }
  return (
    <div className={REFINE}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Window" group>
          <SelectInput withSearch size="sm" ariaLabel="Window" value={mode} onChange={(v) => setMode(v as "days" | "months")}
            options={[{ value: "days", label: "Last N days of data" }, { value: "months", label: "Specific months" }]} />
        </Field>
        {hasPlatform && (
          <Field label="Platform" group>
            <SelectInput withSearch size="sm" ariaLabel="Platform" value={platform} onChange={setPlatform}
              options={[{ value: "all", label: "All" }, { value: "tiktok", label: "TikTok" }, { value: "instagram", label: "Instagram" }]} />
          </Field>
        )}
        {mode === "days" ? (
          <Field wide group label="Days">
            <div className="flex flex-wrap gap-1.5">{[7, 14, 30, 60, 90, 180].map((d) => <Chip key={d} on={days === d} onClick={() => setDays(d)}>{d}</Chip>)}</div>
          </Field>
        ) : (
          <Field wide group label="Months">
            <div className="flex flex-wrap gap-1.5">{months.map((m) => <Chip key={m} on={picked.includes(m)} onClick={() => setPicked((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))}>{monthLabel(m)}</Chip>)}</div>
          </Field>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={apply}>Apply and re-run</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ agent draft */

const SCHEDULES: { cron: string; human: string }[] = [
  { cron: "0 7 * * 1", human: "Every Monday at 07:00" },
  { cron: "0 7 * * *", human: "Every day at 07:00" },
  { cron: "0 17 * * 5", human: "Every Friday at 17:00" },
  { cron: "0 7 1 * *", human: "On the 1st of each month at 07:00" },
];

function DraftObject({ obj, decisionId, onDone, toast }: { obj: PaneObject; decisionId: string | null; onDone: () => void; toast: (m: string) => void }) {
  const draft = (obj.tool.draft ?? {}) as Record<string, unknown>;
  const sched = (draft.schedule ?? {}) as { cron?: string; tz?: string; human?: string };
  const delivery = (draft.delivery ?? {}) as { channels?: string[]; email?: string };
  const [name, setName] = useState(String(draft.name ?? ""));
  const [cron, setCron] = useState(sched.cron ?? "0 7 * * 1");
  const [onlyChanged, setOnlyChanged] = useState(draft.only_if_changed !== false);
  const [email, setEmail] = useState(delivery.email ?? "");
  const [state, setState] = useState<{ busy: boolean; msg: string; done: boolean }>({ busy: false, msg: "", done: false });
  const known = SCHEDULES.find((s) => s.cron === cron);
  const params = (draft.params ?? {}) as Record<string, unknown>;
  async function start() {
    setState({ busy: true, msg: "", done: false });
    const body = { ...draft, name, schedule: { cron, tz: sched.tz ?? "Asia/Jakarta", human: known?.human ?? sched.human ?? cron }, delivery: { channels: email ? ["email", "in_app"] : ["in_app"], email: email || undefined }, only_if_changed: onlyChanged, decision_id: decisionId };
    const r = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setState({ busy: false, msg: j.error ? j.error : `Scheduled: ${j.agent.name}`, done: !j.error });
    if (!j.error) toast(`Scheduled "${j.agent.name}"`);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
      <p className="text-sm text-gray-600">Here is how I read that. Change anything, then schedule it; you can edit it later under Reports.</p>
      <Field label="Name"><TextField value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="When" group>
        <SelectInput withSearch size="sm" ariaLabel="When" value={cron} onChange={setCron}
          options={[...SCHEDULES.map((s) => ({ value: s.cron, label: s.human })), ...(!known ? [{ value: cron, label: sched.human ?? cron }] : [])]} />
      </Field>
      <Field label="Email the findings to" hint="optional"><TextField type="email" value={email} placeholder="email@example.com" onChange={(e) => setEmail(e.target.value)} /></Field>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-800">
        <input type="checkbox" className="h-4 w-4 cursor-pointer accent-brand-palette-600" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
        Only tell me when something changes
      </label>
      <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
        <b className="block text-xs font-semibold text-gray-700">What it watches</b>
        <span className="text-gray-600">{describeParams(params) || "the analysis as run"}</span>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
        {state.msg && <span role={state.done ? "status" : "alert"} className={cn("mr-auto text-xs", state.done ? "text-green-700" : "text-red-700")}>{state.msg}</span>}
        {state.done ? <Button variant="outline" size="sm" onClick={onDone}>Done</Button> : (
          <>
            <Button variant="ghost" size="sm" onClick={onDone}>Discard</Button>
            <Button size="sm" disabled={!name.trim()} isLoading={state.busy} loadingLabel="Starting…" onClick={start}>Schedule it</Button>
          </>
        )}
      </div>
    </div>
  );
}

/** A spreadsheet handed out in the thread. */
export function FileChip({ tool, conversationId }: { tool: ToolCallRecord; conversationId: string | null }) {
  const f = tool.file;
  if (!f) return null;
  return (
    <a href={`${f.url}${conversationId ? `&c=${conversationId}` : ""}`} download
      className="inline-flex max-w-md items-center gap-3 self-start rounded-2xl border border-card-border bg-white px-4 py-3 no-underline transition-all hover:border-brand-palette-300 hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600">
      <b className="shrink-0 rounded-md bg-green-700 px-1.5 py-1 text-[10px] font-bold tracking-wide text-white">{f.format === "csv" ? "CSV" : "XLSX"}</b>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-gray-900">{tool.title ?? "List"}</span>
        <small className="text-xs text-gray-500">{fmtNum(f.rows)} rows · {f.format === "csv" ? "CSV" : "Excel"} · click to download</small>
      </span>
    </a>
  );
}

/** Keeps a dragged ratio in localStorage; returns [ratio, setRatio]. */
export function usePaneRatio(): [number, (r: number) => void] {
  const [ratio, set] = useState(0.42);
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try { const v = Number(localStorage.getItem("cemo.pane_ratio")); if (v >= 0.3 && v <= 0.7) set(v); } catch { /* private mode */ }
  }, []);
  return [ratio, (r: number) => { const c = Math.min(0.7, Math.max(0.3, r)); set(c); try { localStorage.setItem("cemo.pane_ratio", String(c)); } catch { /* ignore */ } }];
}

export function noop(_: ReactNode) { return null; }
