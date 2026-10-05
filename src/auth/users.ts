/**
 * People from the command line (`pnpm user`), over accounts and memberships
 * (src/auth/accounts.ts). Sign-in itself is authenticateAccount.
 */
import { sql } from "../db/client";
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import type { Duty } from "../config/staff";
import type { RoleId } from "../roles/model";
import type { Level } from "./can";
import { ensureMember, findAccount, removeMember, setAccountPassword, setStaff } from "./accounts";

export type UserListRow = { workspace_id: string; email: string; name: string | null; staff: Duty[]; levels: Partial<Record<RoleId, Level>> };

export async function listUsers(workspaceId?: string): Promise<UserListRow[]> {
  return (await sql.query(
    `select u.workspace_id, a.email, coalesce(a.name, u.name) as name, a.staff, u.levels from users u join accounts a on a.id = u.account_id
      ${workspaceId ? "where u.workspace_id = $1" : ""} order by u.workspace_id, u.created_at`,
    workspaceId ? [workspaceId] : [],
  )) as UserListRow[];
}

export async function upsertUser(u: { email: string; name?: string | null; level?: Level; password: string; workspaceId?: string }): Promise<{ email: string; workspace_id: string }> {
  const ws = u.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const { getWorkspace } = await import("../workspace/store");
  const roles = (await getWorkspace(ws))?.roles ?? ["brand_kol"];
  await ensureMember({ email: u.email, name: u.name, workspaceId: ws, password: u.password, levels: Object.fromEntries(roles.map((r) => [r, u.level ?? "member"])) });
  return { email: u.email.toLowerCase(), workspace_id: ws };
}

export const setPassword = setAccountPassword;

export async function setDuties(email: string, duties: Duty[]): Promise<boolean> {
  const a = await findAccount(email);
  return !!a && setStaff(a.id, duties);
}

export async function removeUser(email: string, workspaceId?: string): Promise<boolean> {
  const rows = (await sql.query(
    `select u.id, u.workspace_id from users u join accounts a on a.id = u.account_id where a.email = lower($1) ${workspaceId ? "and u.workspace_id = $2" : ""}`,
    workspaceId ? [email.trim(), workspaceId] : [email.trim()],
  )) as { id: string; workspace_id: string }[];
  for (const r of rows) await removeMember(r.workspace_id, r.id);
  return rows.length > 0;
}
