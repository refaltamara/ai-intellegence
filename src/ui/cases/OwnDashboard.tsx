"use client";
/**
 * "Open its own dashboard" on a case copied from a case workspace (Refal, 22 Oct 2026: "include this in beauty cases
 * list, but this specific dashboard have their own"). It switches to the source workspace's team, as the sidebar's
 * team switcher does, and opens its Dashboard. Shown only to someone who can reach that team.
 */
import { useState } from "react";
import { Button } from "../kit/Button";

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
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" isLoading={busy} loadingLabel="Opening…" onClick={open} title={`Switch to ${name} and open its Dashboard`}>Open its own dashboard</Button>
      {error && <small role="alert" className="text-xs text-red-700">{error}</small>}
    </span>
  );
}
