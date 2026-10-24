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
import { AskBar } from "./AskBar";
import { Button } from "../kit/Button";
import { ConfirmDialog } from "../kit/Modal";
import { ErrorBox } from "../kit/Section";
import { Spinner } from "../kit/Spinner";

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
    <div className="flex flex-col gap-3">
      <AskBar label={current ? "Change this panel" : "What do you want to see here?"} value={text} onChange={setText} onSubmit={ask} maxLength={500}
        placeholder={placeholder} ariaLabel={current ? `Change ${current.title}` : "Describe a panel for the Dashboard"}
        submitLabel={current ? "Redraft" : "Draft it"} busyLabel="Drafting…" busy={busy === "draft"} disabled={text.trim().length < 6 || !!busy}
        extra={onCancel && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>} />
      {busy === "draft" && <p aria-live="polite" className="flex items-center gap-2 text-sm text-gray-600"><Spinner />CeMO is drafting the panel and trying it on the Dashboard&apos;s period…</p>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {draft && (
        <div className="flex flex-col gap-4 rounded-3xl border border-brand-palette-200 bg-white p-5 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold leading-tight text-gray-900">{draft.spec.title}</h3>
              <p className="text-xs text-gray-500">Preview over {draft.preview.window.from} to {draft.preview.window.to}; only you see it until you add it</p>
            </div>
            <span className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setDraft(null)}>Discard</Button>
              <Button size="sm" isLoading={busy === "save"} loadingLabel="Adding…" disabled={!!busy} onClick={save}>{current ? "Replace the panel" : "Add to the Dashboard"}</Button>
            </span>
          </div>
          <PanelBody d={draft.preview} />
          <p className="text-xs text-gray-500">Everyone on the team sees it once added. Its numbers follow the Dashboard&apos;s period, platform and brands{draft.spec.query.filters && Object.keys(draft.spec.query.filters).length ? `, with its own: ${Object.keys(draft.spec.query.filters).join(", ").replace(/_/g, " ")}` : ""}.</p>
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
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);
  async function remove() {
    setRemoving(true);
    try {
      await post({ action: "remove", key: d.spec.key });
      setAsking(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setAsking(false);
    } finally {
      setRemoving(false);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PanelView d={d} title={title} builder={builder} changing={changing} onChange={builder && scope ? () => setChanging((x) => !x) : undefined} onRemove={builder ? () => setAsking(true) : undefined} />
      {error && <ErrorBox>{error}</ErrorBox>}
      {changing && scope && <Asker scope={scope} current={d.spec} onDone={() => { setChanging(false); router.refresh(); }} onCancel={() => setChanging(false)} placeholder="e.g. make it month on month · split by platform · only Instagram · as a table" />}
      <ConfirmDialog open={asking} title={`Take "${title}" off the Dashboard?`} body="It goes for everyone on the team. A Builder can bring it back from the team's page."
        confirmLabel="Remove the panel" danger busy={removing} onConfirm={remove} onClose={() => setAsking(false)} />
    </div>
  );
}
