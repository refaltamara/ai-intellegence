"use client";
/** The team's decks: each opens on its latest version and can be deleted from the list. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type DeckItem = { id: string; name: string; kind: string; meta: string; latest: string | null; recurring: string | null; error: string | null };

export function DeckList({ decks }: { decks: DeckItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function remove(d: DeckItem) {
    if (!confirm(`Delete the deck "${d.name}" and every version of it? This cannot be undone.`)) return;
    setBusy(d.id);
    const r = await fetch(`/api/decks/${d.id}`, { method: "DELETE" });
    setBusy(null);
    if (r.ok) router.refresh();
  }
  return (
    <div className="plist">
      {decks.map((d) => (
        <div key={d.id} className="pitem deckitem">
          <Link href={`/decks/${d.id}`} className="pmain">
            <span className="dkind">{d.kind}</span>
            <b>{d.name}</b>
            <span>{d.latest ? `Latest: ${d.latest}` : "No version yet"}</span>
            <small>{d.meta}</small>
            {d.recurring && <small className="drec">{d.recurring}</small>}
            {d.error && <small className="derr" title={d.error}>Last run failed: {d.error.slice(0, 80)}</small>}
          </Link>
          <button className="pdel" disabled={busy === d.id} onClick={() => remove(d)} title="Delete this deck" aria-label={`Delete ${d.name}`}>{busy === d.id ? "Deleting…" : "Delete"}</button>
        </div>
      ))}
    </div>
  );
}
