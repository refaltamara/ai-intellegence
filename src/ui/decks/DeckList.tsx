"use client";
/**
 * The team's decks as one list (Refal, 16 Oct 2026): a row per deck with what it is, the brands, how often it
 * repeats and its status (src/decks/status.ts), so people can tell what they monitor from what is done. A row
 * opens the deck on its latest version; its menu pauses, resumes, sets the last day, stops or deletes it. The
 * client's weekly report schedule sits in the same list (it opens the Weekly Reports viewer).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DeckState } from "@/decks/status";
import { cn } from "../cn";
import { ActionMenu, type ActionItem } from "../kit/ActionMenu";
import { Button } from "../kit/Button";
import { DateInput } from "../kit/DateInput";
import { ConfirmDialog } from "../kit/Modal";
import { Segmented } from "../kit/Segmented";
import { StatusPill, type PillTone } from "../kit/StatusPill";

export type DeckItem = {
  id: string;
  /** "deck" opens /decks/<id>; "weekly" is a weekly report schedule (an agent) and opens /weekly */
  type: "deck" | "weekly";
  href: string;
  name: string;
  kind: string;
  brands: string;
  repeats: string;
  state: DeckState;
  status: string;
  detail: string;
  ends_on: string | null;
  latest: string | null;
  versions: number;
  updated: string;
  error: string | null;
};

const FILTERS: { key: "all" | DeckState; label: string }[] = [
  { key: "all", label: "All" },
  { key: "monitoring", label: "Monitoring" },
  { key: "paused", label: "Paused" },
  { key: "ended", label: "Ended" },
  { key: "one-off", label: "One-off" },
];

const TONE: Record<DeckState, PillTone> = { monitoring: "live", paused: "waiting", "one-off": "neutral", ended: "neutral" };

const TH = "px-3 py-3 text-left text-sm font-semibold text-gray-900";
const TD = "px-3 py-3 align-top text-sm text-gray-700";
const SUB = "block text-xs text-gray-500";

type Ask = { kind: "stop" | "delete"; deck: DeckItem };

export function DeckList({ decks, today }: { decks: DeckItem[]; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<"all" | DeckState>("all");
  const [until, setUntil] = useState<{ id: string; value: string } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const count = (k: "all" | DeckState) => (k === "all" ? decks.length : decks.filter((d) => d.state === k).length);
  const shown = filter === "all" ? decks : decks.filter((d) => d.state === filter);

  async function patch(d: DeckItem, body: Record<string, unknown>, what: string) {
    setBusy(d.id); setMsg("");
    const url = d.type === "weekly" ? `/api/agents/${d.id}` : `/api/decks/${d.id}`;
    const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    if (!r.ok) { setMsg(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Could not ${what}.`); return; }
    setUntil(null);
    router.refresh();
  }
  async function remove(d: DeckItem) {
    setBusy(d.id); setMsg("");
    const r = await fetch(`/api/decks/${d.id}`, { method: "DELETE" });
    setBusy(null);
    if (r.ok) router.refresh();
    else setMsg("Could not delete it.");
  }
  const pause = (d: DeckItem) => patch(d, d.type === "weekly" ? { status: "paused" } : { paused: true }, "pause it");
  const resume = (d: DeckItem) => patch(d, d.type === "weekly" ? { status: "active" } : { paused: false }, "resume it");
  async function confirmAsk() {
    if (!ask) return;
    const { kind, deck } = ask;
    if (kind === "stop") await patch(deck, { stop: true }, "stop it");
    else await remove(deck);
    setAsk(null);
  }

  const menu = (d: DeckItem): ActionItem[] => {
    if (d.type !== "deck") return [];
    const live = d.state === "monitoring" || d.state === "paused";
    return [
      ...(live || d.state === "ended" ? [{ key: "until", label: d.state === "ended" ? "Restart" : "Until…", hint: "last day", onSelect: () => setUntil({ id: d.id, value: d.ends_on ?? "" }) }] : []),
      ...(live ? [{ key: "stop", label: "Stop", onSelect: () => setAsk({ kind: "stop", deck: d }) }] : []),
      { key: "delete", label: "Delete", danger: true, onSelect: () => setAsk({ kind: "delete", deck: d }) },
    ];
  };

  return (
    <div className="flex flex-col gap-3">
      <Segmented tabs label="Show" value={filter} onChange={setFilter} className="self-start"
        options={FILTERS.filter((f) => f.key === "all" || count(f.key) > 0).map((f) => ({ key: f.key, label: f.label, count: count(f.key) }))} />
      {msg && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</p>}
      <div className="overflow-x-auto rounded-2xl border border-card-border bg-white">
        <table className="w-full min-w-220 border-collapse">
          <thead className="border-0 border-b border-card-border bg-white">
            <tr><th className={TH}>Deck</th><th className={TH}>Brands</th><th className={TH}>Repeats</th><th className={TH}>Status</th><th className={TH}>Latest version</th><th className={TH}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>{shown.map((d) => (
            <tr key={`${d.type}:${d.id}`} className="border-b border-card-border transition-colors last:border-b-0 even:bg-gray-50/60 hover:bg-brand-palette-50">
              <td className={cn(TD, "max-w-80")}>
                <Link href={d.href} className="font-semibold text-gray-900 underline-offset-2 hover:text-brand-palette-700 hover:underline">{d.name}</Link>
                <small className={SUB}>{d.kind}</small>
              </td>
              <td className={cn(TD, "max-w-64")}><span className="line-clamp-2" title={d.brands}>{d.brands}</span></td>
              <td className={cn(TD, "whitespace-nowrap")}>{d.repeats}</td>
              <td className={cn(TD, "max-w-72")}>
                <StatusPill tone={TONE[d.state]}>{d.status}</StatusPill>
                <small className={cn(SUB, "mt-1")}>{d.detail}</small>
                {d.error && <small className="mt-1 block truncate text-xs text-red-700" title={d.error}>Last run failed: {d.error.slice(0, 70)}</small>}
              </td>
              <td className={TD}>
                {d.latest ?? <span className="text-gray-500">none yet</span>}
                <small className={SUB}>{d.versions} version{d.versions === 1 ? "" : "s"} · updated {d.updated}</small>
              </td>
              <td className={cn(TD, "w-0")}>
                {until?.id === d.id ? (
                  <span className="flex items-center gap-2">
                    <DateInput className="w-40" value={until.value} min={today} onChange={(v) => setUntil({ id: d.id, value: v })} ariaLabel={`Last day for ${d.name}`} />
                    <Button size="sm" isLoading={busy === d.id} onClick={() => patch(d, { ends_on: until.value || null }, "set the date")}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setUntil(null)}>Cancel</Button>
                  </span>
                ) : (
                  <span className="flex items-center justify-end gap-2">
                    {d.state === "monitoring" && <Button size="sm" variant="outline" isLoading={busy === d.id} onClick={() => pause(d)}>Pause</Button>}
                    {d.state === "paused" && <Button size="sm" variant="outline" isLoading={busy === d.id} onClick={() => resume(d)}>Resume</Button>}
                    {d.type === "deck" && <ActionMenu label={`More for ${d.name}`} items={menu(d)} />}
                  </span>
                )}
              </td>
            </tr>
          ))}
          {!shown.length && (
            <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">No {filter === "all" ? "" : `${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} `}decks.</td></tr>
          )}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!ask}
        title={ask?.kind === "stop" ? "Stop this deck?" : "Delete this deck?"}
        body={ask?.kind === "stop" ? `Stop "${ask.deck.name}"? It makes no more versions; the ones it made stay.` : ask ? `Delete the deck "${ask.deck.name}" and every version of it? This cannot be undone.` : null}
        confirmLabel={ask?.kind === "stop" ? "Stop it" : "Delete"}
        danger={ask?.kind === "delete"}
        busy={!!ask && busy === ask.deck.id}
        onConfirm={() => void confirmAsk()}
        onClose={() => setAsk(null)}
      />
    </div>
  );
}
