"use client";
/**
 * A deck, version by version (DECISIONS, 2 Oct 2026): the same slide viewer as Weekly Reports (the
 * actual slides, Ask AI on each, PDF and PowerPoint, Present), with the deck's own actions: make a version
 * for another period, make the next one on its own every week or month, edit, delete.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PeriodPick } from "./PeriodPick";
import type { WeeklyItem } from "@/reports/weekly";
import { WeeklyViewer } from "../weekly/WeeklyViewer";
import { cn } from "../cn";
import { ActionMenu } from "../kit/ActionMenu";
import { Button, buttonClass } from "../kit/Button";
import { IconChevronDown } from "../kit/icons";
import { ConfirmDialog, PromptDialog } from "../kit/Modal";
import { Spinner } from "../kit/Spinner";
import { SwitchKnob } from "../kit/Switch";
import { Toast, useToast } from "../kit/Toast";

type Props = {
  deck: { id: string; name: string; grain: "day" | "week" | "month"; recurring: boolean; last_error: string | null; source: string; next_run_at: string | null };
  items: WeeklyItem[];
  initialId: string;
  initialSlide: number;
  periods: { key: string; label: string }[];
  /** chosen days (PR decks): the last day the data reaches */
  range?: { asOf: string; first?: string } | null;
  day?: boolean;
};

type Dialog = "template" | "version" | "deck" | null;

export function DeckViewer({ deck, items, initialId, initialSlide, periods, range, day }: Props) {
  const router = useRouter();
  const [recurring, setRecurring] = useState(deck.recurring);
  const [menu, setMenu] = useState(false);
  const [period, setPeriod] = useState(periods[0]?.key ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(deck.last_error ?? "");
  const [onScreen, setOnScreen] = useState(initialId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [working, setWorking] = useState(false);
  const toast = useToast();
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    box.current?.querySelector<HTMLElement>("[role=dialog] select, [role=dialog] button")?.focus();
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); opener.current?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menu]);
  const pick = useCallback((id: string) => setOnScreen(id), []);
  const unit = deck.grain;

  async function toggleRecurring() {
    const next = !recurring;
    setRecurring(next);
    const r = await fetch(`/api/decks/${deck.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recurring: next }) });
    if (!r.ok) setRecurring(!next);
    router.refresh();
  }

  async function makeVersion() {
    const label = periods.find((p) => p.key === period)?.label ?? period.replace("..", " to ");
    setMenu(false);
    setBusy(`Making the ${label} version: the numbers, the words, the slides… (about a minute)`);
    setError("");
    const r = await fetch(`/api/decks/${deck.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
    const o = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok || !o.report_id) { setError(o.message ?? "The version could not be made"); return; }
    router.push(`/decks/${deck.id}?v=${o.report_id}`);
    router.refresh();
  }

  /** "Save as template": this deck's slides and grain, for the team (a Member's waits for the Builder) */
  async function saveTemplate(name: string) {
    setWorking(true);
    const r = await fetch("/api/builder/creations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "make", from_deck: deck.id, input: { name }, live: true }) });
    const o = await r.json().catch(() => ({}));
    if (!r.ok) { setWorking(false); setDialog(null); setError(o.error ?? "The template could not be saved"); return; }
    const c = o.creation as { id: string; status: string };
    if (c.status === "draft") {
      // a Member's template goes to the Builder
      await fetch("/api/builder/creations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", id: c.id }) });
      setBusy(null); setError("");
      toast.show("Saved. It works for you now and goes to your Builder to add for everyone.");
    } else toast.show("Saved for everyone on the team: it is under Decks → New deck.");
    setWorking(false);
    setDialog(null);
  }

  async function removeVersion() {
    const item = items.find((i) => i.id === onScreen);
    if (!item) return;
    setWorking(true);
    const r = await fetch(`/api/reports/${item.id}`, { method: "DELETE" });
    setWorking(false);
    setDialog(null);
    if (r.ok) { router.push(`/decks/${deck.id}`); router.refresh(); }
    else setError("Could not delete the version.");
  }

  async function removeDeck() {
    setWorking(true);
    const r = await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
    setWorking(false);
    setDialog(null);
    if (r.ok) { router.push("/decks"); router.refresh(); }
    else setError("Could not delete the deck.");
  }

  const version = items.find((i) => i.id === onScreen);
  const actions = (
    <>
      <button type="button" role="switch" aria-checked={recurring} onClick={toggleRecurring}
        title={recurring ? `A new version is made when a new ${unit} of data lands. Click to stop.` : `Make the next version every ${unit}, when the data lands`}
        className={cn(buttonClass("outline", "sm"), "gap-2.5", recurring && "border-brand-palette-300 bg-brand-palette-50 text-brand-palette-700")}>
        <SwitchKnob on={recurring} />Every {unit}
      </button>
      <div className="relative" ref={box}>
        <button ref={opener} type="button" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu((m) => !m)} disabled={!!busy}
          className={cn(buttonClass("outline", "sm"), menu && "border-brand-palette-300 bg-brand-palette-50 text-brand-palette-700")}>
          New version<IconChevronDown size={16} className={cn("transition-transform duration-200", menu && "rotate-180")} />
        </button>
        {menu && (
          <div role="dialog" aria-label="Make a new version" className="absolute right-0 top-full z-40 mt-2 flex w-max max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 font-sans shadow-xl">
            <span className="text-xs font-semibold text-gray-700">For</span>
            <PeriodPick periods={periods} value={period} onChange={setPeriod} range={range} day={day} replaced={(k) => items.some((i) => i.iso === k)} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setMenu(false); opener.current?.focus(); }}>Cancel</Button>
              <Button size="sm" onClick={makeVersion} disabled={!period}>Make it</Button>
            </div>
          </div>
        )}
      </div>
      <Link className={buttonClass("outline", "sm")} href={`/decks/${deck.id}/edit`} title="Choose the slides, brands, platforms and findings">Edit slides</Link>
      <ActionMenu label="More for this deck" items={[
        { key: "template", label: "Save as template", onSelect: () => setDialog("template") },
        ...(items.length > 1 ? [{ key: "version", label: "Delete this version", onSelect: () => setDialog("version") }] : []),
        { key: "deck", label: "Delete the deck", danger: true, onSelect: () => setDialog("deck") },
      ]} />
    </>
  );

  const banner = busy
    ? <p aria-live="polite" className="flex items-center gap-2 rounded-2xl bg-brand-palette-50 px-4 py-3 text-sm text-brand-palette-800"><Spinner />{busy}</p>
    : error ? <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">Last run: {error}</p> : null;

  return (
    <>
      <WeeklyViewer
        key={initialId}
        items={items}
        initialId={initialId}
        initialSlide={initialSlide}
        title={deck.name}
        subtitle={`${unit === "month" ? "Month on month" : unit === "day" ? "Day on day" : "Week on week"} · ${items.length} version${items.length === 1 ? "" : "s"}${recurring ? ` · a new one every ${unit}` : ""} · Ask AI and comments on every slide`}
        path={`/decks/${deck.id}`}
        param="v"
        actions={actions}
        onPick={pick}
        comments={{ deckId: deck.id }}
        banner={banner}
      />
      <PromptDialog open={dialog === "template"} title="Save as template" label="Name the template (it shows under Decks → New deck)" initial={deck.name} busy={working}
        onSubmit={(name) => void saveTemplate(name)} onClose={() => setDialog(null)} />
      <ConfirmDialog open={dialog === "version"} title="Delete this version?" body={`Delete the ${version?.label ?? ""} version of this deck?`} confirmLabel="Delete" danger busy={working}
        onConfirm={() => void removeVersion()} onClose={() => setDialog(null)} />
      <ConfirmDialog open={dialog === "deck"} title="Delete the deck?" body={`Delete the deck "${deck.name}" and every version of it? This cannot be undone.`} confirmLabel="Delete" danger busy={working}
        onConfirm={() => void removeDeck()} onClose={() => setDialog(null)} />
      <Toast text={toast.text} />
    </>
  );
}
