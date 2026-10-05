/** Everything the CMS's page for one workspace shows (CMS plan, "Data" and "Health"). */
import { sql } from "../db/client";
import { contractFromDb, sourceOf, type SourceConfig } from "./contract";
import { loadBlockers, type InspectReport } from "./load";
import type { HealthState } from "./health";
import { DUMP_TABLES, blobOn } from "./storage";

export type WorkspacePage = {
  id: string; name: string; status: string; category: string | null; client: string | null; roles: string[]; settings: Record<string, unknown>;
  source: SourceConfig; inspect: InspectReport | null; blockers: string[]; blob: boolean; needed: string[];
  brands: { id: string; name: string; handles: string[]; terms: string[]; never: string[]; posts: number; relevant: number }[];
  loads: { id: string; kind: string; file: string; rows_in: number; rows_loaded: number; rows_rejected: number; report: Record<string, unknown>; started_at: string; finished_at: string | null }[];
  jobs: { id: string; kind: string; status: string; progress: Record<string, unknown>; error: string | null; updated_at: string }[];
  topics: { id: string; label: string; is_catch_all: boolean; tags: string[]; definition: string | null; comments: number; share: number }[];
  counts: { posts: number; comments: number; creators: number; snapshots: number };
  health: HealthState | null;
  notes: { text: string; source: string; at: string }[];
};

export async function workspacePage(ws: string): Promise<WorkspacePage | null> {
  const w = ((await sql.query("select id, name, status, category, client_brand_id, settings from workspaces where id = $1", [ws])) as { id: string; name: string; status: string; category: string | null; client_brand_id: string | null; settings: Record<string, unknown> }[])[0];
  if (!w) return null;
  const [src, k, blockers, brandCounts, loads, jobs, topics, counts] = await Promise.all([
    sourceOf(ws),
    contractFromDb(ws),
    loadBlockers(ws),
    sql.query("select brand_id, count(*)::int as posts, count(*) filter (where relevant is not false)::int as relevant from posts where workspace_id = $1 group by 1", [ws]) as unknown as Promise<{ brand_id: string; posts: number; relevant: number }[]>,
    sql.query("select id, kind, file, rows_in, rows_loaded, rows_rejected, report, started_at, finished_at from data_loads where workspace_id = $1 order by started_at desc limit 12", [ws]) as unknown as Promise<WorkspacePage["loads"]>,
    sql.query("select id, kind, status, progress, error, updated_at from cms_jobs where workspace_id = $1 and kind in ('dump_inspect','dump_load','relevance_apply') order by created_at desc limit 8", [ws]) as unknown as Promise<WorkspacePage["jobs"]>,
    sql.query("select t.id, t.label, t.is_catch_all, coalesce(t.tags, '{}') as tags, t.definition, count(c.id)::int as comments from topics t left join comments c on c.topic_id = t.id and c.workspace_id = $1 where t.workspace_id = $1 group by 1 order by t.sort_order, t.label", [ws]) as unknown as Promise<Omit<WorkspacePage["topics"][number], "share">[]>,
    sql.query("select (select count(*) from posts where workspace_id = $1)::int as posts, (select count(*) from comments where workspace_id = $1)::int as comments, (select count(*) from creators where workspace_id = $1)::int as creators, (select count(*) from post_snapshots s join posts p on p.id = s.post_id where p.workspace_id = $1)::int as snapshots", [ws]) as unknown as Promise<WorkspacePage["counts"][]>,
  ]);
  const totalT = topics.reduce((a, t) => a + t.comments, 0) || 1;
  const bc = new Map(brandCounts.map((r) => [r.brand_id, r]));
  return {
    id: w.id, name: w.name, status: w.status, category: w.category, client: w.client_brand_id, roles: (w.settings.roles as string[]) ?? [], settings: w.settings,
    source: src.config, inspect: (src.config.inspect as InspectReport) ?? null, blockers, blob: blobOn(), needed: [...DUMP_TABLES],
    brands: Object.entries(k?.brands ?? {}).map(([id, b]) => ({ id, name: b.name, handles: b.handles, terms: b.terms, never: b.never ?? [], posts: bc.get(id)?.posts ?? 0, relevant: bc.get(id)?.relevant ?? 0 })),
    loads, jobs, topics: topics.map((t) => ({ ...t, share: Math.round((t.comments / totalT) * 1000) / 10 })), counts: counts[0],
    health: (w.settings.health as HealthState) ?? null, notes: (w.settings.notes as WorkspacePage["notes"]) ?? [],
  };
}
