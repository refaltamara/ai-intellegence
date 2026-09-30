/** Files a report ships as (the weekly deck: .pptx and .pdf). Stored base64 in report_files, like attachments; every read is scoped by workspace. */
import { sql } from "../db/client";

export type ReportFileMeta = { id: string; report_id: string; format: "pptx" | "pdf"; filename: string; bytes: number; created_at: string };

export const MEDIA_TYPE: Record<ReportFileMeta["format"], string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};

export async function saveReportFile(f: { workspaceId: string; reportId: string; format: ReportFileMeta["format"]; filename: string; data: Buffer }): Promise<ReportFileMeta> {
  const r = (await sql.query(
    "insert into report_files (workspace_id, report_id, format, filename, bytes, data) values ($1, $2, $3, $4, $5, $6) returning id, report_id, format, filename, bytes, created_at",
    [f.workspaceId, f.reportId, f.format, f.filename, f.data.length, f.data.toString("base64")],
  )) as ReportFileMeta[];
  return r[0];
}

export async function listReportFiles(reportIds: string[], workspaceId: string): Promise<ReportFileMeta[]> {
  if (!reportIds.length) return [];
  return (await sql.query(
    "select id, report_id, format, filename, bytes, created_at from report_files where workspace_id = $1 and report_id = any($2::uuid[]) order by format desc",
    [workspaceId, reportIds],
  )) as ReportFileMeta[];
}

export async function getReportFile(id: string, workspaceId: string): Promise<(ReportFileMeta & { data: Buffer }) | null> {
  const r = (await sql.query("select id, report_id, format, filename, bytes, created_at, data from report_files where id = $1 and workspace_id = $2", [id, workspaceId])) as (ReportFileMeta & { data: string })[];
  return r[0] ? { ...r[0], data: Buffer.from(r[0].data, "base64") } : null;
}
