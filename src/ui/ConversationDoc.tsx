"use client";
/** A report made from a whole conversation: key findings and next steps, then each question with its answer, tables and evidence. */
import Link from "next/link";
import { sendSignal } from "./signal";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConversationBlocks, ConversationTool } from "@/reports/conversation";
import type { ChartSpec, Evidence } from "@/skills/types";
import { RichText } from "./Ask";
import { Chart } from "./Chart";
import { EvidenceList } from "./Evidence";
import { fmtDate, fmtNum } from "./format";

const HIDE = new Set(["evidence_ids", "evidence_id", "post_id", "creator_id", "creator_key", "top_creator_ids", "used_by", "shared_list", "months_active_list", "top_posts", "caption", "hashtags", "top_topics", "top_questions", "topics"]);

function ToolTable({ t }: { t: ConversationTool }) {
  const [chart, setChart] = useState(false);
  const rows = t.rows;
  const first = rows[0] ?? {};
  const cols = Object.keys(first).filter((k) => !HIDE.has(k) && (first[k] == null || typeof first[k] !== "object")).slice(0, 7);
  const spec = t.chart as ChartSpec | null;
  const hasChart = !!spec && Array.isArray(spec.x) && spec.x.length >= 3;
  return (
    <div className="cr-tool">
      <div className="cr-th">
        <b>{t.title}</b>
        <span>{t.status === "ok" ? `${fmtNum(t.rows_total)} row${t.rows_total === 1 ? "" : "s"}` : t.status}{t.data_window ? ` · ${t.data_window.from} to ${t.data_window.to}` : ""}</span>
        {hasChart && <button className="btn sm ghost" onClick={() => { if (!chart) sendSignal("chat.show_chart", { where: "doc" }); setChart((c) => !c); }}>{chart ? "Hide chart" : "Show chart"}</button>}
      </div>
      {t.status !== "ok" && t.message && <p className="muted">{t.message}</p>}
      {hasChart && (chart || !rows.length) && <div className="chart"><Chart spec={spec!} /></div>}
      {rows.length > 0 && (
        <div style={{ overflow: "auto" }}>
          <table>
            <thead><tr>{cols.map((c) => <th key={c} className={typeof first[c] === "number" ? "num" : ""}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, 8).map((r, i) => (
                <tr key={i} style={{ cursor: "default" }}>
                  {cols.map((c) => <td key={c} className={typeof r[c] === "number" ? "num" : ""}>{c === "url" && typeof r[c] === "string" ? <a className="linkbtn" href={String(r[c])} target="_blank" rel="noreferrer">open</a> : /(_at|posted)$/.test(c) && typeof r[c] === "string" ? fmtDate(r[c] as string) : typeof r[c] === "number" ? fmtNum(r[c]) : String(r[c] ?? "–")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {t.rows_total > 8 && <small className="muted">First 8 of {fmtNum(t.rows_total)} rows.</small>}
        </div>
      )}
    </div>
  );
}

export function ConversationDoc({ report }: { report: { id: string; title: string; created_at: string; blocks: ConversationBlocks } }) {
  const router = useRouter();
  const b = report.blocks;
  const [openEv, setOpenEv] = useState<string[]>([]);
  const evidence: Record<string, Evidence> = Object.fromEntries((b.evidence ?? []).map((e) => [e.id, e]));
  const chip = (id: string) => setOpenEv((o) => (o[0] === id && o.length === 1 ? [] : [id]));
  return (
    <article className="doc convdoc">
      <header>
        <div>
          <h2>{report.title}</h2>
          <p>From a conversation in Chats · {b.questions} question{b.questions === 1 ? "" : "s"} · {b.analyses} analys{b.analyses === 1 ? "is" : "es"}{b.data_window ? ` · data ${b.data_window.from} to ${b.data_window.to}` : ""} · made {new Date(report.created_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB</p>
        </div>
        {b.summary.by === "fallback" && <span className="pill" title={b.summary.problems.join("\n")}>plain summary</span>}
      </header>
      <section>
        <h4>Key findings</h4>
        <ul className="cr-list">{b.summary.findings.map((f, i) => <li key={i}><RichText text={f} onChip={chip} /></li>)}</ul>
        {b.summary.actions.length > 0 && (
          <>
            <h4 style={{ marginTop: 16 }}>What to do next</h4>
            <ol className="cr-list">{b.summary.actions.map((a, i) => <li key={i}><RichText text={a} onChip={chip} /></li>)}</ol>
          </>
        )}
        {openEv.length > 0 && <div style={{ marginTop: 12 }}><EvidenceList items={openEv.map((id) => evidence[id]).filter(Boolean)} title={`Evidence · ${openEv.join(", ")}`} /></div>}
      </section>
      {b.sections.map((s, i) => (
        <section key={i} className="cr-sec">
          <div className="cr-q"><span>{String(i + 1).padStart(2, "0")}</span>{s.question || "Answer"}</div>
          {s.context && <p className="muted" style={{ fontSize: 12 }}>Asked from: {s.context}</p>}
          {s.answer && <div className="cr-a"><RichText text={s.answer} onChip={chip} /></div>}
          {s.tools.map((t, j) => <ToolTable key={j} t={t} />)}
        </section>
      ))}
      {b.evidence.length > 0 && <section><h4>Evidence</h4><EvidenceList items={b.evidence} /></section>}
      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn sm" onClick={() => window.print()}>Print / Save as PDF</button>
        <a className="btn sm" href={`/api/reports/${report.id}?format=md`} target="_blank" rel="noreferrer">Markdown</a>
        <Link className="btn sm" href={`/?c=${b.conversation_id}`}>Open the conversation</Link>
        <button className="btn sm ghost" onClick={async () => { if (!confirm("Delete this report?")) return; await fetch(`/api/reports/${report.id}`, { method: "DELETE" }); router.push("/reports"); router.refresh(); }}>Delete</button>
      </section>
    </article>
  );
}
