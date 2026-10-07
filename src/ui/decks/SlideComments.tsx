"use client";
/**
 * Comments on a slide (DECISIONS, 7 Oct 2026): the team's notes on this version's slide, and CeMO's
 * replies when a comment mentions @CeMO, with the change it proposes as a card. Plain comments are
 * free; CeMO's reply costs what a question costs, a drafted change what a drafted change costs.
 */
import { useState } from "react";
import type { SlideComment } from "@/decks/comments";
import { DeckChangeCard } from "./DeckChangeCard";

const when = (t: string) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SlideComments({ deckId, reportId, n, slideTitle, comments, onPosted }: { deckId: string; reportId: string; n: number; slideTitle: string; comments: SlideComment[]; onPosted: (c: SlideComment[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const here = comments.filter((c) => c.slide === n);
  const cemo = /(^|\s)@cemo\b/i.test(text);
  async function post() {
    setBusy(true); setErr("");
    const r = await fetch(`/api/decks/${deckId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report_id: reportId, slide: n, text }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Could not post."); return; }
    setText("");
    onPosted(j.comments as SlideComment[]);
  }
  return (
    <div className="sc-panel">
      <small className="muted">Slide {n} · {slideTitle}</small>
      <div className="sc-list">
        {!here.length && <p className="muted">No comments on this slide yet. Leave a note for the team, or mention @CeMO to change the slide, the deck or its template.</p>}
        {here.map((c) => (
          <div key={c.id} className={`sc-item ${c.author}`}>
            <b>{c.author === "cemo" ? "CeMO" : c.author_name ?? c.author_email ?? "Someone"} <span>{when(c.created_at)}</span></b>
            <p>{c.text}</p>
            {c.proposal && <DeckChangeCard p={c.proposal} from="comment" />}
          </div>
        ))}
        {busy && cemo && <div className="sc-item cemo"><b>CeMO</b><p className="muted">Reading the slide…</p></div>}
      </div>
      {err && <div className="errbox">{err}</div>}
      <div className="sc-compose">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Comment, or @CeMO to change…" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) void post(); }} />
        <div className="wactions" style={{ justifyContent: "space-between" }}>
          <small className="muted">{cemo ? "CeMO will reply: 1 credit, 3 if it drafts a change" : "Comments are free"}</small>
          <button className="btn pri sm" disabled={busy || !text.trim()} onClick={post}>{busy ? (cemo ? "CeMO is reading…" : "Posting…") : "Post"}</button>
        </div>
      </div>
    </div>
  );
}
