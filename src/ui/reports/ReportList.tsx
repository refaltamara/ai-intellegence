"use client";
/**
 * Reports as one list (DECISIONS, 1 Oct 2026), in two tables: the schedules, then every report, each with
 * where it came from (a schedule, Chats, or a schedule since deleted). A report opens on its own page; a
 * schedule opens its settings and runs. Every report and every schedule can be deleted from here.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReportRow } from "@/reports/store";
import { cn } from "../cn";
import { ActionMenu, type ActionItem } from "../kit/ActionMenu";
import { Button } from "../kit/Button";
import { ConfirmDialog } from "../kit/Modal";
import { Segmented } from "../kit/Segmented";
import { StatusPill, type PillTone } from "../kit/StatusPill";
import { LINK } from "./docParts";
import { useSchedule, when, type AgentWithRuns } from "./useSchedule";

const TH = "px-3 py-3 text-left text-sm font-semibold text-gray-900";
const TD = "px-3 py-3 align-top text-sm text-gray-700";
const TR = "border-b border-card-border transition-colors last:border-b-0 even:bg-gray-50/60 hover:bg-brand-palette-50";
const SUB = "block text-xs text-gray-500";
const NAME = "font-semibold text-gray-900 underline-offset-2 hover:text-brand-palette-700 hover:underline";
const EMPTY = "rounded-3xl border border-card-border bg-white p-6 text-sm text-gray-700";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" });
const STATE: Record<string, { label: string; tone: PillTone }> = { active: { label: "On", tone: "live" }, paused: { label: "Paused", tone: "waiting" } };
const kindOf = (r: ReportRow) => (r.blocks?.kind === "weekly" ? "Deck" : r.blocks?.kind === "conversation" ? "Conversation" : "Analysis");

type Filter = "all" | "chats" | "schedules";
type Ask = { kind: "schedule"; a: AgentWithRuns } | { kind: "report"; r: ReportRow };

export function ReportList({ agents, reports, skills, say }: { agents: AgentWithRuns[]; reports: ReportRow[]; skills: { name: string; title: string }[]; say: (m: string) => void }) {
  const router = useRouter();
  const { busy, act } = useSchedule(say);
  const [filter, setFilter] = useState<Filter>("all");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [deleting, setDeleting] = useState(false);

  // which schedule made each report; the rest came from Chats or from schedules since deleted
  const madeBy = new Map<string, AgentWithRuns>();
  for (const a of agents) {
    const ids = new Set(a.runs.map((r) => r.id));
    for (const r of reports) if (r.agent_run_id && ids.has(r.agent_run_id)) madeBy.set(r.id, a);
  }
  const fromChats = (r: ReportRow) => !madeBy.has(r.id) && r.source !== "agent";
  const count = { all: reports.length, chats: reports.filter(fromChats).length, schedules: reports.length - reports.filter(fromChats).length };
  const shown = filter === "all" ? reports : reports.filter((r) => fromChats(r) === (filter === "chats"));
  const latestOf = (a: AgentWithRuns) => reports.find((r) => madeBy.get(r.id)?.id === a.id) ?? null;
  const titleOf = (name: string) => skills.find((s) => s.name === name)?.title ?? name;

  async function confirmAsk() {
    if (!ask) return;
    if (ask.kind === "schedule") {
      await act(ask.a, "delete");
    } else {
      setDeleting(true);
      const res = await fetch(`/api/reports/${ask.r.id}`, { method: "DELETE" });
      setDeleting(false);
      say(res.ok ? "Report deleted" : "Could not delete the report");
      router.refresh();
    }
    setAsk(null);
  }

  const scheduleMenu = (a: AgentWithRuns): ActionItem[] => [
    { key: "open", label: a.kind === "weekly_report" ? "Edit" : "Runs", onSelect: () => router.push(`/reports?schedule=${a.id}`) },
    a.status === "active" ? { key: "pause", label: "Pause", disabled: !!busy, onSelect: () => void act(a, "pause") } : { key: "resume", label: "Resume", disabled: !!busy, onSelect: () => void act(a, "resume") },
    { key: "delete", label: "Delete", danger: true, onSelect: () => setAsk({ kind: "schedule", a }) },
  ];

  return (
    <>
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-tight text-gray-900">Scheduled</h2>
          <p className="text-xs text-gray-500">What runs on its own, and when it runs next</p>
        </div>
        {agents.length === 0 ? (
          <p className={EMPTY}>Nothing scheduled yet. Start one with &quot;New schedule&quot;.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-card-border bg-white">
            <table className="w-full min-w-220 border-collapse">
              <thead className="border-0 border-b border-card-border bg-white">
                <tr><th className={TH}>Schedule</th><th className={TH}>Status</th><th className={TH}>Latest report</th><th className={TH}><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>{agents.map((a) => {
                const st = STATE[a.status] ?? { label: "Draft", tone: "neutral" as const };
                const latest = latestOf(a);
                return (
                  <tr key={a.id} className={TR}>
                    <td className={cn(TD, "max-w-96")}>
                      <Link href={`/reports?schedule=${a.id}`} className={NAME}>{a.name}</Link>
                      <small className={SUB}>{a.kind === "weekly_report" ? "Weekly Competitor Pulse · deck" : titleOf(a.skill)} · {a.schedule_human ?? a.schedule_cron}</small>
                    </td>
                    <td className={cn(TD, "max-w-72")}>
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                      <small className={cn(SUB, "mt-1")}>next {a.status === "active" ? when(a.next_run_at, a.schedule_tz) : "–"}</small>
                    </td>
                    <td className={cn(TD, "max-w-80")}>
                      {latest ? <Link href={`/reports/${latest.id}`} className={NAME}>{latest.title}</Link> : <span className="text-gray-500">none yet</span>}
                      {latest && <small className={SUB}>{day(latest.created_at)}</small>}
                    </td>
                    <td className={cn(TD, "w-0")}>
                      <span className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={!!busy} isLoading={busy === a.id + "run"} loadingLabel="Running…" onClick={() => void act(a, "run")}>Run now</Button>
                        <ActionMenu label={`More for ${a.name}`} items={scheduleMenu(a)} />
                      </span>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold leading-tight text-gray-900">Reports</h2>
            <p className="text-xs text-gray-500">Everything the schedules made, and what was turned into a report in Chats</p>
          </div>
          {reports.length > 0 && (
            <Segmented tabs label="Show" value={filter} onChange={setFilter} className="self-start"
              options={[{ key: "all" as const, label: "All", count: count.all }, { key: "chats" as const, label: "From Chats", count: count.chats }, { key: "schedules" as const, label: "From schedules", count: count.schedules }].filter((o) => o.key === "all" || o.count > 0)} />
          )}
        </div>
        {reports.length === 0 ? (
          <p className={EMPTY}>
            {agents.length > 0 ? "No reports yet. Press \"Run now\" on a schedule." : <>No reports yet. Schedule the Weekly Competitor Pulse with <Link className={LINK} href="/reports?new=1">New schedule</Link>, or press &quot;Turn into a report&quot; under an answer in Chats.</>}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-card-border bg-white">
            <table className="w-full min-w-180 border-collapse">
              <thead className="border-0 border-b border-card-border bg-white">
                <tr><th className={TH}>Report</th><th className={TH}>From</th><th className={TH}>Made</th><th className={TH}><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const a = madeBy.get(r.id);
                  const week = r.blocks?.kind === "weekly" && r.blocks.week?.iso ? `${r.blocks.week.iso.replace(/^\d{4}-/, "")} · ` : "";
                  return (
                    <tr key={r.id} className={TR}>
                      <td className={cn(TD, "max-w-120")}>
                        <Link href={`/reports/${r.id}`} className={NAME}>{week}{r.title}</Link>
                        <small className={SUB}>{kindOf(r)}</small>
                      </td>
                      <td className={cn(TD, "max-w-72")}>
                        {a ? <Link href={`/reports?schedule=${a.id}`} className="underline-offset-2 hover:text-brand-palette-700 hover:underline">{a.name}</Link> : r.source === "agent" ? <span className="text-gray-500">An earlier schedule</span> : "Chats"}
                      </td>
                      <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{day(r.created_at)}</td>
                      <td className={cn(TD, "w-0")}>
                        <span className="flex justify-end"><ActionMenu label={`More for ${r.title}`} items={[{ key: "delete", label: "Delete", danger: true, onSelect: () => setAsk({ kind: "report", r }) }]} /></span>
                      </td>
                    </tr>
                  );
                })}
                {!shown.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">No reports here.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!ask}
        title={ask?.kind === "schedule" ? "Delete this schedule?" : "Delete this report?"}
        body={ask?.kind === "schedule" ? `Delete the schedule "${ask.a.name}"? Its reports stay in the list.` : ask ? `Delete "${ask.r.title}"? Its files go with it.` : null}
        confirmLabel="Delete"
        danger
        busy={ask?.kind === "schedule" ? busy === ask.a.id + "delete" : deleting}
        onConfirm={() => void confirmAsk()}
        onClose={() => setAsk(null)}
      />
    </>
  );
}
