"use client";
/**
 * "Open its own dashboard" on a case copied from a case workspace (Refal, 22 Oct 2026: "include this in beauty cases
 * list, but this specific dashboard have their own"). It switches to the source workspace's team, as the sidebar's
 * team switcher does, and opens its Dashboard. Shown only to someone who can reach that team.
 */
import { useState } from "react";

export function OwnDashboard({ workspace, role, name }: { workspace: string; role: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    setBusy(true); setError("");
    const r = await fetch("/api/workspace/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: workspace, role }) });
    if (!r.ok) { setBusy(false); setError("That dashboard is not open to this account."); return; }
    window.location.href = "/dashboard";
  }
  return (
    <span className="owndash">
      <button className="btn sm" disabled={busy} onClick={open} title={`Switch to ${name} and open its Dashboard`}>{busy ? "Opening…" : "Open its own dashboard"}</button>
      {error && <small className="down">{error}</small>}
    </span>
  );
}
