"use client";
/** A deck without a version yet (its first run failed, or it came from Chats): make one. */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeckFirst({ deckId, error, periods }: { deckId: string; error: string | null; periods: { key: string; label: string }[] }) {
  const router = useRouter();
  const [period, setPeriod] = useState(periods[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(error ?? "");
  async function make() {
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/decks/${deckId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
    const o = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || !o.report_id) { setErr(o.message ?? "The version could not be made"); return; }
    router.push(`/decks/${deckId}?v=${o.report_id}`);
    router.refresh();
  }
  return (
    <div className="dcard">
      <h3>Make the first version</h3>
      {err && <div className="errbox">Last run: {err}</div>}
      <div className="wactions" style={{ justifyContent: "flex-start" }}>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>{periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
        <button className="btn pri sm" disabled={busy} onClick={make}>{busy ? "Making it… (about a minute)" : "Make it"}</button>
        <a className="btn sm ghost" href={`/decks/${deckId}/edit`}>Edit the deck</a>
      </div>
    </div>
  );
}
