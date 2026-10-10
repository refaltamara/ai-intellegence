import { sql } from "@/db/client";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { COMMENT_IN_PANEL, panelPostEdge } from "@/db/panel";

export type WorkspaceStats = { brands: number; creators: number; posts: number; unique_posts: number; comments: number; comments_labelled: number; platforms: number; months: number; freshness: string; last_load: string | null; per_platform: { platform: string; posts: number; creators: number; first_month: string; last_month: string }[]; per_month: { platform: string; month: string; posts: number; days_captured: number; days_in_month: number }[]; loads: { file: string; platform: string | null; rows_in: number; rows_loaded: number; rows_rejected: number; finished_at: string | null }[] };

export async function workspaceStats(ws = DEFAULT_WORKSPACE_ID): Promise<WorkspaceStats> {
  const [t] = (await sql.query(
    `select (select count(*) from brands where workspace_id = $1)::int as brands,
            (select count(*) from creators where workspace_id = $1)::int as creators,
            (select count(*) from posts where workspace_id = $1 and brought_in_by = 'panel')::int as posts,
            (select count(distinct (platform, url)) from posts where workspace_id = $1 and brought_in_by = 'panel')::int as unique_posts,
            (select count(*) from comments c where c.workspace_id = $1 and ${COMMENT_IN_PANEL("c")})::int as comments,
            (select count(*) from comments c where c.workspace_id = $1 and c.sentiment is not null and ${COMMENT_IN_PANEL("c")})::int as comments_labelled,
            (select count(distinct platform) from posts where workspace_id = $1 and brought_in_by = 'panel')::int as platforms,
            (select count(distinct month) from posts where workspace_id = $1 and brought_in_by = 'panel')::int as months,
            to_char(${panelPostEdge("$1", "newest")} at time zone 'Asia/Jakarta', 'DD Mon YYYY') as freshness,
            (select to_char(max(finished_at) at time zone 'Asia/Jakarta', 'DD Mon YYYY HH24:MI') from data_loads where workspace_id = $1 and report->>'case' is null) as last_load`,
    [ws],
  )) as any[];
  const per_platform = (await sql.query(
    `select platform, count(*)::int as posts, count(distinct creator_id)::int as creators, to_char(min(month), 'Mon YYYY') as first_month, to_char(max(month), 'Mon YYYY') as last_month
     from posts where workspace_id = $1 and brought_in_by = 'panel' group by 1 order by 1`,
    [ws],
  )) as any[];
  const per_month = (await sql.query(
    `select platform, to_char(month, 'YYYY-MM') as month, count(*)::int as posts,
            count(distinct (posted_at at time zone 'Asia/Jakarta')::date)::int as days_captured,
            extract(day from (month + interval '1 month - 1 day'))::int as days_in_month
     from posts where workspace_id = $1 and brought_in_by = 'panel' group by platform, posts.month order by 1, 2`,
    [ws],
  )) as any[];
  const loads = (await sql.query(
    `select file, platform, rows_in, rows_loaded, rows_rejected, to_char(finished_at at time zone 'Asia/Jakarta', 'DD Mon YYYY HH24:MI') as finished_at
     from data_loads where workspace_id = $1 and report->>'case' is null order by started_at desc limit 12`,
    [ws],
  )) as any[];
  return { ...t, per_platform, per_month, loads };
}
