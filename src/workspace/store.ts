/** Workspaces over the Neon HTTP client, cached for five minutes; settings change rarely. */
import { sql } from "../db/client";
import { workspaceConfig, type WorkspaceConfig, type WorkspaceKind, type WorkspaceRow, type WorkspaceSettings } from "./config";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; cfg: WorkspaceConfig }>();

export function invalidateWorkspace(id?: string): void {
  if (id) cache.delete(id);
  else cache.clear();
}

export async function getWorkspace(id: string): Promise<WorkspaceConfig | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.cfg;
  const rows = (await sql.query(
    "select w.id, w.name, w.category, w.client_brand_id, w.tz, w.kind, w.settings, b.name as client_name from workspaces w left join brands b on b.id = w.client_brand_id where w.id = $1",
    [id],
  )) as (WorkspaceRow & { client_name: string | null })[];
  if (!rows[0]) return null;
  const cfg = workspaceConfig(rows[0], rows[0].client_name);
  cache.set(id, { at: Date.now(), cfg });
  return cfg;
}

export async function listWorkspaces(): Promise<{ id: string; name: string; kind: WorkspaceKind; product_name: string }[]> {
  const rows = (await sql.query("select w.id, w.name, w.category, w.client_brand_id, w.tz, w.kind, w.settings from workspaces w order by w.created_at")) as WorkspaceRow[];
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind === "profile" ? "profile" : "category", product_name: workspaceConfig(r).product_name }));
}

export async function createWorkspace(w: { id: string; name: string; kind: WorkspaceKind; category?: string | null; tz?: string; settings?: WorkspaceSettings }): Promise<void> {
  await sql.query(
    "insert into workspaces (id, name, category, tz, kind, settings) values ($1, $2, $3, $4, $5, $6::jsonb) on conflict (id) do update set name = excluded.name, category = excluded.category, tz = excluded.tz, kind = excluded.kind, settings = workspaces.settings || excluded.settings",
    [w.id, w.name, w.category ?? null, w.tz ?? "Asia/Jakarta", w.kind, JSON.stringify(w.settings ?? {})],
  );
  invalidateWorkspace(w.id);
}

export async function updateWorkspaceSettings(id: string, patch: WorkspaceSettings & { kind?: WorkspaceKind; name?: string }): Promise<boolean> {
  const { kind, name, ...settings } = patch;
  const rows = (await sql.query(
    "update workspaces set settings = settings || $2::jsonb, kind = coalesce($3, kind), name = coalesce($4, name) where id = $1 returning id",
    [id, JSON.stringify(settings), kind ?? null, name ?? null],
  )) as { id: string }[];
  invalidateWorkspace(id);
  return rows.length > 0;
}
