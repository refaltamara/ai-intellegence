"use client";
/**
 * "Describe your own slide…" (DECISIONS, 7 Oct 2026): at the end of a deck's slide list. The
 * person writes what the slide should show; CeMO drafts the analysis and tries it on the newest
 * week; they see the slide's numbers before keeping it. Kept, it is the team's own skill and
 * ticks into the deck like any other slide.
 */
import { useState } from "react";
import type { SlideDraft } from "@/decks/slideDraft";

export type AddedSlide = { key: string; title: string; description: string; badge: string; by?: string };

const n = (v: unknown) => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(1)) : String(v ?? "–"));

function Preview({ d }: { d: SlideDraft["preview"] }) {
  if (d.status !== "ok") return <p className="muted">{d.message}</p>;
  const cols = d.columns.slice(0, 5);
  const time = cols.find((c) => ["day", "week", "month"].includes(c.key));
  const m = cols.find((c) => c.format !== "text" && c.format !== "date" && c.format !== "pct") ?? cols.find((c) => c.format !== "text" && c.format !== "date");
  if (d.shape === "time" && time && m) {
    const by = new Map<string, number>();
    for (const r of d.rows) by.set(String(r[time.key]), (by.get(String(r[time.key])) ?? 0) + (Number(r[m.key]) || 0));
    const pts = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-20);
    const max = Math.max(1, ...pts.map((p) => p[1]));
    return (
      <div className="sdbars" role="img" aria-label={d.line ?? "slide preview"}>
        {pts.map(([t, v]) => <span key={t} title={`${t}: ${n(v)}`}><i style={{ height: `${Math.max(3, (v / max) * 100)}%` }} /><small>{t.slice(5)}</small></span>)}
      </div>
    );
  }
  return (
    <div className="tablewrap still mini">
      <table><thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>{d.rows.slice(0, 6).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.key}>{n(r[c.key])}</td>)}</tr>)}</tbody></table>
    </div>
  );
}

export function SlideDescriber({ onAdd, addLabel = "Add to this deck" }: { onAdd: (s: AddedSlide) => void | Promise<void>; addLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "save">("");
  const [draft, setDraft] = useState<SlideDraft | null>(null);
  const [err, setErr] = useState("");
  async function run() {
    setBusy("draft"); setErr(""); setDraft(null);
    const r = await fetch("/api/decks/slide-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { setErr(j.error ?? "CeMO could not draft it."); return; }
    setDraft(j as SlideDraft);
  }
  async function keep() {
    if (!draft) return;
    setBusy("save"); setErr("");
    const r = await fetch("/api/decks/slide-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ save: draft.recipe }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(""); setErr(j.error ?? "Could not keep it."); return; }
    await onAdd({ key: j.key, title: j.title, description: draft.recipe.description, badge: j.status === "approved" ? "Your team" : "Yours, not shared yet", by: j.by });
    setBusy(""); setDraft(null); setText(""); setOpen(false);
  }
  if (!open) return <button type="button" className="sdopen" onClick={() => setOpen(true)}>+ Describe your own slide…</button>;
  return (
    <div className="sdbox">
      <label className="wf"><span>What should the slide show?</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={400} placeholder="Comments that mention halal, per day, split by negative and the rest" />
      </label>
      <div className="wactions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="btn sm pri" disabled={!!busy || text.trim().length < 6} onClick={run}>{busy === "draft" ? "CeMO is drafting…" : draft ? "Draft again" : "Draft it"}</button>
        <button type="button" className="btn sm ghost" disabled={!!busy} onClick={() => { setOpen(false); setDraft(null); setErr(""); }}>Cancel</button>
        <small className="muted">Drafting costs 3 credits; the slide is counted again for every version.</small>
      </div>
      {err && <div className="errbox">{err}</div>}
      {draft && (
        <div className="sdpreview">
          <b>{draft.recipe.title}</b>
          <small className="muted">{draft.preview.line ?? draft.recipe.description} · tried on {draft.preview.window.from} to {draft.preview.window.to}</small>
          <Preview d={draft.preview} />
          <div className="wactions" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="btn sm pri" disabled={!!busy} onClick={keep}>{busy === "save" ? "Adding…" : addLabel}</button>
          </div>
        </div>
      )}
    </div>
  );
}
