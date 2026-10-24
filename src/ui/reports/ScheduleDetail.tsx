"use client";
/** One schedule on its own page: run it (for any past week, on the weekly deck), pause it, edit the weekly deck's settings, and every run. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentRunRow } from "@/agents/store";
import type { ClientContract as WeeklyContract } from "@/competitor/contract";
import { cn } from "../cn";
import { CARD, SectionTitle } from "../decks/formParts";
import { fmtDate } from "../format";
import { ActionMenu } from "../kit/ActionMenu";
import { Button } from "../kit/Button";
import { ConfirmDialog } from "../kit/Modal";
import { PageHeader } from "../kit/PageHeader";
import { SelectInput } from "../kit/SelectInput";
import { StatusPill } from "../kit/StatusPill";
import { LINK } from "./docParts";
import type { SetupOptions } from "./NewSchedule";
import { useSchedule, type AgentWithRuns } from "./useSchedule";
import { WeeklyForm } from "./WeeklyForm";

type WeeklyParams = { contract?: WeeklyContract; formats?: string[]; last_week?: string };

const TH = "px-3 py-2.5 text-left text-sm font-semibold text-gray-900";
const TD = "px-3 py-2.5 text-sm text-gray-700";

export function ScheduleDetail({ a, setup, say }: { a: AgentWithRuns | null; setup: SetupOptions; say: (m: string) => void }) {
  const router = useRouter();
  const { busy, act } = useSchedule(say);
  const [week, setWeek] = useState("");
  const [ask, setAsk] = useState(false);
  const back = <Link className={LINK} href="/reports">Reports</Link>;

  if (!a) {
    return (
      <>
        <PageHeader title="Schedule" subtitle={back} />
        <p className="rounded-3xl border border-card-border bg-white p-6 text-sm text-gray-700">That schedule is gone.</p>
      </>
    );
  }

  const p = a.params as WeeklyParams;
  const weekly = a.kind === "weekly_report";
  const titleOf = (name: string) => setup.skills.find((s) => s.name === name)?.title ?? name;
  const outcome = (r: AgentRunRow) => (r.delivery_error ? r.delivery_error : r.report_id ? (r.delivered_at ? "sent" : "made") : r.finished_at ? (weekly ? "skipped: no new week of data" : r.should_deliver === false ? "skipped: no change" : "done") : "running");
  const detail = weekly
    ? `For ${p.contract?.client.name ?? "?"} · ${a.schedule_human ?? a.schedule_cron} · to ${a.delivery.email || "the list only"}${p.last_week ? ` · last sent ${p.last_week}` : ""}`
    : `${titleOf(a.skill)} · ${a.schedule_human ?? a.schedule_cron} · via ${a.delivery.channels.join(" + ")}${a.only_if_changed ? " · only if changed" : ""}`;

  async function remove() {
    if (!a) return;
    const ok = await act(a, "delete");
    setAsk(false);
    if (ok) router.push("/reports");
  }

  return (
    <>
      <PageHeader
        title={a.name}
        subtitle={<>{back} · {detail}</>}
        actions={<>
          <StatusPill tone={a.status === "active" ? "live" : a.status === "paused" ? "waiting" : "neutral"}>{a.status === "active" ? "On" : a.status === "paused" ? "Paused" : "Draft"}</StatusPill>
          {weekly && (
            <SelectInput withSearch size="sm" className="w-auto min-w-48" ariaLabel="Week to report" value={week} onChange={setWeek} searchPlaceholder="Search weeks"
              options={[{ value: "", label: "Latest full week" }, ...setup.weeks.map((w) => ({ value: w.key, label: w.label }))]} />
          )}
          <Button size="sm" disabled={!!busy} isLoading={busy === a.id + "run"} loadingLabel={weekly ? "Making the deck…" : "Running…"} onClick={() => void act(a, "run", week || undefined)}>Run now</Button>
          {a.status === "active"
            ? <Button size="sm" variant="outline" disabled={!!busy} isLoading={busy === a.id + "pause"} onClick={() => void act(a, "pause")}>Pause</Button>
            : <Button size="sm" variant="outline" disabled={!!busy} isLoading={busy === a.id + "resume"} onClick={() => void act(a, "resume")}>Resume</Button>}
          <ActionMenu label={`More for ${a.name}`} items={[{ key: "delete", label: "Delete schedule", danger: true, onSelect: () => setAsk(true) }]} />
        </>}
      />
      {weekly && (
        <WeeklyForm key={a.id} brands={setup.brands} initial={{ id: a.id, name: a.name, contract: p.contract ?? null, formats: p.formats, email: a.delivery.email, cron: a.schedule_cron }} onDone={say} />
      )}
      <section className={CARD}>
        <SectionTitle title="Runs" hint="The latest 20, newest first" />
        <div className="overflow-x-auto rounded-2xl border border-card-border bg-white">
          <table className="w-full min-w-120 border-collapse">
            <thead className="border-0 border-b border-card-border bg-white">
              <tr><th className={TH}>Started</th><th className={TH}>Outcome</th><th className={TH}>Report</th></tr>
            </thead>
            <tbody>
              {a.runs.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-sm text-gray-500">No runs yet. Press &quot;Run now&quot; to make the first one.</td></tr>}
              {a.runs.map((r) => (
                <tr key={r.id} className="border-b border-card-border last:border-b-0 even:bg-gray-50/60">
                  <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{fmtDate(r.started_at)}</td>
                  <td className={cn(TD, r.delivery_error && "text-red-700")}>{outcome(r)}</td>
                  <td className={TD}>{r.report_id ? <Link className={LINK} href={`/reports/${r.report_id}`}>open</Link> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ConfirmDialog
        open={ask}
        title="Delete this schedule?"
        body={`Delete the schedule "${a.name}"? Its reports stay in the list.`}
        confirmLabel="Delete"
        danger
        busy={busy === a.id + "delete"}
        onConfirm={() => void remove()}
        onClose={() => setAsk(false)}
      />
    </>
  );
}
