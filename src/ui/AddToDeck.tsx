"use client";
/**
 * "Add to a deck" (DECISIONS, 2 Oct 2026): a Dashboard section becomes a slide of a deck (rankings → the
 * scoreboard, tiers, mentions → the trend, creators, content), an answer from Chats becomes a finding run
 * again for every version. "New deck" starts one from it.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type DeckItem = { id: string; name: string; versions: number };
export type DeckPayload = { slide: string; brands?: string[]; grain?: "week" | "month" } | { skill_run_id: string; question?: string };

export function AddToDeck({ payload, label = "Add to a deck", className = "btn sm", onDone }: { payload: DeckPayload; label?: string; className?: string; onDone?: (message: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decks, setDecks] = useState<DeckItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    if (!decks) fetch("/api/decks").then((r) => r.json()).then((j) => setDecks(Array.isArray(j) ? j : [])).catch(() => setDecks([]));
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, decks]);

  async function add(d: DeckItem) {
    setBusy("Adding…");
    setError("");
    const r = await fetch(`/api/decks/${d.id}/add`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setError(j.error ?? "Could not add it"); return; }
    setDone(d);
    setOpen(false);
    onDone?.(`Added to “${d.name}”: it is in the next version`);
  }

  async function addToNew() {
    if ("slide" in payload) {
      const q = new URLSearchParams({ slide: payload.slide, ...(payload.brands?.length ? { brands: payload.brands.join(",") } : {}), ...(payload.grain ? { grain: payload.grain } : {}) });
      router.push(`/decks/new?${q}`);
      return;
    }
    setBusy("Making the deck… (about a minute)");
    setError("");
    const r = await fetch("/api/decks/from-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill_run_id: payload.skill_run_id }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok || !j.deck) { setError(j.error ?? "Could not make the deck"); return; }
    router.push(`/decks/${j.deck.id}${j.version?.report_id ? `?v=${j.version.report_id}` : ""}`);
  }

  return (
    <span className="addpulse" ref={box}>
      {done ? (
        <button className={className} onClick={() => router.push(`/decks/${done.id}`)} title={`Open “${done.name}”`}>Added ✓ Open</button>
      ) : (
        <button className={className} onClick={() => setOpen((o) => !o)} disabled={!!busy} aria-expanded={open}>{busy ?? `+ ${label}`}</button>
      )}
      {open && (
        <span className="menu" role="menu">
          {decks === null && <span className="none">Loading…</span>}
          {decks?.map((d) => <button key={d.id} role="menuitem" onClick={() => add(d)}>{d.name}<small>{d.versions} version{d.versions === 1 ? "" : "s"}</small></button>)}
          <button role="menuitem" className="new" onClick={addToNew}>+ New deck…</button>
          {error && <span className="err">{error}</span>}
        </span>
      )}
    </span>
  );
}
