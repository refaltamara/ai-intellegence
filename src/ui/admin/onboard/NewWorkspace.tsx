"use client";
/** The new-workspace wizard (CMS plan, "1. Create"): basics, the teams it offers, caption reading. The client brand is picked once the dump's brands are mapped. */
import { useRouter } from "next/navigation";
import { useState } from "react";

const ROLES = [
  { id: "pr", label: "PR team · Chorus" },
  { id: "brand_kol", label: "Brand & KOL team · Atlas" },
  { id: "social", label: "Social Media team · Spark" },
];
const CATEGORIES = ["fintech", "beauty", "telco", "fmcg", "banking", "other"];

export function NewWorkspace() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [touched, setTouched] = useState(false);
  const [category, setCategory] = useState("fintech");
  const [label, setLabel] = useState("");
  const [roles, setRoles] = useState(["pr", "brand_kol", "social"]);
  const [captions, setCaptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  async function create() {
    setBusy(true); setError("");
    const r = await fetch("/api/admin/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", id: id || slug(name), name, category, label: label || `${category.charAt(0).toUpperCase() + category.slice(1)} · Indonesia`, roles, captions }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error ?? "Could not create it."); return; }
    router.push(`/admin/workspaces/${j.id}?tab=source`);
  }
  return (
    <div className="onb">
      <section className="dcard">
        <h3>1 · Basics</h3>
        <div className="grid2">
          <label className="wf"><span>Name</span><input value={name} onChange={(e) => { setName(e.target.value); if (!touched) setId(slug(e.target.value)); }} placeholder="Bank Jago listening" /></label>
          <label className="wf"><span>Id (fixed once live)</span><input value={id} onChange={(e) => { setTouched(true); setId(slug(e.target.value)); }} placeholder="bank-jago" /></label>
          <label className="wf"><span>Category</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="wf"><span>Label people see</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${category.charAt(0).toUpperCase() + category.slice(1)} · Indonesia`} /></label>
        </div>
        <p className="muted">A listening panel: brands compete, owned and earned on every platform, comments labelled by Fair Listening. Time zone Asia/Jakarta.</p>
      </section>
      <section className="dcard">
        <h3>2 · Teams</h3>
        <div className="ticks">{ROLES.map((r) => <label key={r.id} className="tick"><input type="checkbox" checked={roles.includes(r.id)} onChange={() => setRoles((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))} /> {r.label}</label>)}</div>
        <p className="muted">Each starts on Fair&apos;s latest release and follows it.</p>
      </section>
      <section className="dcard">
        <h3>3 · Modules</h3>
        <label className="tick"><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Caption reading (product, event, offer, hook, angle; posts with 10K+ views and brand accounts)</label>
        <p className="muted">Core listening is always on. The beauty product lexicon applies in beauty workspaces only.</p>
      </section>
      <section className="dcard">
        <h3>4 · Source</h3>
        <p className="muted">Next you upload the Fair Listening dump (one CSV per table) and map its accounts to brands. The workspace stays a draft, unseen by clients, until Refal or Rafli switch it live after the load report.</p>
      </section>
      {error && <div className="errbox">{error}</div>}
      <div className="wactions"><button className="btn pri" disabled={busy || !name.trim() || !roles.length} onClick={create}>{busy ? "Creating…" : "Create the draft"}</button></div>
    </div>
  );
}
