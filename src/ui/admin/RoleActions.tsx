"use client";
/** Release a draft (Refal, Rafli) or roll the current release back (role owners), with an optional note. */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RoleActions({ role, version, action, label, confirmText }: { role: string; version?: string; action: "release" | "rollback"; label: string; confirmText: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    const note = prompt(`${confirmText}\n\nA note for the history (optional):`);
    if (note === null) return;
    setBusy(true); setError("");
    const r = await fetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, role, version, note }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setError(j.error ?? "Failed");
    else router.refresh();
  }
  return (
    <span className="roleact">
      <button className={`btn sm ${action === "release" ? "pri" : "danger"}`} onClick={go} disabled={busy}>{busy ? "…" : label}</button>
      {error && <small className="err">{error}</small>}
    </span>
  );
}
