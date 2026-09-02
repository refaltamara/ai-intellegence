/** Users: lookup, creation and password management over the Neon HTTP client. */
import { sql } from "../db/client";
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import { hashPassword, verifyPassword } from "./password";

export type UserRow = { id: string; workspace_id: string; email: string; name: string | null; role: string; password_hash: string | null; created_at: string };

export async function findUserByEmail(email: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<UserRow | null> {
  const r = (await sql.query("select * from users where workspace_id = $1 and lower(email) = lower($2)", [workspaceId, email.trim()])) as UserRow[];
  return r[0] ?? null;
}
export async function listUsers(workspaceId = DEFAULT_WORKSPACE_ID): Promise<Omit<UserRow, "password_hash">[]> {
  return (await sql.query("select id, workspace_id, email, name, role, created_at from users where workspace_id = $1 order by created_at", [workspaceId])) as UserRow[];
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
export async function setPassword(email: string, password: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<boolean> {
  const r = (await sql.query("update users set password_hash = $3 where workspace_id = $1 and lower(email) = lower($2) returning id", [workspaceId, email.trim(), hashPassword(password)])) as { id: string }[];
  return r.length > 0;
}
export async function removeUser(email: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<boolean> {
  const r = (await sql.query("delete from users where workspace_id = $1 and lower(email) = lower($2) returning id", [workspaceId, email.trim()])) as { id: string }[];
  return r.length > 0;
}
export async function authenticate(email: string, password: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<UserRow | null> {
  const user = await findUserByEmail(email, workspaceId);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return user;
}
