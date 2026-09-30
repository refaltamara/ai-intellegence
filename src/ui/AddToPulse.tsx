"use client";
/**
 * "Add to a Pulse": puts what you are looking at (a Dashboard section with its
 * filters, or an answer from Chats) on one of the team's Pulses, or on a new one.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type PulseItem = { id: string; name: string; cards: number };
export type CardPayload = { kind: string; config?: Record<string, unknown>; skill_run_id?: string; title?: string; size?: string };

export function AddToPulse({ payload, label = "Add to a Pulse", className = "btn sm", onDone }: { payload: CardPayload; label?: string; className?: string; onDone?: (message: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pulses, setPulses] = useState<PulseItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    if (!pulses) fetch("/api/pulses").then((r) => r.json()).then((j) => setPulses(Array.isArray(j) ? j : [])).catch(() => setPulses([]));
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, pulses]);

  async function add(p: { id: string; name: string }) {
    setBusy(true);
    setError("");
    const r = await fetch(`/api/pulses/${p.id}/cards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error ?? "Could not add it"); return; }
    setDone(p);
    setOpen(false);
    onDone?.(`Added to “${p.name}”`);
  }
  async function addToNew() {
    const name = window.prompt("Name the new Pulse", "My Pulse");
    if (!name) return;
    setBusy(true);
    const r = await fetch("/api/pulses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, template: "blank" }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || !j.pulse) { setError(j.error ?? "Could not create the Pulse"); return; }
    setPulses(null);
    await add(j.pulse);
  }

  return (
    <span className="addpulse" ref={box}>
      {done ? (
        <button className={className} onClick={() => router.push(`/pulse/${done.id}`)} title={`Open “${done.name}”`}>Added ✓ Open</button>
      ) : (
        <button className={className} onClick={() => setOpen((o) => !o)} disabled={busy} aria-expanded={open}>{busy ? "Adding…" : `+ ${label}`}</button>
      )}
      {open && (
        <span className="menu" role="menu">
          {pulses === null && <span className="none">Loading…</span>}
          {pulses?.map((p) => <button key={p.id} role="menuitem" onClick={() => add(p)}>{p.name}<small>{p.cards} card{p.cards === 1 ? "" : "s"}</small></button>)}
          <button role="menuitem" className="new" onClick={addToNew}>+ New Pulse…</button>
          {error && <span className="err">{error}</span>}
        </span>
      )}
    </span>
  );
}
