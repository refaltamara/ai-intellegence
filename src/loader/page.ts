/**
 * What the CMS shows about a workspace's loads (src/loader/; the Loads tab of /admin/workspaces/[id]). A case's loads and raw
 * files show only to the people on that case's list (step 5): pass the cases this person may see.
 */
import { sql } from "../db/client";
import type { Check } from "./checks";
import { workspaceRawFiles } from "./registry";

export type LoadRow = {
  id: string; source: string; status: string; files: { path: string; raw_file_id: string | null }[]; checks: Check[]; error: string | null;
  staged: Record<string, number> | null; promoted: Record<string, number> | null; notice: { at: string; to: string[]; sent: boolean; error?: string; subject: string } | null;
  file_reports: { file: string; rows_in: number; staged: number; merged: number; dropped: number }[];
  started_by: string | null; decided_by: string | null; created_at: string; live_at: string | null; cleared_at: string | null;
  /** the case the load is for, by name; empty for the panel's own */
  case_id: string | null; case_name: string | null;
};

export async function loadsOf(ws: string, visibleCases: string[], limit = 20): Promise<{ loads: LoadRow[]; raw: Awaited<ReturnType<typeof workspaceRawFiles>> }> {
  const [loads, raw] = await Promise.all([
    sql.query(
      `select l.id, l.source, l.status, l.files, l.checks, l.error, l.report->'staged' as staged, l.report->'promoted' as promoted, l.report->'notice' as notice,
              coalesce(l.report->'files', '[]'::jsonb) as file_reports, l.started_by, l.decided_by, l.created_at, l.live_at, l.cleared_at,
              l.case_id, c.name as case_name
         from staging.loads l left join cases c on c.id = l.case_id
        where l.workspace_id = $1 and (l.case_id is null or l.case_id = any($3::text[])) order by l.created_at desc limit $2`,
      [ws, limit, visibleCases],
    ) as unknown as Promise<LoadRow[]>,
    workspaceRawFiles(ws),
  ]);
  return { loads, raw: raw.filter((f) => !f.case_id || visibleCases.includes(f.case_id)) };
}
