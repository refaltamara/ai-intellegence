"use client";
/** Today (PRD-v2 §7): the brief speaks first, then open decisions, then what the watchers noticed. */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BriefContent, BriefItem } from "@/brief/store";
import type { DecisionSummary } from "@/decisions/store";
import type { Evidence } from "@/skills/types";
import { RichText } from "./Ask";
import { EvidenceList } from "./Evidence";
import { fmtDate } from "./format";

export function Today({ brief: initialBrief, evidence: initialEvidence, generatedAt: initialGeneratedAt, stale, decisions, clientName, dateLine, canRefresh }: { brief: BriefContent | null; evidence: Evidence[]; generatedAt: string | null; stale: boolean; decisions: DecisionSummary[]; clientName: string | null; dateLine: string; canRefresh: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [openEv, setOpenEv] = useState<string[]>([]);
  const [brief, setBrief] = useState(initialBrief);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [writing, setWriting] = useState(stale);
  const asked = useRef(false);
  // the data moved since the last brief (or there is none): write one now, without blocking the page
  useEffect(() => {
    if (!stale || asked.current) return;
    asked.current = true;
    fetch("/api/brief").then((r) => r.json()).then((j) => {
      if (j?.content) { setBrief(j.content); setEvidence(j.evidence ?? []); setGeneratedAt(j.generated_at ?? null); }
    }).catch(() => undefined).finally(() => setWriting(false));
  }, [stale]);
  const evidenceById = Object.fromEntries(evidence.map((e) => [e.id, e]));

  /** A new thread opens a new decision named from the prompt; the first message is sent on arrival. */
  async function start(item: BriefItem | string) {
    const prompt = typeof item === "string" ? item.trim() : item.prompt;
    if (!prompt || busy) return;
    setBusy(prompt);
    const r = await fetch("/api/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from_prompt: prompt }) });
    const d = await r.json();
    if (d.error) { setBusy(null); return; }
    const hint = typeof item === "string" || !item.skill ? "" : `&skill=${encodeURIComponent(item.skill)}${item.params ? `&params=${encodeURIComponent(JSON.stringify(item.params))}` : ""}`;
    router.push(`/d/${d.id}?send=${encodeURIComponent(prompt)}${hint}`);
  }

  async function refresh() {
    setBusy("refresh");
    const r = await fetch("/api/brief", { method: "POST" });
    const j = await r.json();
    setBusy(null);
    if (!j.fresh) { alert(j.reason === "refreshed less than an hour ago" ? "The brief was refreshed less than an hour ago." : `Nothing to refresh: ${j.reason}.`); return; }
    if (j?.content) { setBrief(j.content); setEvidence(j.evidence ?? []); setGeneratedAt(j.generated_at ?? null); }
  }

  const open = decisions.filter((d) => d.status === "open");
  const noticed = brief?.noticed ?? [];
  return (
    <section className="screen today">
      <div className="wrap">
        <div className="date">{dateLine} · {clientName ? `On the side of ${clientName}` : "Beauty · Indonesia"}</div>

        {writing && !brief && (
          <div className="brief writing"><div className="activity"><span className="dot" />Reading the week and writing your brief…</div></div>
        )}
        {brief ? (
          <div className={`brief ${brief.quiet ? "quiet" : ""} ${writing ? "stale" : ""}`}>
            <h1><RichText text={brief.headline} onChip={(id) => setOpenEv((o) => (o[0] === id ? [] : [id]))} /></h1>
            {brief.body && <div className="body"><RichText text={brief.body} onChip={(id) => setOpenEv((o) => (o[0] === id ? [] : [id]))} /></div>}
            {openEv.length > 0 && <div style={{ marginTop: 12 }}><EvidenceList items={openEv.map((id) => evidenceById[id]).filter(Boolean)} title={`Evidence · ${openEv.join(", ")}`} /></div>}
            {(brief.offer || brief.followups.length > 0) && (
              <div className="offer">
                {brief.offer && <button className="go" disabled={!!busy} onClick={() => start(brief.offer!)}>{busy === brief.offer.prompt ? "Opening…" : brief.offer.label}</button>}
                {brief.followups.length > 0 && <div className="chips">{brief.followups.map((f) => <button className="chip" key={f.label} disabled={!!busy} onClick={() => start(f)}>{f.label}</button>)}</div>}
              </div>
            )}
            <div className="meta">
              <span>{writing ? "The data moved since this was written; rewriting…" : `${brief.window.from} to ${brief.window.to} against the prior week${generatedAt ? ` · written ${fmtDate(generatedAt)}` : ""}${brief.generated_by === "fallback" ? " · without the model" : ""}`}</span>
              {canRefresh && <button className="btn sm ghost" disabled={!!busy} onClick={refresh}>{busy === "refresh" ? "Rewriting…" : "Refresh"}</button>}
            </div>
          </div>
        ) : !writing ? (
          <div className="brief quiet"><h1>Nothing loaded yet.</h1><p className="body">Load the data and I will open the day with what changed.</p></div>
        ) : null}

        <div className="composer today-composer">
          <input value={text} placeholder="Or ask me something" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") start(text); }} disabled={!!busy} />
          <button className="send" aria-label="Send" disabled={!!busy || !text.trim()} onClick={() => start(text)}>→</button>
        </div>

        <div className="sec">
          <h2>Open decisions</h2>
          {open.length === 0 && <div className="dec none">No open decisions. Ask something above and it starts one.</div>}
          {open.map((d) => (
            <div className="dec" key={d.id} onClick={() => router.push(`/d/${d.id}`)}>
              <span className="n">{d.name}</span>
              <span className="m">
                <span>{d.threads} thread{d.threads === 1 ? "" : "s"}</span>
                {d.pinned > 0 && <span>{d.pinned} pinned</span>}
                {d.watching > 0 && <span>watching</span>}
                {d.client_name && <span>for {d.client_name}</span>}
              </span>
              <span className="pill open">Open</span>
            </div>
          ))}
          <div className="more"><a href="/decisions">All decisions</a></div>
        </div>

        <div className="sec">
          <h2>What I noticed this week</h2>
          {noticed.length === 0 && <div className="alert none"><div>Nothing from the watchers this week. Set one up from any answer with “Watch this weekly”.</div></div>}
          {noticed.map((n) => (
            <div className="alert" key={n.agent_id + n.when}>
              <div><b>{n.agent_name}</b>{n.decision_name ? ` · ${n.decision_name}` : ""}: {n.lines[0] ?? `${n.changes} change${n.changes === 1 ? "" : "s"}`}</div>
              <div className="w">{fmtDate(n.when)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
