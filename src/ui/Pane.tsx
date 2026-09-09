"use client";
/**
 * The evidence pane (PRD-v2 §2): the object on the right of the thread. One tab per
 * object; a table you can sort, filter, select and exclude from; a chart with a
 * range and series toggles; an agent draft you can edit and start. The footer holds
 * the only three actions: Pin to decision, Watch this, Export. Anything that changes
 * the meaning of the object goes to the model as a pane action; sort and filter stay here.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ToolCallRecord } from "@/chat/persist";
import type { ChartSpec, Evidence } from "@/skills/types";
import { applyPaneState, columnLabel, describeParams, rowKey, rowLabel, type PaneAction, type PaneKind, type PaneState } from "../chat/pane";
import { Chart } from "./Chart";
import { DiscoveryFilters, followersInvalid, formFromParams, formToParams, monthLabel, type DiscoveryForm } from "./DiscoveryFilters";
import { EvidenceList } from "./Evidence";
import { fmtDate, fmtNum } from "./format";
import { columnsOf, cellOf } from "./ResultCard";

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
};

const WHAT: Record<string, string> = { creator_id: "creators", brand_id: "brands", post_id: "posts", hashtag: "hashtags", theme: "themes", product_id: "products", campaign_id: "campaigns" };

export function Pane(p: Props) {
  const active = p.objects.find((o) => o.id === p.activeId) ?? p.objects[p.objects.length - 1];
  if (!active) return null;
  return (
    <aside className={`pane ${p.expanded ? "big" : ""}`} aria-label="Evidence">
      <div className="ptabs">
        <div className="tabs">
          {p.objects.map((o) => (
            <button key={o.id} className={o.id === active.id ? "on" : ""} onClick={() => p.onSelect(o.id)} title={o.title}>
              <span className={`k ${o.kind}`} /><span className="text">{o.title}</span>
              {p.objects.length > 1 && <i onClick={(e) => { e.stopPropagation(); p.onCloseTab(o.id); }} title="Close tab">×</i>}
            </button>
          ))}
        </div>
        <div className="pctl">
          <button className="ic" onClick={p.onExpand} title={p.expanded ? "Back to split view" : "Give the pane the room"}>{p.expanded ? "⇤" : "⇥"}</button>
          <button className="ic" onClick={p.onClose} title="Close the pane">×</button>
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
  const excluded = new Set(state.excluded ?? []);
  const visible = useMemo(() => applyPaneState(rows, showExcluded ? { ...state, excluded: [] } : state, diffKey), [rows, state, showExcluded, diffKey]);
  const keyOf = (r: Record<string, unknown>) => rowKey(r, diffKey, rows.indexOf(r));
  const what = WHAT[diffKey ?? ""] ?? "rows";
  const meta = (tool.meta ?? {}) as { matched?: number; caveats?: string[]; data_window?: { from: string; to: string }; freshness?: string };
  const chart = tool.chart as ChartSpec | undefined;
  const showChart = !!chart && Array.isArray(chart.x) && chart.x.length >= 3;
  const chartSpec = showChart && chart ? { ...chart, series: chart.series.filter((s) => !hidden.has(s.name)) } : null;
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
    p.toast(j.error ? j.error : "Watching this every Monday. Edit it on the Watching page.");
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
      <div className="phead">
        <div className="l">
          <b>{tool.status === "ok" ? `${fmtNum(meta.matched ?? rows.length)} matched` : tool.status}</b>
          {rows.length > 0 && <span> · {visible.length} shown{excluded.size ? ` · ${excluded.size} excluded` : ""}</span>}
          {meta.freshness && <span> · data through {fmtDate(meta.freshness)}</span>}
        </div>
        {runId && (tool.skill === "discovery" || hasWindow) && <button className={`btn sm ${refine ? "pri" : ""}`} onClick={() => setRefine((r) => !r)} disabled={p.busy}>{refine ? "Close" : "Refine"}</button>}
      </div>
      {filtersLine && <div className="pfilters" title="How this list was built">{filtersLine}</div>}

      {refine && runId && (
        tool.skill === "discovery"
          ? <RefineDiscovery params={tool.params_resolved ?? {}} brands={p.brands} months={p.months} onApply={applyParams} onCancel={() => setRefine(false)} />
          : <RefineWindow params={tool.params_resolved ?? {}} months={p.months} onApply={applyParams} onCancel={() => setRefine(false)} />
      )}

      <div className="pbody">
        {chartSpec && (
          <div className="pchart">
            {hasWindow && runId && (
              <div className="range">
                {[[28, "4 weeks"], [56, "8 weeks"], [91, "13 weeks"], [182, "26 weeks"]].map(([d, l]) => (
                  <button key={d} className="btn sm ghost" disabled={p.busy} onClick={() => setRange(Number(d), String(l))}>{String(l).replace(" weeks", "w")}</button>
                ))}
              </div>
            )}
            <Chart spec={chartSpec} />
            {chart && chart.series.length > 1 && (
              <div className="series">
                {chart.series.map((s) => (
                  <button key={s.name} className={hidden.has(s.name) ? "off" : ""} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(s.name)) n.delete(s.name); else n.add(s.name); return n; })}>{s.name}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="ptools">
              <input className="pfilter" placeholder={`Filter ${what}…`} value={state.filter ?? ""} onChange={(e) => setState({ filter: e.target.value })} />
              {selected.size > 0 && <button className="btn sm pri" disabled={!canAct} onClick={exclude}>Exclude {selected.size} selected</button>}
              {excluded.size > 0 && (
                <>
                  <button className="btn sm ghost" onClick={() => setShowExcluded((s) => !s)}>{showExcluded ? "Hide excluded" : `Show ${excluded.size} excluded`}</button>
                  <button className="btn sm ghost" disabled={!canAct} onClick={() => runId && p.onAction({ run_id: runId, action: "clear_exclusions", human: "You cleared the exclusions" })}>Put all back</button>
                </>
              )}
              {state.sort && <button className="btn sm ghost" onClick={() => setState({ sort: null })}>Original order</button>}
            </div>
            <div className="tablewrap ptable">
              <table>
                <thead>
                  <tr>
                    {runId && <th className="sel"><input type="checkbox" checked={visible.length > 0 && visible.every((r) => selected.has(keyOf(r)) || excluded.has(keyOf(r)))} onChange={(e) => setSelected(e.target.checked ? new Set(visible.filter((r) => !excluded.has(keyOf(r))).map(keyOf)) : new Set())} /></th>}
                    <th className="rank">#</th>
                    {cols.map((c) => (
                      <th key={c} className={`${numeric(c) ? "num" : ""} sortable ${state.sort?.key === c ? "on" : ""}`} onClick={() => sortBy(c)}>{columnLabel(c)}{state.sort?.key === c ? (state.sort.dir === "desc" ? " ↓" : " ↑") : ""}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => {
                    const k = keyOf(r);
                    const ex = excluded.has(k);
                    const ids = ((r.evidence_ids as string[]) ?? []);
                    return (
                      <tr key={k} className={`${ex ? "ex" : ""} ${openRow === k ? "open" : ""}`} onClick={() => setOpenRow(openRow === k ? null : k)}>
                        {runId && <td className="sel" onClick={(e) => e.stopPropagation()}>{ex ? <button className="linkish" disabled={!canAct} onClick={() => putBack([k])}>put back</button> : <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} />}</td>}
                        <td className="rank">{i + 1}</td>
                        {cols.map((c) => <td key={c} className={numeric(c) ? "num" : ""}>{cellOf(c, r[c])}</td>)}
                        <td className="evs">{ids.slice(0, 2).map((id) => <span key={id} className="ev" style={{ pointerEvents: "none" }}>{id.replace("ev_", "")}</span>)}</td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && <tr><td colSpan={cols.length + 3} className="none">Nothing matches the filter.</td></tr>}
                </tbody>
              </table>
            </div>
            {openRow && (() => {
              const row = visible.find((r) => keyOf(r) === openRow);
              const ids = ((row?.evidence_ids as string[]) ?? []);
              const items = ids.map((id) => obj.evidence[id]).filter(Boolean);
              return <div className="pev"><EvidenceList items={items} title={`Evidence · ${row ? rowLabel(row) : ""}`} />{!items.length && <div className="none">No posts kept for this row.</div>}</div>;
            })()}
          </>
        )}
        {!!meta.caveats?.length && <details className="pabout"><summary>About this data</summary><ul>{meta.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul></details>}
      </div>

      <div className="pfoot">
        {p.decisionId ? <button className="btn sm" disabled={!runId} onClick={pin}>Pin to decision</button> : <span className="hint">Open this inside a decision to pin it</span>}
        <button className="btn sm" disabled={!runId} onClick={watch}>Watch this</button>
        <span className="exp">
          <button className="btn sm" disabled={!runId || !rows.length} onClick={() => setExportMenu((m) => !m)}>Export ▾</button>
          {exportMenu && (
            <span className="menu" onMouseLeave={() => setExportMenu(false)}>
              <button onClick={() => exportAs("xlsx")}>Excel (.xlsx) with “About this list”</button>
              <button onClick={() => exportAs("csv")}>CSV</button>
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
    <div className="prefine">
      <DiscoveryFilters form={form} onChange={setForm} brands={brands} months={months} compact />
      <div className="acts">
        <button className="btn sm ghost" onClick={onCancel}>Cancel</button>
        <button className="btn sm pri" disabled={invalid} onClick={() => { const next = formToParams(form); onApply(next, `You changed the filters: ${describeParams(next, names)}`); }}>Apply and re-run</button>
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
    <div className="prefine">
      <div className="form compact">
        <label>Window
          <select value={mode} onChange={(e) => setMode(e.target.value as "days" | "months")}><option value="days">Last N days of data</option><option value="months">Specific months</option></select>
        </label>
        {mode === "days" ? (
          <label>Days<div className="tog">{[7, 14, 30, 60, 90, 180].map((d) => <button type="button" key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}</button>)}</div></label>
        ) : (
          <label className="wide">Months<div className="tog">{months.map((m) => <button type="button" key={m} className={picked.includes(m) ? "on" : ""} onClick={() => setPicked((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))}>{monthLabel(m)}</button>)}</div></label>
        )}
        {hasPlatform && <label>Platform<select value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="all">All</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option></select></label>}
      </div>
      <div className="acts">
        <button className="btn sm ghost" onClick={onCancel}>Cancel</button>
        <button className="btn sm pri" onClick={apply}>Apply and re-run</button>
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
    setState({ busy: false, msg: j.error ? j.error : `Watching: ${j.agent.name}`, done: !j.error });
    if (!j.error) toast(`Watching "${j.agent.name}"`);
  }
  return (
    <div className="pbody pdraft">
      <p className="lead">Here is how I read that. Change anything, then start watching; you can edit it later on the Watching page.</p>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>When<select value={cron} onChange={(e) => setCron(e.target.value)}>{SCHEDULES.map((s) => <option key={s.cron} value={s.cron}>{s.human}</option>)}{!known && <option value={cron}>{sched.human ?? cron}</option>}</select></label>
      <label>Email the findings to<input value={email} placeholder="optional" onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="row"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Only tell me when something changes</label>
      <div className="what"><b>What it watches</b><span>{describeParams(params) || "the analysis as run"}</span></div>
      <div className="acts">
        {state.msg && <span className={state.done ? "ok" : "err"}>{state.msg}</span>}
        {state.done ? <button className="btn sm" onClick={onDone}>Done</button> : (
          <>
            <button className="btn sm ghost" onClick={onDone}>Discard</button>
            <button className="btn sm pri" disabled={state.busy || !name.trim()} onClick={start}>{state.busy ? "Starting…" : "Start watching"}</button>
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
    <a className="filechip" href={`${f.url}${conversationId ? `&c=${conversationId}` : ""}`} download>
      <b>{f.format === "csv" ? "CSV" : "XLSX"}</b>
      <span>{tool.title ?? "List"}<small>{fmtNum(f.rows)} rows · {f.format === "csv" ? "CSV" : "Excel"} · click to download</small></span>
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
