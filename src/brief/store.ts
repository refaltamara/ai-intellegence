/** briefs persistence over the Neon HTTP client. */
import { sql } from "../db/client";
import type { Evidence } from "../skills/types";

export type BriefItem = { label: string; prompt: string; skill?: string; params?: Record<string, unknown> };
export type NoticedItem = { agent_id: string; agent_name: string; decision_id: string | null; decision_name: string | null; when: string; changes: number; lines: string[] };
export type BriefContent = {
  headline: string;
  body: string;
  offer: BriefItem | null;
  followups: BriefItem[];
  quiet: boolean;
  window: { from: string; to: string };
  prior: { from: string; to: string };
  client: string | null;
  brands: string[];
  noticed: NoticedItem[];
  generated_by: "model" | "fallback";
};
export type BriefRow = { id: string; workspace_id: string; data_key: string; content: BriefContent; evidence: Evidence[] | null; quiet: boolean; generated_at: string; seen_at: string | null };

export async function latestBrief(workspaceId: string): Promise<BriefRow | null> {
  const r = (await sql.query("select * from briefs where workspace_id = $1 order by generated_at desc limit 1", [workspaceId])) as BriefRow[];
  return r[0] ?? null;
}

export async function insertBrief(b: { workspaceId: string; dataKey: string; content: BriefContent; evidence: Evidence[]; quiet: boolean }): Promise<BriefRow> {
  const r = (await sql.query(
    "insert into briefs (workspace_id, data_key, content, evidence, quiet) values ($1, $2, $3::jsonb, $4::jsonb, $5) returning *",
    [b.workspaceId, b.dataKey, JSON.stringify(b.content), JSON.stringify(b.evidence), b.quiet],
  )) as BriefRow[];
  return r[0];
}

export async function markSeen(id: string): Promise<void> {
  await sql.query("update briefs set seen_at = coalesce(seen_at, now()) where id = $1", [id]);
}
