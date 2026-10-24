"use client";
/**
 * One report on its own page: the weekly deck, a conversation, or a single analysis. The frame is the same
 * for all three (the header with the way back to Reports, what the report is, its files and Delete); the
 * body is the document's own.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { WeeklyBlocks } from "@/competitor/scheduled";
import type { ConversationBlocks } from "@/reports/conversation";
import type { ReportFileMeta } from "@/reports/files";
import type { ReportRow } from "@/reports/store";
import { ActionMenu } from "../kit/ActionMenu";
import { buttonClass, Button } from "../kit/Button";
import { ConfirmDialog } from "../kit/Modal";
import { PageHeader } from "../kit/PageHeader";
import { StatusPill } from "../kit/StatusPill";
import { AnalysisDoc } from "./AnalysisDoc";
import { ConversationDoc } from "./ConversationDoc";
import { LINK } from "./docParts";
import { WeeklyDoc } from "./WeeklyDoc";

const made = (iso: string) => `${new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB`;

export function ReportPage({ report, files }: { report: ReportRow; files: ReportFileMeta[] }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const b = report.blocks;
  const kind = b?.kind === "weekly" ? "weekly" : b?.kind === "conversation" ? "conversation" : "analysis";

  async function remove() {
    setBusy(true); setError("");
    const r = await fetch(`/api/reports/${report.id}`, { method: "DELETE" });
    setBusy(false);
    setAsk(false);
    if (!r.ok) { setError("Could not delete the report."); return; }
    router.push("/reports");
    router.refresh();
  }

  const md = <a className={buttonClass("outline", "sm")} href={`/api/reports/${report.id}?format=md`} target="_blank" rel="noreferrer">Markdown</a>;
  const print = <Button variant="outline" size="sm" onClick={() => window.print()}>Print / Save as PDF</Button>;

  let title: string = report.title;
  let meta = "";
  let pills: ReactNode = null;
  let actions: ReactNode = null;
  let body: ReactNode;
  if (kind === "weekly") {
    const w = b as unknown as WeeklyBlocks;
    title = `${w.title}: ${w.week.label}`;
    meta = `Prepared for ${w.client} · against ${w.previous_week} · data through ${w.data_as_of} · made ${made(report.created_at)}`;
    if (w.narrative_by === "fallback") pills = <span title={w.narrative_problems.join("\n") || "The model was not available"}><StatusPill tone="neutral">plain wording</StatusPill></span>;
    actions = <Link className={buttonClass("outline", "sm")} href={`/weekly?r=${report.id}`}>Open the slides</Link>;
    body = <WeeklyDoc blocks={w} files={files} />;
  } else if (kind === "conversation") {
    const c = b as unknown as ConversationBlocks;
    meta = `From a conversation in Chats · ${c.questions} question${c.questions === 1 ? "" : "s"} · ${c.analyses} analys${c.analyses === 1 ? "is" : "es"}${c.data_window ? ` · data ${c.data_window.from} to ${c.data_window.to}` : ""} · made ${made(report.created_at)}`;
    if (c.summary.by === "fallback") pills = <span title={c.summary.problems.join("\n")}><StatusPill tone="neutral">plain summary</StatusPill></span>;
    actions = <><Link className={buttonClass("outline", "sm")} href={`/?c=${c.conversation_id}`}>Open the conversation</Link>{md}{print}</>;
    body = <ConversationDoc blocks={c} />;
  } else {
    const changes = b.diff && !b.diff.first_run ? b.diff.new + b.diff.gone + b.diff.changed : null;
    meta = `${b.data_window?.from} to ${b.data_window?.to} · /${b.skill} · ${report.source === "agent" ? `from agent${b.agent_name ? ` "${b.agent_name}"` : ""}` : "from Ask"} · generated ${made(report.created_at)}`;
    pills = (
      <>
        {changes != null && <StatusPill tone="brand">{changes} change{changes === 1 ? "" : "s"}</StatusPill>}
        {b.diff?.first_run && <StatusPill tone="neutral">baseline</StatusPill>}
        {b.sections?.generated_by === "fallback" && <span title="ANTHROPIC_API_KEY not set when this report was generated"><StatusPill tone="neutral">no model headline</StatusPill></span>}
      </>
    );
    actions = <>{md}{print}{report.skill_run_id && b.skill === "discovery" && <Link className={buttonClass("outline", "sm")} href={`/skills/discovery?run=${report.skill_run_id}`}>Open in /discovery</Link>}</>;
    body = <AnalysisDoc report={report} />;
  }

  return (
    <section data-tw className="flex min-h-full flex-col gap-6 px-4 pb-6 md:px-6">
      <PageHeader
        title={title}
        subtitle={<><Link className={LINK} href="/reports">Reports</Link> · {meta}</>}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {pills}
            {actions}
            <ActionMenu label={`More for ${title}`} items={[{ key: "delete", label: "Delete", danger: true, onSelect: () => setAsk(true) }]} />
          </div>
        }
      />
      {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {body}
      <ConfirmDialog
        open={ask}
        title="Delete this report?"
        body={kind === "weekly" ? `Delete "${title}" and its files? This cannot be undone.` : `Delete "${title}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setAsk(false)}
      />
    </section>
  );
}
