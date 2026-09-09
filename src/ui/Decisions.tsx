"use client";
/**
 * Decisions (PRD-v2 §7, amended): CeMO's proactive side. The brief speaks first, then
 * what the watchers noticed, then the decisions grouped open / decided / archived.
 * Chats are the default screen; this is where you come to see what CeMO brought you.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BriefContent, BriefItem } from "@/brief/store";
import type { DecisionStatus, DecisionSummary } from "@/decisions/store";
import type { Evidence } from "@/skills/types";
import { RichText } from "./Ask";
import { EvidenceList } from "./Evidence";
import { fmtDate } from "./format";

type Props = { decisions: DecisionSummary[]; brief: BriefContent | null; evidence: Evidence[]; generatedAt: string | null; stale: boolean; clientName: string | null; dateLine: string; canRefresh: boolean };

export function Decisions({ decisions, brief: initialBrief, evidence: initialEvidence, generatedAt: initialGeneratedAt, stale, clientName, dateLine, canRefresh }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [openEv, setOpenEv] = useState<string[]>([]);
  const [brief, setBrief] = useState(initialBrief);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [writing, setWriting] = useState(stale);
  const asked = useRef(false);
  // the data moved since the last brief (or there is none): write one now without blocking the page
  useEffect(() => {
    if (!stale || asked.current) return;
    asked.current = true;
    fetch("/api/brief").then((r) => r.json()).then((j) => {
      if (j?.content) { setBrief(j.content); setEvidence(j.evidence ?? []); setGeneratedAt(j.generated_at ?? null); }
    }).catch(() => undefined).finally(() => setWriting(false));
  }, [stale]);
  const evidenceById = Object.fromEntries(evidence.map((e) => [e.id, e]));

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    await fetch(`/api/decisions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    router.refresh();
  }
  async function create() {
    if (!name.trim()) return;
    setBusy("new");
    const r = await fetch("/api/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const d = await r.json();
    setBusy(null);
    if (d.id) router.push(`/d/${d.id}`);
  }
  function decide(d: DecisionSummary) {
    const outcome = window.prompt(`What did you decide on "${d.name}"?`, d.outcome ?? "");
    if (outcome === null) return;
    void patch(d.id, { status: "decided", outcome: outcome.trim() || null });
  }
  /** The brief's offer or a follow-up opens a decision named from the prompt and sends it on arrival. */
  async function start(item: BriefItem) {
    if (busy) return;
    setBusy(item.prompt);
    const r = await fetch("/api/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from_prompt: item.prompt }) });
    const d = await r.json();
    if (d.error) { setBusy(null); return; }
    const hint = item.skill ? `&skill=${encodeURIComponent(item.skill)}${item.params ? `&params=${encodeURIComponent(JSON.stringify(item.params))}` : ""}` : "";
    router.push(`/d/${d.id}?send=${encodeURIComponent(item.prompt)}${hint}`);
  }
  async function refresh() {
    setBusy("refresh");
    const r = await fetch("/api/brief", { method: "POST" });
    const j = await r.json();
    setBusy(null);
    if (!j.fresh) { alert(j.reason === "refreshed less than an hour ago" ? "The brief was refreshed less than an hour ago." : `Nothing to refresh: ${j.reason}.`); return; }
    if (j?.content) { setBrief(j.content); setEvidence(j.evidence ?? []); setGeneratedAt(j.generated_at ?? null); }
  }

  const noticed = brief?.noticed ?? [];
  const groups: { key: DecisionStatus; title: string }[] = [{ key: "open", title: "Open" }, { key: "decided", title: "Decided" }, { key: "archived", title: "Archived" }];
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Decisions</h1><span className="meta">{dateLine} · {clientName ? `On the side of ${clientName}` : "Beauty · Indonesia"}</span></div>
        <div className="newdec">
          <input value={name} placeholder="New decision, e.g. Ramadan launch" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
          <button className="btn pri sm" onClick={create} disabled={busy === "new" || !name.trim()}>Start</button>
        </div>
      </div>
      <div className="wrap">
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
          <div className="brief quiet"><h1>Nothing loaded yet.</h1><p className="body">Load the data and I will open with what changed.</p></div>
        ) : null}

        {noticed.length > 0 && (
          <div className="sec">
            <h2>What I noticed this week</h2>
            {noticed.map((n) => (
              <div className="alert" key={n.agent_id + n.when}>
                <div><b>{n.agent_name}</b>{n.decision_name ? ` · ${n.decision_name}` : ""}: {n.lines[0] ?? `${n.changes} change${n.changes === 1 ? "" : "s"}`}</div>
                <div className="w">{fmtDate(n.when)}</div>
              </div>
            ))}
          </div>
        )}

        {groups.map((g) => {
          const items = decisions.filter((d) => d.status === g.key);
          if (!items.length && g.key !== "open") return null;
          return (
            <div className="sec" key={g.key}>
              <h2>{g.title}</h2>
              {items.length === 0 && <div className="dec none">Nothing open. Say yes to the brief above, or start one on the right.</div>}
              {items.map((d) => (
                <div className="dec" key={d.id}>
                  <span className="n" onClick={() => router.push(`/d/${d.id}`)}>{d.name}{d.outcome ? <small> — {d.outcome}</small> : null}</span>
                  <span className="m">
                    <span>{d.threads} thread{d.threads === 1 ? "" : "s"}</span>
                    {d.pinned > 0 && <span>{d.pinned} pinned</span>}
                    {d.watching > 0 && <span>{d.watching} watching</span>}
                    {d.client_name && <span>for {d.client_name}</span>}
                    <span>{fmtDate(d.last_activity)}</span>
                  </span>
                  <span className="acts">
                    {d.status === "open" && <button className="btn sm" disabled={busy === d.id} onClick={() => decide(d)}>Mark decided</button>}
                    {d.status !== "archived" && <button className="btn sm ghost" disabled={busy === d.id} onClick={() => patch(d.id, { status: "archived" })}>Archive</button>}
                    {d.status !== "open" && <button className="btn sm ghost" disabled={busy === d.id} onClick={() => patch(d.id, { status: "open" })}>Reopen</button>}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
