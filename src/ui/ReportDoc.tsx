"use client";
/** Report document view (PRD §7, prototype "week-35" structure): header + changes pill, lead, What changed, table, Worth acting on, caveats. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReportRow } from "@/reports/store";
import type { ChartSpec, Evidence } from "@/skills/types";
import { RichText } from "./Ask";
import { Chart } from "./Chart";
import { EvidenceList } from "./Evidence";
import { fmtDate, fmtNum } from "./format";

const HIDE = new Set(["evidence_ids", "evidence_id", "post_id", "creator_id", "creator_key", "top_creator_ids", "brands", "used_by", "shared_list", "months_active_list", "top_posts", "caption", "hashtags", "positive_pct", "negative_pct", "top_topics", "top_questions", "topics"]);
const BAR_COLS = ["share_of_voice_pct", "share_of_posts_pct", "sov_posts_pct", "cart_pct", "cart_share_pct"];

export function ReportDoc({ report }: { report: ReportRow }) {
  const router = useRouter();
  const [openEv, setOpenEv] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const b = report.blocks;
  const evidence: Record<string, Evidence> = Object.fromEntries((b.evidence ?? []).map((e) => [e.id, e]));
  const rows = b.rows ?? [];
  const PREFER = ["brand_id", "source", "creator_handle", "week", "tier", "stage", "posts", "creators", "views", "share_of_voice_pct", "share_of_posts_pct", "cart_share_pct", "cart_pct", "er_pct", "comment_rate_pct", "in_wave", "multiple", "creators_now", "affiliate_accounts", "shared_creators", "consecutive_months", "views_per_1k", "url", "posted_at"];
  const keys = rows.length ? Object.keys(rows[0]).filter((k) => !HIDE.has(k) && typeof rows[0][k] !== "object") : [];
  const cols = [...PREFER.filter((k) => keys.includes(k)), ...keys.filter((k) => !PREFER.includes(k))].slice(0, 8);
  const barCol = cols.find((c) => BAR_COLS.includes(c));
  const barMax = barCol ? Math.max(1, ...rows.map((r) => Number(r[barCol]) || 0)) : 1;
  const changes = b.diff && !b.diff.first_run ? b.diff.new + b.diff.gone + b.diff.changed : null;
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2200); };
  const meta = `${b.data_window?.from} to ${b.data_window?.to} · /${b.skill} · ${report.source === "agent" ? `from agent${b.agent_name ? ` "${b.agent_name}"` : ""}` : "from Ask"} · generated ${new Date(report.created_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB`;

  return (
    <article className="doc">
      <header>
        <div><h2>{report.title}</h2><p>{meta}</p></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {changes != null && <span className="pill blue">{changes} change{changes === 1 ? "" : "s"}</span>}
          {b.diff?.first_run && <span className="pill">baseline</span>}
          {b.sections?.generated_by === "fallback" && <span className="pill" title="ANTHROPIC_API_KEY not set when this report was generated">no model headline</span>}
        </div>
      </header>
      <section>
        <div className="lead"><RichText text={b.sections?.headline ?? ""} onChip={(id) => setOpenEv((o) => (o[0] === id && o.length === 1 ? [] : [id]))} /></div>
        {openEv.length > 0 && <div style={{ marginTop: 12 }}><EvidenceList items={openEv.map((id) => evidence[id]).filter(Boolean)} title={`Evidence · ${openEv.join(", ")}`} /></div>}
      </section>
      {b.diff && (
        <section>
          <h4>What changed</h4>
          {b.diff.first_run || !b.changed_entries?.length ? (
            <p style={{ color: "var(--text-2)", fontSize: 13 }}>{b.what_changed?.[0] ?? "No changes."}</p>
          ) : (
            <div className="changed"><ul>
              {b.changed_entries.map((e) => (
                <li key={e.kind + e.key}>
                  <span className="b">{e.label}</span>
                  <span className="d">{e.detail}</span>
                  <span className={`delta ${e.kind === "new" ? "up" : e.kind === "gone" ? "down" : (e.delta ?? 0) >= 0 ? "up" : "down"}`}>
                    {e.kind === "new" ? "NEW" : e.kind === "gone" ? "GONE" : `${(e.delta ?? 0) > 0 ? "+" : ""}${e.delta}${e.unit === "pct" ? "%" : " pts"}`}
                  </span>
                </li>
              ))}
            </ul></div>
          )}
        </section>
      )}
      {b.chart ? <section><h4>Chart</h4><div className="chart"><Chart spec={b.chart as ChartSpec} /></div></section> : null}
      {rows.length > 0 && (
        <section>
          <h4>{b.skill === "compare" ? "Brand table" : "Table"} <span style={{ fontWeight: 500, color: "var(--text-3)" }}>· {rows.length} of {b.rows_total} rows</span></h4>
          <div style={{ overflow: "auto" }}>
            <table>
              <thead><tr>{cols.map((c) => <th key={c} className={typeof rows[0][c] === "number" && c !== barCol ? "num" : ""}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 25).map((r, i) => (
                  <tr key={i} style={{ cursor: "default" }}>
                    {cols.map((c) => (
                      <td key={c} className={typeof r[c] === "number" && c !== barCol ? "num" : ""}>
                        {c === barCol ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div className="bar"><i style={{ width: `${((Number(r[c]) || 0) / barMax) * 100}%` }} /></div><span className="num">{fmtNum(r[c])}%</span></div>
                          : c === "url" && typeof r[c] === "string" ? <a href={String(r[c])} target="_blank" rel="noreferrer" className="linkbtn">open</a>
                          : /(_at|posted|last_post|first_post|week_from|week_to)$/.test(c) && typeof r[c] === "string" ? fmtDate(r[c])
                          : typeof r[c] === "number" ? fmtNum(r[c]) : typeof r[c] === "boolean" ? (r[c] ? "yes" : "no") : String(r[c] ?? "–")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {b.sections?.worth_acting_on && (
        <section><h4>Worth acting on</h4><div style={{ maxWidth: "64ch", color: "var(--text-2)" }}><RichText text={b.sections.worth_acting_on} onChip={(id) => setOpenEv([id])} /></div></section>
      )}
      {!!b.caveats?.length && <section><h4>Caveats</h4><ul style={{ paddingLeft: 18, fontSize: 12, color: "var(--text-3)" }}>{b.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul></section>}
      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn sm" onClick={() => window.print()}>Print / Save as PDF</button>
        <a className="btn sm" href={`/api/reports/${report.id}?format=md`} target="_blank" rel="noreferrer">Markdown</a>
        {report.skill_run_id && b.skill === "discovery" && <Link className="btn sm" href={`/skills/discovery?run=${report.skill_run_id}`}>Open in /discovery</Link>}
        <button className="btn sm" onClick={() => showToast("WhatsApp delivery is a stub in v1")}>Send to WhatsApp</button>
        <button className="btn sm ghost" onClick={async () => { if (!confirm("Delete this report?")) return; await fetch(`/api/reports/${report.id}`, { method: "DELETE" }); router.push("/reports"); router.refresh(); }}>Delete</button>
      </section>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </article>
  );
}
