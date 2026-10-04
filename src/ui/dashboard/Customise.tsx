"use client";
/**
 * "Customise" on a Dashboard (CMS plan, The Builder): a Builder hides, renames and moves
 * sections for everyone on the team; anyone may put the sections in their own order. The
 * server keeps only what each layer may set (src/roles/policy.ts).
 */
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useState } from "react";
import type { SectionDef } from "@/dashboard/sections";

type Item = SectionDef & { title: string; hidden: boolean };

export function Customise({ sections, builder, codename, client }: { sections: Item[]; builder: boolean; codename: string; client: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(sections);
  const [scope, setScope] = useState<"team" | "me">(builder ? "team" : "me");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const move = (i: number, by: number) => setItems((xs) => { const j = i + by; if (j < 0 || j >= xs.length) return xs; const out = [...xs]; [out[i], out[j]] = [out[j], out[i]]; return out; });
  const set = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  async function save() {
    setBusy(true); setMsg("");
    const order = items.map((x) => x.key);
    const body = scope === "team"
      ? { action: "apply", note: "Customised the Dashboard", changes: { "tiles.order": order, "tiles.hidden": items.filter((x) => x.hidden).map((x) => x.key), "tiles.names": Object.fromEntries(items.filter((x) => x.title.trim() && x.title.trim() !== x.label).map((x) => [x.key, x.title.trim()])) } }
      : { action: "personal", settings: { "tiles.order": order } };
    // an empty renaming goes back to Fair's names
    if (scope === "team" && !Object.keys((body.changes as Record<string, unknown>)["tiles.names"] as object).length) (body.changes as Record<string, unknown>)["tiles.names"] = null;
    const r = await fetch("/api/builder/company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok && !/Nothing would change/.test(j.error ?? "")) { setMsg(j.error ?? "That did not work."); return; }
    setOpen(false);
    router.refresh();
  }
  if (!open) return <button className="btn sm ghost" onClick={() => setOpen(true)}>Customise</button>;
  return createPortal(
    <div className="drawer" role="dialog" aria-label="Customise the Dashboard">
      <div className="drawer-in">
        <header><h3>Customise the Dashboard</h3><button className="x" onClick={() => setOpen(false)} aria-label="Close">×</button></header>
        {builder && (
          <div className="seg sm scope">
            <button className={scope === "team" ? "on" : ""} onClick={() => setScope("team")}>For everyone on {client ? `${client}'s ` : ""}{codename}</button>
            <button className={scope === "me" ? "on" : ""} onClick={() => setScope("me")}>Just for me</button>
          </div>
        )}
        <p className="muted">{scope === "team" ? "Hide, rename and move sections for the whole team. The status and the headline numbers stay on top." : "Put the sections in the order you read them. Only you see this order."}</p>
        <ol className="custlist">
          {items.map((x, i) => (
            <li key={x.key} className={x.hidden ? "off" : ""}>
              <span className="mv"><button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button><button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down">↓</button></span>
              {scope === "team" ? <input value={x.title} onChange={(e) => set(i, { title: e.target.value.slice(0, 40) })} aria-label={`Title of ${x.label}`} /> : <b>{x.title}</b>}
              {scope === "team" && x.title.trim() !== x.label && <small className="muted">Fair: {x.label}</small>}
              {scope === "team" && <label className="tick"><input type="checkbox" checked={!x.hidden} onChange={(e) => set(i, { hidden: !e.target.checked })} /> Shown</label>}
            </li>
          ))}
        </ol>
        <footer>
          {msg && <span className="err">{msg}</span>}
          <button className="btn sm ghost" onClick={() => setItems(sections)}>Reset</button>
          <button className="btn pri sm" disabled={busy || (scope === "team" && items.filter((x) => !x.hidden).length < 2)} onClick={save}>{scope === "team" ? "Apply for everyone" : "Save my order"}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
