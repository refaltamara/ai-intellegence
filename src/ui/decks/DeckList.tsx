"use client";
/**
 * The team's decks as one list (Refal, 16 Oct 2026): a row per deck with what it is, the brands, how often it
 * repeats and its status (src/decks/status.ts), so people can tell what they monitor from what is done. A row
 * opens the deck on its latest version; its menu pauses, resumes, sets the last day, stops or deletes it. The
 * client's weekly report schedule sits in the same list (it opens the Weekly Reports viewer).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DeckState } from "@/decks/status";

export type DeckItem = {
  id: string;
  /** "deck" opens /decks/<id>; "weekly" is a weekly report schedule (an agent) and opens /weekly */
  type: "deck" | "weekly";
  href: string;
  name: string;
  kind: string;
  brands: string;
  repeats: string;
  state: DeckState;
  status: string;
  detail: string;
  ends_on: string | null;
  latest: string | null;
  versions: number;
  updated: string;
  error: string | null;
};

const FILTERS: { key: "all" | DeckState; label: string }[] = [
  { key: "all", label: "All" },
  { key: "monitoring", label: "Monitoring" },
  { key: "paused", label: "Paused" },
  { key: "ended", label: "Ended" },
  { key: "one-off", label: "One-off" },
];

export function DeckList({ decks, today }: { decks: DeckItem[]; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<"all" | DeckState>("all");
  const [until, setUntil] = useState<{ id: string; value: string } | null>(null);
  const count = (k: "all" | DeckState) => (k === "all" ? decks.length : decks.filter((d) => d.state === k).length);
  const shown = filter === "all" ? decks : decks.filter((d) => d.state === filter);

  async function patch(d: DeckItem, body: Record<string, unknown>, what: string) {
    setBusy(d.id); setMsg("");
    const url = d.type === "weekly" ? `/api/agents/${d.id}` : `/api/decks/${d.id}`;
    const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    if (!r.ok) { setMsg(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Could not ${what}.`); return; }
    setUntil(null);
    router.refresh();
  }
  async function remove(d: DeckItem) {
    if (!confirm(`Delete the deck "${d.name}" and every version of it? This cannot be undone.`)) return;
    setBusy(d.id); setMsg("");
    const r = await fetch(`/api/decks/${d.id}`, { method: "DELETE" });
    setBusy(null);
    if (r.ok) router.refresh();
    else setMsg("Could not delete it.");
  }
  const pause = (d: DeckItem) => patch(d, d.type === "weekly" ? { status: "paused" } : { paused: true }, "pause it");
  const resume = (d: DeckItem) => patch(d, d.type === "weekly" ? { status: "active" } : { paused: false }, "resume it");

  return (
    <div className="dlist">
      <div className="seg sm dfilter" role="tablist" aria-label="Show">
        {FILTERS.filter((f) => f.key === "all" || count(f.key) > 0).map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? "on" : ""} onClick={() => setFilter(f.key)}>{f.label} <small>{count(f.key)}</small></button>
        ))}
      </div>
      {msg && <div className="errbox">{msg}</div>}
      <div className="tablewrap"><table className="dtable">
        <thead><tr><th>Deck</th><th>Brands</th><th>Repeats</th><th>Status</th><th>Latest version</th><th aria-label="Actions" /></tr></thead>
        <tbody>{shown.map((d) => (
          <tr key={`${d.type}:${d.id}`} className={`ds-${d.state}`}>
            <td className="dname"><Link href={d.href}><b>{d.name}</b></Link><small>{d.kind}</small></td>
            <td className="dbrands">{d.brands}</td>
            <td>{d.repeats}</td>
            <td><span className={`dstate ${d.state}`}>{d.status}</span><small className="ddetail">{d.detail}</small>{d.error && <small className="derr" title={d.error}>Last run failed: {d.error.slice(0, 70)}</small>}</td>
            <td>{d.latest ?? <span className="muted">none yet</span>}<small className="ddetail">{d.versions} version{d.versions === 1 ? "" : "s"} · updated {d.updated}</small></td>
            <td className="dacts">
              {until?.id === d.id ? (
                <span className="duntilrow">
                  <input type="date" value={until.value} min={today} onChange={(e) => setUntil({ id: d.id, value: e.target.value })} aria-label={`Last day for ${d.name}`} />
                  <button className="btn sm pri" disabled={busy === d.id} onClick={() => patch(d, { ends_on: until.value || null }, "set the date")}>Save</button>
                  <button className="btn sm ghost" onClick={() => setUntil(null)}>Cancel</button>
                </span>
              ) : (
                <>
                  {d.state === "monitoring" && <button className="btn sm ghost" disabled={busy === d.id} onClick={() => pause(d)}>Pause</button>}
                  {d.state === "paused" && <button className="btn sm ghost" disabled={busy === d.id} onClick={() => resume(d)}>Resume</button>}
                  {d.type === "deck" && (d.state === "monitoring" || d.state === "paused" || d.state === "ended") && (
                    <button className="btn sm ghost" disabled={busy === d.id} onClick={() => setUntil({ id: d.id, value: d.ends_on ?? "" })} title="The last day this deck covers; empty for until stopped">{d.state === "ended" ? "Restart" : "Until…"}</button>
                  )}
                  {d.type === "deck" && (d.state === "monitoring" || d.state === "paused") && <button className="btn sm ghost" disabled={busy === d.id} onClick={() => confirm(`Stop "${d.name}"? It makes no more versions; the ones it made stay.`) && patch(d, { stop: true }, "stop it")}>Stop</button>}
                  {d.type === "deck" && <button className="btn sm ghost danger" disabled={busy === d.id} onClick={() => remove(d)} aria-label={`Delete ${d.name}`}>{busy === d.id ? "…" : "Delete"}</button>}
                </>
              )}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      {!shown.length && <div className="empty">No {filter === "all" ? "" : `${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} `}decks.</div>}
    </div>
  );
}
