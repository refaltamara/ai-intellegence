"use client";
/**
 * Building the Dashboard by asking (Refal, 16 Oct 2026), for Builders only: the Dashboard is locked for Members.
 * "What do you want to see here?" drafts a new panel; Change on a panel redrafts it with what it is now in front of
 * CeMO. Either way the draft runs over the Dashboard's own filters and is shown before it is added; adding is for
 * everyone on the team. The browser sends the words and the Dashboard's filters, never numbers.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PanelData, PanelScope } from "@/dashboard/panels";
import type { PanelSpec } from "@/dashboard/panelSpec";
import { PanelBody, PanelView } from "./PanelView";

type Draft = { spec: PanelSpec; preview: PanelData };

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch("/api/dashboard/panels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(j.error ?? "That did not work."));
  return j;
}

/** The ask box and its draft; `current` when changing a panel already on the Dashboard. */
function Asker({ scope, current, onDone, onCancel, placeholder }: { scope: PanelScope; current?: PanelSpec; onDone: () => void; onCancel?: () => void; placeholder: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  async function ask() {
    if (text.trim().length < 6 || busy) return;
    setBusy("draft"); setError(""); setDraft(null);
    try {
      setDraft((await post({ action: "draft", text, scope, ...(current ? { key: current.key } : {}) })) as unknown as Draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function save() {
    if (!draft) return;
    setBusy("save"); setError("");
    try {
      await post({ action: "save", spec: draft.spec });
      setDraft(null); setText("");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="pask">
      <form className="pulse-ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <b>{current ? "Change this panel" : "What do you want to see here?"}</b>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={placeholder} aria-label={current ? `Change ${current.title}` : "Describe a panel for the Dashboard"} />
        <button className="btn pri sm" disabled={text.trim().length < 6 || !!busy}>{busy === "draft" ? "Drafting…" : current ? "Redraft" : "Draft it"}</button>
        {onCancel && <button type="button" className="btn sm ghost" onClick={onCancel}>Cancel</button>}
      </form>
      {busy === "draft" && <p className="muted">CeMO is drafting the panel and trying it on the Dashboard&apos;s period…</p>}
      {error && <div className="errbox">{error}</div>}
      {draft && (
        <div className="pdraft">
          <div className="pdraft-head">
            <span><b>{draft.spec.title}</b> <small className="muted">· preview over {draft.preview.window.from} to {draft.preview.window.to}; only you see it until you add it</small></span>
            <span>
              <button className="btn pri sm" disabled={!!busy} onClick={save}>{busy === "save" ? "Adding…" : current ? "Replace the panel" : "Add to the Dashboard"}</button>
              <button className="btn sm ghost" disabled={!!busy} onClick={() => setDraft(null)}>Discard</button>
            </span>
          </div>
          <PanelBody d={draft.preview} />
          <p className="muted pnote">Everyone on the team sees it once added. Its numbers follow the Dashboard&apos;s period, platform and brands{draft.spec.query.filters && Object.keys(draft.spec.query.filters).length ? `, with its own: ${Object.keys(draft.spec.query.filters).join(", ").replace(/_/g, " ")}` : ""}.</p>
        </div>
      )}
    </div>
  );
}

/** At the top of the Dashboard, for a Builder: a new panel by asking. */
export function PanelAsk({ scope }: { scope: PanelScope }) {
  const router = useRouter();
  return <Asker scope={scope} onDone={() => router.refresh()} placeholder="e.g. TikTok affiliate posts and views, week on week · negative comments by platform · top 10 creators by views" />;
}

/** A panel on the Dashboard; a Builder may change it by asking or take it off. */
export function PanelCard({ d, title, builder, scope }: { d: PanelData; title: string; builder: boolean; scope?: PanelScope }) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (!confirm(`Take "${title}" off the Dashboard for everyone? A Builder can bring it back from the team's page.`)) return;
    try {
      await post({ action: "remove", key: d.spec.key });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PanelView d={d} title={title} builder={builder} onChange={builder && scope ? () => setChanging((x) => !x) : undefined} onRemove={builder ? remove : undefined} />
      {error && <div className="errbox">{error}</div>}
      {changing && scope && <Asker scope={scope} current={d.spec} onDone={() => { setChanging(false); router.refresh(); }} onCancel={() => setChanging(false)} placeholder="e.g. make it month on month · split by platform · only Instagram · as a table" />}
    </>
  );
}
