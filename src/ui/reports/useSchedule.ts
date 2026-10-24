"use client";
/** Run now, pause, resume and delete for a schedule, shared by the Reports list and a schedule's own page. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentRow, AgentRunRow } from "@/agents/store";

export type AgentWithRuns = AgentRow & { runs: AgentRunRow[] };
export type ScheduleAction = "run" | "pause" | "resume" | "delete";

export function useSchedule(say: (m: string) => void) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(a: AgentWithRuns, action: ScheduleAction, week?: string) {
    setBusy(a.id + action);
    let r: Response;
    if (action === "run") r = await fetch(`/api/agents/${a.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(week ? { week } : {}) });
    else if (action === "delete") r = await fetch(`/api/agents/${a.id}`, { method: "DELETE" });
    else r = await fetch(`/api/agents/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: action === "pause" ? "paused" : "active" }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (action === "run") {
      say(j.error ? j.error : j.message ? `${j.result_status === "ok" ? "Done" : j.result_status === "skipped" ? "Skipped" : "Failed"}: ${j.message}` : `Run finished: ${j.result_status ?? "ok"}`);
      if (j.report_id) router.push(`/reports/${j.report_id}`);
    } else {
      say(j.error ?? (action === "delete" ? "Schedule deleted" : `Schedule ${action}d`));
    }
    router.refresh();
    return r.ok;
  }

  return { busy, act };
}

export const when = (iso: string | null, tz: string) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");
