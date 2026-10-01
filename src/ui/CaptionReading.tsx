"use client";
/** Caption reading on the Data page: how far it got, and the owner's switch (DECISIONS, 2 Oct 2026). */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtNum } from "./format";

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
    <div className="layer">
      <h4>Caption reading {status.enabled ? <span className="pill live" style={{ marginLeft: 6 }}>on</span> : <span className="pill" style={{ marginLeft: 6 }}>off</span>}</h4>
      <p>
        The model reads each caption for the product, the campaign or event, the offer, the hook and the angle, so decks can show campaigns, launches and the angles that drew views. It names; every number is still counted in SQL.
        {" "}{fmtNum(status.read)} read, {fmtNum(status.remaining)} to go (posts with {fmtNum(status.min_views)}+ views, and brand accounts{status.since ? `, posted from ${day(status.since)}` : ""}){status.remaining && status.enabled ? "; the rest are read in the background, about 1,000 every ten minutes" : ""}.
      </p>
      <small>
        Powers the Campaigns and launches and Products and angles slides
        {canEdit && <> · <button className="linkbtn" style={{ border: 0, background: "none", padding: 0, cursor: "pointer", font: "inherit" }} disabled={busy} onClick={() => save({ enabled: !status.enabled })}>{status.enabled ? "Switch off" : "Switch on"}</button></>}
        {canEdit && <> · read from <input type="date" defaultValue={status.since ?? ""} disabled={busy} onChange={(e) => save({ since: e.target.value || null })} style={{ font: "inherit", fontSize: 12, border: "1px solid var(--line)", borderRadius: 6, padding: "1px 4px" }} /> <span style={{ color: "var(--text-3)" }}>(empty = all)</span></>}
        {msg && <> · {msg}</>}
      </small>
    </div>
  );
}
