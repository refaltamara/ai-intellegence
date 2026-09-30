"use client";
/** Start a Pulse: a name, a point of view (template), and optionally the brands and platform every card starts on. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MultiSelect } from "../MultiSelect";

type T = { key: string; name: string; description: string; kinds: string[] };

export function NewPulse({ templates, brands, panel, first }: { templates: T[]; brands: { id: string; name: string }[]; panel: boolean; first: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(first);
  const [template, setTemplate] = useState(templates[0]?.key ?? "blank");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [platform, setPlatform] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = templates.find((x) => x.key === template);
  async function create() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/pulses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || t?.name, template, brands: picked, platform }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || !j.pulse) { setError(j.error ?? "Could not create it"); return; }
    router.push(`/pulse/${j.pulse.id}`);
  }
  if (!open) return <button className="btn pri sm" onClick={() => setOpen(true)}>+ New Pulse</button>;
  return (
    <div className="dcard newpulse">
      <h3>New Pulse</h3>
      <div className="tpls">
        {templates.map((x) => (
          <button key={x.key} type="button" className={template === x.key ? "on" : ""} onClick={() => setTemplate(x.key)}>
            <b>{x.name}</b><span>{x.description}</span>
            {x.kinds.length > 0 && <small>{x.kinds.length} cards: {[...new Set(x.kinds)].join(", ")}</small>}
          </button>
        ))}
      </div>
      <div className="cgrid">
        <label className="wf"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={t?.name ?? "My Pulse"} maxLength={80} /></label>
        {panel && template !== "blank" && (
          <>
            <label className="wf"><span>Platform</span><select value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="all">TikTok + Instagram</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option></select></label>
            <div className="wf wide"><span>Brands <small>(every card starts on these; empty = all brands)</small></span><MultiSelect options={brands} value={picked} onChange={setPicked} placeholder="All brands" /></div>
          </>
        )}
      </div>
      {!panel && <p className="muted" style={{ fontSize: 12.5 }}>This team has no brand panel, so a Pulse here holds answers pinned from Chats.</p>}
      {error && <div className="errbox">{error}</div>}
      <div className="wactions">
        {!first && <button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>}
        <button className="btn pri sm" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create Pulse"}</button>
      </div>
    </div>
  );
}
