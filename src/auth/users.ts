/** Users: lookup, creation and password management over the Neon HTTP client. */
import { sql } from "../db/client";
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import { hashPassword, verifyPassword } from "./password";

export type UserRow = { id: string; workspace_id: string; email: string; name: string | null; role: string; password_hash: string | null; created_at: string };

/** Without a workspace, the account is looked up across workspaces (login); owners win over members when an email exists in two. */
export async function findUserByEmail(email: string, workspaceId?: string): Promise<UserRow | null> {
  const r = workspaceId
    ? ((await sql.query("select * from users where workspace_id = $1 and lower(email) = lower($2)", [workspaceId, email.trim()])) as UserRow[])
    : ((await sql.query("select * from users where lower(email) = lower($1) order by (role = 'owner') desc, created_at limit 1", [email.trim()])) as UserRow[]);
  return r[0] ?? null;
}
export async function listUsers(workspaceId?: string): Promise<Omit<UserRow, "password_hash">[]> {
  return workspaceId
    ? ((await sql.query("select id, workspace_id, email, name, role, created_at from users where workspace_id = $1 order by created_at", [workspaceId])) as UserRow[])
    : ((await sql.query("select id, workspace_id, email, name, role, created_at from users order by workspace_id, created_at")) as UserRow[]);
}
export async function upsertUser(u: { email: string; name?: string | null; role?: string; password: string; workspaceId?: string }): Promise<UserRow> {
  const ws = u.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const r = (await sql.query(
    `insert into users (workspace_id, email, name, role, password_hash) values ($1, lower($2), $3, $4, $5)
     on conflict (workspace_id, email) do update set name = coalesce(excluded.name, users.name), role = excluded.role, password_hash = excluded.password_hash returning *`,
    [ws, u.email.trim(), u.name ?? null, u.role ?? "member", hashPassword(u.password)],
  )) as UserRow[];
  return r[0];
}
export async function setPassword(email: string, password: string, workspaceId?: string): Promise<boolean> {
  const u = await findUserByEmail(email, workspaceId);
  if (!u) return false;
  const r = (await sql.query("update users set password_hash = $2 where id = $1 returning id", [u.id, hashPassword(password)])) as { id: string }[];
  return r.length > 0;
}
export async function removeUser(email: string, workspaceId?: string): Promise<boolean> {
  const u = await findUserByEmail(email, workspaceId);
  if (!u) return false;
  const r = (await sql.query("delete from users where id = $1 returning id", [u.id])) as { id: string }[];
  return r.length > 0;
}
export async function authenticate(email: string, password: string, workspaceId?: string): Promise<UserRow | null> {
  const user = await findUserByEmail(email, workspaceId);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return user;
}
