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
      <div className="card strip" onClick={onOpenPane} role="button">
        <h4><span><i className={`k ${pane.kind}`} />{pane.title}</span><span>{pane.kind === "agent_draft" ? "" : n}<b className="tog">{pane.kind === "table" ? "Open the list" : pane.kind === "chart" ? "Open the chart" : "Open"}</b></span></h4>
      </div>
    );
  }
  if (tool.name === "create_agent_draft") return <DraftCard draft={tool.draft as Record<string, unknown>} decisionId={decisionId} />;
  const chart = tool.chart as ChartSpec | undefined;
  // a chart with fewer than three points says nothing a sentence cannot
  const showChart = !!chart && Array.isArray(chart.x) && chart.x.length >= 3;
  const hasBody = rows.length > 0 || showChart;
  const count = tool.status === "ok" ? `${fmtNum(meta.matched ?? rows.length)} matched` : tool.status;
  return (
    <div className={`card ${open ? "open" : "closed"}`}>
      <h4 onClick={() => hasBody && setOpen((o) => !o)} style={{ cursor: hasBody ? "pointer" : "default" }}>
        <span>{title}{meta.data_window ? ` · ${meta.data_window.from} to ${meta.data_window.to}` : ""}</span>
        <span>{count}{hasBody ? <b className="tog">{open ? "Hide" : rows.length ? "Show the list" : "Show the chart"}</b> : null}</span>
      </h4>
      {tool.status === "unavailable" && <div className="unavail">{tool.message}</div>}
      {tool.status === "error" && <div className="unavail" style={{ background: "var(--red-10)", color: "var(--red)" }}>{tool.message}</div>}
      {open && (
        <>
          {isDiscovery && (
            <div className="body"><Link className="btn sm pri" href={`/skills/discovery?run=${tool.run_id}`}>Open the full list</Link> <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 8 }}>every row, filters, CSV export</span></div>
          )}
          {showChart && rows.length > 0 ? <div className="body"><button className="btn sm ghost" onClick={() => { if (!chartOn) sendSignal("chat.show_chart", { where: "card" }); setChartOn((c) => !c); }}>{chartOn ? "Hide chart" : "Show chart"}</button></div> : null}
          {showChart && (chartOn || rows.length === 0) ? <div className="chart"><Chart spec={chart} /></div> : null}
          {rows.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead><tr>{cols.map((c) => <th key={c} className={numeric(c) ? "num" : ""}>{c.replace(/_/g, " ")}</th>)}{onOpenEvidence && <th />}</tr></thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={i} onClick={() => onOpenEvidence?.((r.evidence_ids as string[]) ?? [])}>
                      {cols.map((c) => <td key={c} className={numeric(c) ? "num" : ""}>{cellOf(c, r[c])}</td>)}
                      {onOpenEvidence && <td>{((r.evidence_ids as string[]) ?? []).slice(0, 3).map((id) => <span key={id} className="ev" style={{ pointerEvents: "none" }}>{id.replace("ev_", "")}</span>)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > MAX_ROWS && <div className="more"><button className="btn sm" onClick={() => setShowAll(!showAll)}>{showAll ? `Show first ${MAX_ROWS}` : `Show all ${rows.length}`}</button><span>Click a row to open its evidence</span></div>}
            </div>
          )}
          {!!meta.caveats?.length && (
            <div className="about">
              <button className="linkish" onClick={() => setAbout((a) => !a)}>{about ? "Hide data notes" : "About this data"}</button>
              {about && <ul className="caveats">{meta.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            </div>
          )}
          {rows.length === 0 && !showChart && tool.status === "ok" && <div className="body" style={{ fontSize: 13, color: "var(--text-3)" }}>No rows matched.</div>}
        </>
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
  return (
    <div className="draft">
      <h4>Here's how I read that. Schedule it as is, or edit it under Reports afterwards.</h4>
      <div className="field"><span>Name</span><b>{String(draft.name ?? "")}</b></div>
      <div className="field"><span>Skill</span><b><span className="slash">/</span>{String(draft.skill ?? "")}</b></div>
      <div className="field"><span>Schedule</span><b>{schedule.human ?? schedule.cron} · {schedule.tz}</b></div>
      <div className="field"><span>Params</span><b style={{ fontFamily: "monospace", fontSize: 12 }}>{JSON.stringify(draft.params ?? {})}</b></div>
      <div className="field"><span>Deliver to</span><b>{(delivery.channels ?? []).join(", ") || "in_app"}</b></div>
      <div className="field"><span>Only if changed</span><b>{draft.only_if_changed ? "yes" : "no"}</b></div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, alignItems: "center" }}>
        {state.msg && <span style={{ fontSize: 12, color: state.done ? "var(--green)" : "var(--red)" }}>{state.msg}</span>}
        {state.done ? <Link className="btn sm" href="/reports">See it in Reports</Link> : <button className="btn pri sm" disabled={state.busy} onClick={create}>{state.busy ? "Starting…" : "Schedule it"}</button>}
      </div>
    </div>
  );
}

export function EvidencePanel({ ids, evidence, title }: { ids: string[]; evidence: Record<string, Evidence>; title?: string }) {
  const items = ids.map((id) => evidence[id]).filter(Boolean);
  return <EvidenceList items={items} title={title} />;
}
