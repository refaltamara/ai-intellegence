"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** POST to /api/admin/roles and refresh; the error, if any, as a sentence */
export function useAdminCall() {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function call(key: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(key); setError("");
    const r = await fetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { setError(j.error ?? `Failed (${r.status})`); return null; }
    router.refresh();
    return j;
  }
  return { busy, error, call, setError };
}
