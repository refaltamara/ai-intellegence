"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** POST to the onboarding API for one workspace; refresh on success; the error as a sentence. */
export function useOnboard(ws: string) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function call(action: string, body: Record<string, unknown> = {}, opts: { refresh?: boolean } = {}): Promise<Record<string, unknown> | null> {
    setBusy(action); setError("");
    const r = await fetch("/api/admin/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, workspace_id: ws, ...body }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { setError(j.error ?? `Failed (${r.status})`); return null; }
    if (opts.refresh !== false) router.refresh();
    return j;
  }
  /** run a job's slices one after another until it is done (the cron would, every five minutes) */
  async function runJob(jobId: string, onProgress: (p: { status: string; note?: string; error?: string | null }) => void): Promise<boolean> {
    for (let n = 0; n < 200; n++) {
      const r = await fetch("/api/admin/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", workspace_id: ws, job_id: jobId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { onProgress({ status: "failed", error: j.error ?? `HTTP ${r.status}` }); return false; }
      onProgress({ status: j.status, note: (j.progress?.note as string) ?? undefined, error: j.error });
      if (j.status === "done") { router.refresh(); return true; }
      if (j.status === "failed" || j.status === "cancelled") return false;
      if (j.busy) await new Promise((res) => setTimeout(res, 3000));
    }
    return false;
  }
  return { busy, error, setError, call, runJob };
}
