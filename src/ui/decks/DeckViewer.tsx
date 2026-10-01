"use client";
/**
 * A deck, version by version (DECISIONS, 2 Oct 2026): the same slide viewer as Weekly Reports (the
 * actual slides, Ask AI on each, PDF and PowerPoint, Present), with the deck's own actions: make a version
 * for another period, make the next one on its own every week or month, edit, delete.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WeeklyItem } from "@/reports/weekly";
import { WeeklyViewer } from "../weekly/WeeklyViewer";

type Props = {
  deck: { id: string; name: string; grain: "week" | "month"; recurring: boolean; last_error: string | null; source: string; next_run_at: string | null };
  items: WeeklyItem[];
  initialId: string;
  initialSlide: number;
  periods: { key: string; label: string }[];
};

export function DeckViewer({ deck, items, initialId, initialSlide, periods }: Props) {
  const router = useRouter();
  const [recurring, setRecurring] = useState(deck.recurring);
  const [menu, setMenu] = useState(false);
  const [period, setPeriod] = useState(periods[0]?.key ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(deck.last_error ?? "");
  const [onScreen, setOnScreen] = useState(initialId);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const pick = useCallback((id: string) => setOnScreen(id), []);
  const unit = deck.grain;

  async function toggleRecurring() {
    const next = !recurring;
    setRecurring(next);
    const r = await fetch(`/api/decks/${deck.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recurring: next }) });
    if (!r.ok) setRecurring(!next);
    router.refresh();
  }

  async function makeVersion() {
    const label = periods.find((p) => p.key === period)?.label ?? period;
    setMenu(false);
    setBusy(`Making the ${label} version: the numbers, the words, the slides… (about a minute)`);
    setError("");
    const r = await fetch(`/api/decks/${deck.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
    const o = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok || !o.report_id) { setError(o.message ?? "The version could not be made"); return; }
    router.push(`/decks/${deck.id}?v=${o.report_id}`);
    router.refresh();
  }

  async function removeVersion() {
    const item = items.find((i) => i.id === onScreen);
    if (!item || !confirm(`Delete the ${item.label} version of this deck?`)) return;
    const r = await fetch(`/api/reports/${item.id}`, { method: "DELETE" });
    if (r.ok) { router.push(`/decks/${deck.id}`); router.refresh(); }
  }

  async function removeDeck() {
    if (!confirm(`Delete the deck "${deck.name}" and every version of it? This cannot be undone.`)) return;
    const r = await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
    if (r.ok) { router.push("/decks"); router.refresh(); }
  }

  const actions = (
    <>
      <button className={`btn sm ${recurring ? "on" : "ghost"}`} onClick={toggleRecurring} title={recurring ? `A new version is made when a new ${unit} of data lands. Click to stop.` : `Make the next version every ${unit}, when the data lands`}>
        {recurring ? `Every ${unit} ✓` : `Make every ${unit}`}
      </button>
      <div className="dmenu" ref={box}>
        <button className="btn sm" onClick={() => setMenu((m) => !m)} disabled={!!busy}>New version ▾</button>
        {menu && (
          <div className="dmenu-pop">
            <label>For<select value={period} onChange={(e) => setPeriod(e.target.value)}>{periods.map((p) => <option key={p.key} value={p.key}>{p.label}{items.some((i) => i.iso === p.key) ? " (replace)" : ""}</option>)}</select></label>
            <button className="btn pri sm" onClick={makeVersion}>Make it</button>
          </div>
        )}
      </div>
      <Link className="btn sm ghost" href={`/decks/${deck.id}/edit`}>Edit</Link>
      <details className="dmore">
        <summary className="btn sm ghost" aria-label="More">⋯</summary>
        <div className="dmenu-pop">
          {items.length > 1 && <button className="linkbtn" onClick={removeVersion}>Delete this version</button>}
          <button className="linkbtn danger" onClick={removeDeck}>Delete the deck</button>
        </div>
      </details>
    </>
  );

  return (
    <>
      {(busy || error) && <div className={busy ? "dbanner" : "dbanner err"}>{busy ?? `Last run: ${error}`}</div>}
      <WeeklyViewer
        key={initialId}
        items={items}
        initialId={initialId}
        initialSlide={initialSlide}
        title={deck.name}
        subtitle={`${unit === "month" ? "Month on month" : "Week on week"} · ${items.length} version${items.length === 1 ? "" : "s"}${recurring ? ` · a new one every ${unit}` : ""} · Ask AI on every slide`}
        path={`/decks/${deck.id}`}
        param="v"
        actions={actions}
        onPick={pick}
      />
    </>
  );
}
