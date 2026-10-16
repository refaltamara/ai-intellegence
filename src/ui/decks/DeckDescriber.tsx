"use client";
/**
 * "Describe the deck you want" on New deck (Refal, 16 Oct 2026): a sentence or two, and CeMO lays the deck out
 * from the team's templates, library slides and analyses (src/decks/describe.ts), drafting at most two new slides
 * for what nothing else shows. The draft fills the form below; nothing is made until the person creates the deck.
 */
import { useState } from "react";
import type { DeckDraft } from "@/decks/describe";

export function DeckDescriber({ onDraft }: { onDraft: (d: DeckDraft) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<DeckDraft | null>(null);
  async function draft() {
    setBusy(true); setError(""); setDone(null);
    try {
      const r = await fetch("/api/decks/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "CeMO could not lay it out.");
      onDraft(j as DeckDraft);
      setDone(j as DeckDraft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ddescribe">
      <h3>Describe the deck you want</h3>
      <p className="muted">Say what it should show and how often; CeMO picks the template, the brands and the slides below, and drafts a new slide only for what the library does not have. Check it, then create it.</p>
      <div className="ddrow">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={800} placeholder="e.g. Monthly: share of views for our brand and the top 5 competitors, top creators, then comments that mention halal per week" />
        <button type="button" className="btn pri sm" disabled={busy || text.trim().length < 8} onClick={draft}>{busy ? "Laying it out…" : "Lay it out"}</button>
      </div>
      {busy && <p className="muted">This takes up to a minute when a new slide is drafted and tried on the newest week.</p>}
      {error && <div className="errbox">{error}</div>}
      {done && (
        <p className="ddone">
          Filled in below from <b>{done.name}</b>: {done.slides.length} slide type{done.slides.length === 1 ? "" : "s"}{done.skills.length ? `, ${done.skills.length} of the team's analyses` : ""}{done.added.length ? `; new: ${done.added.map((a) => a.title).join(", ")} (kept as your team's slides)` : ""}.
          {done.notes.length > 0 && <> Not placed: {done.notes.join("; ")}.</>}
        </p>
      )}
    </section>
  );
}
