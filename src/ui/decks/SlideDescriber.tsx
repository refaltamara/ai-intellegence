"use client";
/**
 * "Describe your own slide…" (DECISIONS, 7 Oct 2026): at the end of a deck's slide list. The
 * person writes what the slide should show; CeMO drafts the analysis and tries it on the newest
 * week; they see the slide's numbers before keeping it. Kept, it is the team's own skill and
 * ticks into the deck like any other slide.
 */
import { useState } from "react";
import type { SlideDraft } from "@/decks/slideDraft";
import { cn } from "../cn";
import { Button } from "../kit/Button";
import { Field } from "../kit/Form";
import { IconPlus } from "../kit/icons";
import { COMPOSER, COMPOSER_INPUT } from "./formParts";

export type AddedSlide = { key: string; title: string; description: string; badge: string; by?: string };

const n = (v: unknown) => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(1)) : String(v ?? "–"));

function Preview({ d }: { d: SlideDraft["preview"] }) {
  if (d.status !== "ok") return <p className="text-sm text-gray-500">{d.message}</p>;
  const cols = d.columns.slice(0, 5);
  const time = cols.find((c) => ["day", "week", "month"].includes(c.key));
  const m = cols.find((c) => c.format !== "text" && c.format !== "date" && c.format !== "pct") ?? cols.find((c) => c.format !== "text" && c.format !== "date");
  if (d.shape === "time" && time && m) {
    const by = new Map<string, number>();
    for (const r of d.rows) by.set(String(r[time.key]), (by.get(String(r[time.key])) ?? 0) + (Number(r[m.key]) || 0));
    const pts = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-20);
    const max = Math.max(1, ...pts.map((p) => p[1]));
    return (
      <div className="flex h-32 items-end gap-1" role="img" aria-label={d.line ?? "slide preview"}>
        {pts.map(([t, v]) => (
          <span key={t} title={`${t}: ${n(v)}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            {/* the height is the value, so it stays an inline style */}
            <i className="block w-full rounded-t bg-brand-palette-600" style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />
            <small className="text-[10px] tabular-nums text-gray-500">{t.slice(5)}</small>
          </span>
        ))}
      </div>
    );
  }
  const num = (c: (typeof cols)[number]) => c.format !== "text" && c.format !== "date";
  return (
    <div className="overflow-x-auto rounded-xl border border-card-border">
      <table className="w-full border-collapse">
        <thead className="border-0 border-b border-card-border bg-white"><tr>{cols.map((c) => <th key={c.key} className={cn("px-3 py-2 text-sm font-semibold text-gray-900", num(c) ? "text-right" : "text-left")}>{c.label}</th>)}</tr></thead>
        <tbody>{d.rows.slice(0, 6).map((r, i) => <tr key={i} className="even:bg-gray-50/60">{cols.map((c) => <td key={c.key} className={cn("px-3 py-2 text-sm text-gray-700", num(c) && "text-right tabular-nums")}>{n(r[c.key])}</td>)}</tr>)}</tbody>
      </table>
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
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 font-sans text-sm font-semibold text-brand-palette-700 transition-colors hover:border-brand-palette-300 hover:bg-brand-palette-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600">
        <IconPlus size={16} />Describe your own slide…
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-card-border bg-gray-50 p-4">
      <Field label="What should the slide show?">
        <span className={COMPOSER}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={400} placeholder="Comments that mention halal, per day, split by negative and the rest" className={COMPOSER_INPUT} />
        </span>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" isLoading={busy === "draft"} loadingLabel="CeMO is drafting…" disabled={!!busy || text.trim().length < 6} onClick={run}>{draft ? "Draft again" : "Draft it"}</Button>
        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => { setOpen(false); setDraft(null); setErr(""); }}>Cancel</Button>
        <small className="text-xs text-gray-500">Drafting costs 3 credits; the slide is counted again for every version.</small>
      </div>
      {err && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
      {draft && (
        <div className="flex flex-col gap-3 rounded-2xl border border-card-border bg-white p-4">
          <div>
            <b className="block text-sm font-semibold text-gray-900">{draft.recipe.title}</b>
            <small className="text-xs text-gray-500">{draft.preview.line ?? draft.recipe.description} · tried on {draft.preview.window.from} to {draft.preview.window.to}</small>
          </div>
          <Preview d={draft.preview} />
          <div>
            <Button size="sm" isLoading={busy === "save"} loadingLabel="Adding…" disabled={!!busy} onClick={keep}>{addLabel}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
