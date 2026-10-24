"use client";
/** Caption reading on the Data page: how far it got, and the owner's switch (DECISIONS, 2 Oct 2026). */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtNum } from "./format";
import { DateInput } from "./kit/DateInput";
import { Field } from "./kit/Form";
import { Panel } from "./kit/Section";
import { StatusPill } from "./kit/StatusPill";
import { Switch } from "./kit/Switch";

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function CaptionReading({ status, canEdit }: { status: { enabled: boolean; min_views: number; since: string | null; read: number; remaining: number; failed: number }; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save(body: { enabled?: boolean; since?: string | null }) {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/workspace/captions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? "Could not change it"); return; }
    router.refresh();
  }
  return (
    <Panel title={<span className="flex items-center gap-2">Caption reading <StatusPill tone={status.enabled ? "ok" : "neutral"}>{status.enabled ? "On" : "Off"}</StatusPill></span>}>
      <p className="text-sm leading-relaxed text-gray-600">
        The model reads each caption for the product, the campaign or event, the offer, the hook and the angle, so decks can show campaigns, launches and the angles that drew views. It names; every number is still counted in SQL.
        {" "}{fmtNum(status.read)} read, {fmtNum(status.remaining)} to go (posts with {fmtNum(status.min_views)}+ views, and brand accounts{status.since ? `, posted from ${day(status.since)}` : ""}){status.remaining && status.enabled ? "; the rest are read in the background, about 1,000 every ten minutes" : ""}.
      </p>
      {canEdit && (
        <div className="flex flex-col gap-2 border-0 border-t border-card-border pt-3">
          <Switch on={status.enabled} disabled={busy} onChange={(on) => save({ enabled: on })} label="Read captions" />
          <Field group label="Read from" hint="empty for all">
            <DateInput size="sm" className="w-44" ariaLabel="Read captions from" value={status.since ?? ""} disabled={busy} onChange={(v) => save({ since: v || null })} />
          </Field>
        </div>
      )}
      {msg && <p role="alert" className="text-xs text-red-700">{msg}</p>}
      <p className="mt-auto text-xs text-gray-500">Powers the Campaigns and launches and Products and angles slides</p>
    </Panel>
  );
}
