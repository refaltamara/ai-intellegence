"use client";
/** The team's Pulses, each openable and deletable from the list. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type PulseItem = { id: string; name: string; description: string | null; meta: string };

export function PulseList({ pulses }: { pulses: PulseItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function remove(p: PulseItem) {
    if (!confirm(`Delete the Pulse "${p.name}" and its cards? This cannot be undone.`)) return;
    setBusy(p.id);
    const r = await fetch(`/api/pulses/${p.id}`, { method: "DELETE" });
    setBusy(null);
    if (r.ok) router.refresh();
  }
  return (
    <div className="plist">
      {pulses.map((p) => (
        <div key={p.id} className="pitem">
          <Link href={`/pulse/${p.id}`} className="pmain">
            <b>{p.name}</b>
            <span>{p.description ?? ""}</span>
            <small>{p.meta}</small>
          </Link>
          <button className="pdel" disabled={busy === p.id} onClick={() => remove(p)} title="Delete this Pulse" aria-label={`Delete ${p.name}`}>{busy === p.id ? "Deleting…" : "Delete"}</button>
        </div>
      ))}
    </div>
  );
}
