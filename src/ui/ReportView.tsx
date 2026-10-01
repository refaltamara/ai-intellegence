/** The right document for a report: the weekly deck, a conversation, or a single analysis. */
import type { WeeklyBlocks } from "@/competitor/scheduled";
import type { ConversationBlocks } from "@/reports/conversation";
import type { ReportFileMeta } from "@/reports/files";
import type { ReportRow } from "@/reports/store";
import { ConversationDoc } from "./ConversationDoc";
import { ReportDoc } from "./ReportDoc";
import { WeeklyDoc } from "./WeeklyDoc";

export function ReportView({ report, files }: { report: ReportRow; files: ReportFileMeta[] }) {
  if (report.blocks?.kind === "weekly") return <WeeklyDoc report={{ ...report, blocks: report.blocks as unknown as WeeklyBlocks }} files={files} />;
  if (report.blocks?.kind === "conversation") return <ConversationDoc report={{ ...report, blocks: report.blocks as unknown as ConversationBlocks }} />;
  return <ReportDoc report={report} />;
}
