/**
 * What the CMS shows (CMS plan, "The CMS: Fair's brain"): roles and their versions,
 * every workspace's state, Fair's people, the audit log. Read-only queries; changes go
 * through src/roles/store.ts and src/auth/*. Every number here is counted in SQL.
 */
import { sql } from "../db/client";
import { ROLES, type RoleId } from "../roles/model";
import { listWorkspaces, getWorkspace } from "../workspace/store";

export type VersionRow = { role: RoleId; version: string; status: string; stage_workspaces: string[] | null; release_note: string | null; proposed_by: string | null; released_by: string | null; released_at: string | null; rolled_back_by: string | null; rolled_back_at: string | null; created_at: string };

export async function roleVersions(): Promise<VersionRow[]> {
  return (await sql.query(
    "select role, version, status, stage_workspaces, release_note, proposed_by, released_by, released_at, rolled_back_by, rolled_back_at, created_at from role_versions order by role, created_at desc",
  )) as VersionRow[];
}

/** the current release per role: the latest released */
export function currentOf(rows: VersionRow[], role: RoleId): VersionRow | null {
  return rows.filter((r) => r.role === role && r.status === "released" && !r.stage_workspaces?.length).sort((a, b) => (b.released_at ?? "").localeCompare(a.released_at ?? ""))[0] ?? null;
}

export type CompanyState = { workspace_id: string; role: RoleId; version: number; base_version: string | null; changes: number; author: string | null; created_at: string };

/** each client's live company version per role: pinned or following, and how many parts it changed */
export async function companyStates(): Promise<CompanyState[]> {
  return (await sql.query(
    `select distinct on (workspace_id, role) workspace_id, role, version, base_version, (select count(*) from jsonb_object_keys(overrides))::int as changes, author, created_at
       from company_versions order by workspace_id, role, version desc`,
  )) as CompanyState[];
}

export type WorkspaceState = {
  id: string; name: string; kind: string; category: string | null; roles: RoleId[]; client: string | null;
  posts: number; comments: number; data_through: string | null; last_load: string | null;
  members: number; builders: number; invites: number; off_topic: number;
};

export async function workspaceStates(): Promise<WorkspaceState[]> {
  const ws = await listWorkspaces();
  const [posts, comments, loads, people, invites] = await Promise.all([
    sql.query("select workspace_id, count(*)::int as n, count(*) filter (where relevant = false)::int as off, to_char(max(posted_at), 'YYYY-MM-DD') as through from posts group by 1") as unknown as Promise<{ workspace_id: string; n: number; off: number; through: string | null }[]>,
    sql.query("select workspace_id, count(*)::int as n from comments group by 1") as unknown as Promise<{ workspace_id: string; n: number }[]>,
    sql.query("select workspace_id, to_char(max(started_at), 'YYYY-MM-DD') as last from data_loads group by 1") as unknown as Promise<{ workspace_id: string; last: string | null }[]>,
    sql.query("select workspace_id, count(*)::int as n, count(*) filter (where exists (select 1 from jsonb_each_text(levels) l where l.value = 'builder'))::int as builders from users u join accounts a on a.id = u.account_id where cardinality(a.staff) = 0 group by 1") as unknown as Promise<{ workspace_id: string; n: number; builders: number }[]>,
    sql.query("select workspace_id, count(*)::int as n from invites where accepted_at is null and revoked_at is null and expires_at > now() group by 1") as unknown as Promise<{ workspace_id: string; n: number }[]>,
  ]);
  const by = <T extends { workspace_id: string }>(rows: T[]) => new Map(rows.map((r) => [r.workspace_id, r]));
  const [p, c, l, pe, inv] = [by(posts), by(comments), by(loads), by(people), by(invites)];
  return Promise.all(ws.map(async (w) => {
    const cfg = await getWorkspace(w.id);
    return {
      id: w.id, name: w.name, kind: cfg?.kind ?? w.kind, category: cfg?.category_label ?? null, roles: cfg?.roles ?? [], client: cfg?.client_name ?? null,
      posts: p.get(w.id)?.n ?? 0, off_topic: p.get(w.id)?.off ?? 0, data_through: p.get(w.id)?.through ?? null, comments: c.get(w.id)?.n ?? 0, last_load: l.get(w.id)?.last ?? null,
      members: pe.get(w.id)?.n ?? 0, builders: pe.get(w.id)?.builders ?? 0, invites: inv.get(w.id)?.n ?? 0,
    };
  }));
}

export type AuditRow = { id: string; workspace_id: string | null; actor: string; area: string; action: string; path: string | null; old: unknown; new: unknown; note: string | null; created_at: string };

export async function auditRows(o: { area?: string | null; workspace?: string | null; limit?: number } = {}): Promise<AuditRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (o.area) { params.push(o.area); where.push(`area = $${params.length}`); }
  if (o.workspace) { params.push(o.workspace); where.push(`workspace_id = $${params.length}`); }
  params.push(Math.min(o.limit ?? 200, 500));
  return (await sql.query(`select * from audit_log ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc limit $${params.length}`, params)) as AuditRow[];
}

export const roleName = (r: RoleId) => `${ROLES[r].codename} · ${ROLES[r].short}`;
