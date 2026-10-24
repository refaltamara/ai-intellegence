"use client";
/**
 * The Reports page (DESIGN.md 5.3): the list, a new schedule (?new=1) or one schedule (?schedule=<id>).
 * It owns the toast, so a message survives going from a schedule's setup back to the list.
 */
import Link from "next/link";
import type { ReportRow } from "@/reports/store";
import { buttonClass } from "../kit/Button";
import { IconPlus } from "../kit/icons";
import { PageHeader } from "../kit/PageHeader";
import { Toast, useToast } from "../kit/Toast";
import { NewSchedule, type SetupOptions } from "./NewSchedule";
import { ReportList } from "./ReportList";
import { ScheduleDetail } from "./ScheduleDetail";
import type { AgentWithRuns } from "./useSchedule";

export type ReportsView = { kind: "list" } | { kind: "new" } | { kind: "schedule"; id: string };

export function ReportsScreen({ agents, reports, view, setup }: { agents: AgentWithRuns[]; reports: ReportRow[]; view: ReportsView; setup: SetupOptions }) {
  const toast = useToast();
  return (
    <section data-tw className="flex min-h-full flex-col gap-6 px-4 pb-6 md:px-6">
      {view.kind === "new" ? (
        <NewSchedule setup={setup} say={toast.show} />
      ) : view.kind === "schedule" ? (
        <ScheduleDetail key={view.id} a={agents.find((a) => a.id === view.id) ?? null} setup={setup} say={toast.show} />
      ) : (
        <>
          <PageHeader
            title="Reports"
            subtitle="What runs on a schedule, and everything produced from it and from Chats"
            actions={<>
              <Link className={buttonClass("outline", "sm")} href="/decks">Decks</Link>
              <Link className={buttonClass("primary", "sm")} href="/reports?new=1"><IconPlus size={16} />New schedule</Link>
            </>}
          />
          <ReportList agents={agents} reports={reports} skills={setup.skills} say={toast.show} />
        </>
      )}
      <Toast text={toast.text} />
    </section>
  );
}
