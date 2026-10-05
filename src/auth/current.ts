/** Read the current session and the workspace it acts in, in server components and route handlers. */
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";
import { liveUser } from "./live";
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import { isRoleId, type RoleModel } from "../roles/model";
import { loadActor } from "./accounts";
import { can, rolesFor, type Actor } from "./can";
import { getRole } from "../roles/store";
import { getWorkspace } from "../workspace/store";

/** The role someone acts as inside the workspace (src/roles/model.ts); checked against what the workspace offers. */
export const ROLE_COOKIE = "fi_role";

/** The workspace someone switched to; honoured only where they may reach it (Fair staff everywhere, a client where it has a membership). */
export const WS_COOKIE = "fi_ws";

/** The signed-in person, with the role and home workspace the users table holds now (not what the cookie remembers). */
export async function currentSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const live = await liveUser(session.uid).catch(() => undefined);
  if (live === null) return null;
  // a client whose every workspace is paused or not live yet is signed out until one opens
  const actor = await loadActor(session.uid).catch(() => undefined);
  if (actor && !actor.staff.length && !actor.memberships.length) return null;
  return live ? { ...session, role: live.role, ws: live.workspace_id } : session;
}

/** The person signed in, with their Fair duties and every workspace they belong to (src/auth/can.ts says what they may do). */
export async function currentActor(): Promise<Actor | null> {
  const session = await currentSession();
  if (!session) return null;
  return loadActor(session.uid).catch(() => null);
}

/** The workspace every query in this request is scoped to: the person's own, or one they switched to and may reach. */
export async function currentWorkspaceId(): Promise<string> {
  const jar = await cookies();
  const session = await currentSession();
  if (!session) return DEFAULT_WORKSPACE_ID; // public paths never reach data; the proxy gates everything else
  const chosen = jar.get(WS_COOKIE)?.value;
  if (chosen && chosen !== session.ws && /^[a-z0-9-]{1,60}$/.test(chosen)) {
    const actor = await loadActor(session.uid).catch(() => null);
    if (actor && can(actor, "workspace.reach", { workspace: chosen })) return chosen;
  }
  // the home workspace may have been paused since the person signed in: a client moves to one it may still reach
  const actor = await loadActor(session.uid).catch(() => null);
  if (actor && session.ws && !can(actor, "workspace.reach", { workspace: session.ws }) && actor.memberships[0]) return actor.memberships[0].workspace_id;
  return session.ws || DEFAULT_WORKSPACE_ID;
}

export function wsCookieHeader(workspaceId: string | null): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return workspaceId ? `${WS_COOKIE}=${workspaceId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}` : `${WS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * The role this request acts as: the chosen one when the workspace offers it, else the
 * workspace's first, resolved for this workspace and person (src/roles/store.ts): Fair's
 * release, the company's changes, the person's own settings.
 */
export async function currentRole(workspaceId?: string): Promise<RoleModel> {
  const jar = await cookies();
  const ws = workspaceId ?? (await currentWorkspaceId());
  const offered = (await getWorkspace(ws).catch(() => null))?.roles ?? ["brand_kol"];
  const chosen = jar.get(ROLE_COOKIE)?.value;
  const session = await currentSession();
  const actor = session ? await loadActor(session.uid).catch(() => null) : null;
  // only the roles this person may use here (a client's levels); the workspace's first when none is chosen
  const allowed = actor ? rolesFor(actor, ws, offered) : offered;
  const roles = allowed.length ? allowed : offered;
  return getRole(ws, isRoleId(chosen) && roles.includes(chosen) ? chosen : roles[0], session?.uid);
}

export function roleCookieHeader(role: string | null): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return role ? `${ROLE_COOKIE}=${role}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}` : `${ROLE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
