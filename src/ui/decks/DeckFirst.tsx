"use client";
/** A deck without a version yet (its first run failed, or it came from Chats): make one. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClass } from "../kit/Button";
import { PeriodPick } from "./PeriodPick";

export function DeckFirst({ deckId, error, periods, range, day }: { deckId: string; error: string | null; periods: { key: string; label: string }[]; range?: { asOf: string; first?: string } | null; day?: boolean }) {
  const router = useRouter();
  const [period, setPeriod] = useState(periods[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(error ?? "");
  async function make() {
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/decks/${deckId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
    const o = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || !o.report_id) { setErr(o.message ?? "The version could not be made"); return; }
    router.push(`/decks/${deckId}?v=${o.report_id}`);
    router.refresh();
  }
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-card-border bg-white p-5 md:p-6">
      <h2 className="text-lg font-semibold leading-tight text-gray-900">Make the first version</h2>
      {err && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">Last run: {err}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPick periods={periods} value={period} onChange={setPeriod} range={range} day={day} />
        <Button size="sm" isLoading={busy} loadingLabel="Making it… (about a minute)" disabled={!period} onClick={make}>Make it</Button>
        <a className={buttonClass("outline", "sm")} href={`/decks/${deckId}/edit`}>Edit the deck</a>
      </div>
    </section>
  );
}
