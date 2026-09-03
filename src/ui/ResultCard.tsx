"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { ToolCallRecord } from "@/chat/persist";
import type { ChartSpec, Evidence } from "@/skills/types";
import { Chart } from "./Chart";
import { EvidenceList } from "./Evidence";
import { fmtDate, fmtNum } from "./format";

const HIDE = new Set(["evidence_ids", "evidence_id", "post_id", "creator_id", "creator_key", "top_creator_ids", "run_id"]);
const MAX_COLS = 9;
const MAX_ROWS = 12;

function columns(rows: Record<string, unknown>[]): string[] {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]).filter((k) => !HIDE.has(k));
  const prefer = ["brand_id", "brand_a", "brand_b", "hashtag", "theme", "label", "group", "product", "creator_handle", "url", "platform", "tier", "followers", "posts", "creators", "views", "engagements", "er_pct", "comment_rate_pct", "share_of_voice_pct", "cart_pct", "cart_share_pct", "in_wave", "multiple", "creators_now", "week", "stage", "share_of_posts_pct", "share_of_brand_posts_pct", "category_share_pct", "index_vs_category", "change_posts_pct", "brand_share_pct", "shared_tags", "cart_share_pct", "top_brand", "active", "peak_week", "brand_count", "consecutive_months", "months_active", "affiliate_accounts", "shared_creators", "jaccard", "views_per_1k", "posted_at", "last_post", "for_you"];
  const ordered = [...prefer.filter((k) => keys.includes(k)), ...keys.filter((k) => !prefer.includes(k))];
  return ordered.filter((k) => !["caption", "hashtags", "brands", "used_by", "shared_list", "months_active_list", "top_posts", "positive_pct", "negative_pct", "top_topics", "top_questions", "topics", "tier_mix", "shared_list", "only_focus", "only_other", "product_id", "product_url", "evidence_ids"].includes(k)).slice(0, MAX_COLS);
}

function cell(k: string, v: unknown): ReactNode {
  if (v == null) return "–";
  if (k === "url" && typeof v === "string") return <a href={v} target="_blank" rel="noreferrer" className="linkbtn">open</a>;
  if (k === "creator_handle") return <b>@{String(v)}</b>;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (/(_at|posted|last_post|first_post|week_from|week_to|first_seen|last_seen)$/.test(k) && typeof v === "string" && /\d{4}-\d{2}-\d{2}/.test(v)) return fmtDate(v);
  if (typeof v === "number") return fmtNum(v);
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" && x ? JSON.stringify(x) : String(x))).join(", ") : "–";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function ResultCard({ tool, evidence, onOpenEvidence }: { tool: ToolCallRecord; evidence: Record<string, Evidence>; onOpenEvidence?: (ids: string[]) => void }) {
  const [showAll, setShowAll] = useState(false);
  const rows = tool.rows ?? [];
  const cols = columns(rows);
  const title = tool.skill ? `/${tool.skill}` : tool.name === "query_metrics" ? "query" : tool.name;
  const meta = (tool.meta ?? {}) as { matched?: number; returned?: number; caveats?: string[]; data_window?: { from: string; to: string } };
  const isDiscovery = tool.skill === "discovery" && tool.run_id;
  const visible = showAll ? rows : rows.slice(0, MAX_ROWS);
  const numeric = (k: string) => rows.some((r) => typeof r[k] === "number");

  if (tool.name === "create_agent_draft") return <DraftCard draft={tool.draft as Record<string, unknown>} />;
  return (
    <div className="card">
      <h4>
        <span><span className="slash">{title.startsWith("/") ? "/" : ""}</span>{title.replace(/^\//, "")}{meta.data_window ? ` · ${meta.data_window.from} to ${meta.data_window.to}` : ""}</span>
        <span>{tool.status === "ok" ? `matched ${fmtNum(meta.matched ?? rows.length)} · showing ${rows.length}` : tool.status}</span>
      </h4>
      {tool.status === "unavailable" && <div className="unavail">{tool.message}</div>}
      {tool.status === "error" && <div className="unavail" style={{ background: "var(--red-10)", color: "var(--red)" }}>{tool.message}</div>}
      {isDiscovery && (
        <div className="body"><Link className="btn sm pri" href={`/skills/discovery?run=${tool.run_id}`}>Open the /discovery screen</Link> <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 8 }}>parsed filters, full table, CSV export</span></div>
      )}
      {tool.chart ? <div className="chart"><Chart spec={tool.chart as ChartSpec} /></div> : null}
      {rows.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead><tr>{cols.map((c) => <th key={c} className={numeric(c) ? "num" : ""}>{c.replace(/_/g, " ")}</th>)}{onOpenEvidence && <th />}</tr></thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={i} onClick={() => onOpenEvidence?.((r.evidence_ids as string[]) ?? [])}>
                  {cols.map((c) => <td key={c} className={numeric(c) ? "num" : ""}>{cell(c, r[c])}</td>)}
                  {onOpenEvidence && <td>{((r.evidence_ids as string[]) ?? []).slice(0, 3).map((id) => <span key={id} className="ev" style={{ pointerEvents: "none" }}>{id.replace("ev_", "")}</span>)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > MAX_ROWS && <div className="more"><button className="btn sm" onClick={() => setShowAll(!showAll)}>{showAll ? `Show first ${MAX_ROWS}` : `Show all ${rows.length}`}</button><span>Click a row to open its evidence</span></div>}
        </div>
      )}
      {!!meta.caveats?.length && <ul className="caveats">{meta.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>}
      {rows.length === 0 && tool.status === "ok" && <div className="body" style={{ fontSize: 13, color: "var(--text-3)" }}>No rows matched.</div>}
    </div>
  );
}

export function DraftCard({ draft }: { draft: Record<string, unknown> }) {
  const [state, setState] = useState<{ busy: boolean; msg: string; done: boolean }>({ busy: false, msg: "", done: false });
  if (!draft) return null;
  const schedule = (draft.schedule ?? {}) as { human?: string; cron?: string; tz?: string };
  const delivery = (draft.delivery ?? {}) as { channels?: string[]; email?: string };
  async function create() {
    setState({ busy: true, msg: "", done: false });
    const r = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const j = await r.json();
    setState({ busy: false, msg: j.error ? j.error : `Created "${j.agent.name}"`, done: !j.error });
  }
  return (
    <div className="draft">
      <h4>Agent draft — here's how we read that. Create it as is, or edit it on the Agents page after creating.</h4>
      <div className="field"><span>Name</span><b>{String(draft.name ?? "")}</b></div>
      <div className="field"><span>Skill</span><b><span className="slash">/</span>{String(draft.skill ?? "")}</b></div>
      <div className="field"><span>Schedule</span><b>{schedule.human ?? schedule.cron} · {schedule.tz}</b></div>
      <div className="field"><span>Params</span><b style={{ fontFamily: "monospace", fontSize: 12 }}>{JSON.stringify(draft.params ?? {})}</b></div>
      <div className="field"><span>Deliver to</span><b>{(delivery.channels ?? []).join(", ") || "in_app"}</b></div>
      <div className="field"><span>Only if changed</span><b>{draft.only_if_changed ? "yes" : "no"}</b></div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, alignItems: "center" }}>
        {state.msg && <span style={{ fontSize: 12, color: state.done ? "var(--green)" : "var(--red)" }}>{state.msg}</span>}
        {state.done ? <Link className="btn sm" href="/agents">Open Agents</Link> : <button className="btn pri sm" disabled={state.busy} onClick={create}>{state.busy ? "Creating…" : "Create agent"}</button>}
      </div>
    </div>
  );
}

export function EvidencePanel({ ids, evidence, title }: { ids: string[]; evidence: Record<string, Evidence>; title?: string }) {
  const items = ids.map((id) => evidence[id]).filter(Boolean);
  return <EvidenceList items={items} title={title} />;
}
