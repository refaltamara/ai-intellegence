"use client";
/** Which brand CeMO is on the side of. Owner sets it; everyone sees it. */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClientBrand({ brands, current, canEdit }: { brands: { id: string; name: string }[]; current: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const currentName = brands.find((b) => b.id === current)?.name ?? null;

  async function save() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_brand_id: value || null }) });
    const j = await r.json();
    setBusy(false);
    if (j.error) { setMsg(j.error); return; }
    setMsg(j.client_name ? `CeMO is now on the side of ${j.client_name}.` : "No client brand: every brand is a competitor.");
    router.refresh();
  }

  return (
    <div className="client">
      <div>
        <h4>Client brand</h4>
        <p>{currentName ? <>CeMO is on the side of <b>{currentName}</b>. Other brands are competitors; new creator searches exclude anyone who posted for a competitor by default.</> : <>No client brand set. Every tracked brand is a competitor and there is no "our brand" yet. Set one to make CeMO take a side.</>}</p>
      </div>
      {canEdit ? (
        <div className="pick">
          <select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">None — no client</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="btn pri sm" onClick={save} disabled={busy || (value || null) === (current ?? null)}>{busy ? "Saving…" : "Save"}</button>
          {msg && <span className="hint">{msg}</span>}
        </div>
      ) : (
        <span className="hint">The owner can change this on this page.</span>
      )}
    </div>
  );
}
