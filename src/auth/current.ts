/** Read the current session and the workspace it acts in, in server components and route handlers. */
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";
import { liveUser } from "./live";
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import { isRoleId, ROLES, type RoleModel } from "../roles/model";
import { getWorkspace } from "../workspace/store";

/** The role someone acts as inside the workspace (src/roles/model.ts); checked against what the workspace offers. */
export const ROLE_COOKIE = "fi_role";

/** Owners may act in another workspace; the choice lives in this cookie and is checked against the session's role. */
export const WS_COOKIE = "fi_ws";

/** The signed-in person, with the role and home workspace the users table holds now (not what the cookie remembers). */
export async function currentSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const live = await liveUser(session.uid).catch(() => undefined);
  if (live === null) return null;
  return live ? { ...session, role: live.role, ws: live.workspace_id } : session;
}

/** The workspace every query in this request is scoped to: the user's own, or the one an owner switched to. */
export async function currentWorkspaceId(): Promise<string> {
  const jar = await cookies();
  const session = await currentSession();
  if (!session) return DEFAULT_WORKSPACE_ID; // public paths never reach data; the proxy gates everything else
  const chosen = jar.get(WS_COOKIE)?.value;
  if (session.role === "owner" && chosen && /^[a-z0-9-]{1,60}$/.test(chosen)) return chosen;
  return session.ws || DEFAULT_WORKSPACE_ID;
}

export function wsCookieHeader(workspaceId: string | null): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return workspaceId ? `${WS_COOKIE}=${workspaceId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}` : `${WS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** The role this request acts as: the chosen one when the workspace offers it, else the workspace's first. */
export async function currentRole(workspaceId?: string): Promise<RoleModel> {
  const jar = await cookies();
  const ws = workspaceId ?? (await currentWorkspaceId());
  const roles = (await getWorkspace(ws).catch(() => null))?.roles ?? ["brand_kol"];
  const chosen = jar.get(ROLE_COOKIE)?.value;
  return ROLES[isRoleId(chosen) && roles.includes(chosen) ? chosen : roles[0]];
}

export function roleCookieHeader(role: string | null): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return role ? `${ROLE_COOKIE}=${role}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}` : `${ROLE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
