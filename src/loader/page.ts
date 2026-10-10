/** What the CMS shows about a workspace's loads (src/loader/; the Loads tab of /admin/workspaces/[id]). */
import { sql } from "../db/client";
import type { Check } from "./checks";
import { workspaceRawFiles } from "./registry";

export type LoadRow = {
  id: string; source: string; status: string; files: { path: string; raw_file_id: string | null }[]; checks: Check[]; error: string | null;
  staged: Record<string, number> | null; promoted: Record<string, number> | null; notice: { at: string; to: string[]; sent: boolean; error?: string; subject: string } | null;
  file_reports: { file: string; rows_in: number; staged: number; merged: number; dropped: number }[];
  started_by: string | null; decided_by: string | null; created_at: string; live_at: string | null; cleared_at: string | null;
};

export async function loadsOf(ws: string, limit = 20): Promise<{ loads: LoadRow[]; raw: Awaited<ReturnType<typeof workspaceRawFiles>> }> {
  const [loads, raw] = await Promise.all([
    sql.query(
      `select id, source, status, files, checks, error, report->'staged' as staged, report->'promoted' as promoted, report->'notice' as notice,
              coalesce(report->'files', '[]'::jsonb) as file_reports, started_by, decided_by, created_at, live_at, cleared_at
         from staging.loads where workspace_id = $1 order by created_at desc limit $2`,
      [ws, limit],
    ) as unknown as Promise<LoadRow[]>,
    workspaceRawFiles(ws),
  ]);
  return { loads, raw };
}
