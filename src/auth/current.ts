/** Read the current session and the workspace it acts in, in server components and route handlers. */
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";

/** Owners may act in another workspace; the choice lives in this cookie and is checked against the session's role. */
export const WS_COOKIE = "fi_ws";

export async function currentSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/** The workspace every query in this request is scoped to: the user's own, or the one an owner switched to. */
export async function currentWorkspaceId(): Promise<string> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return DEFAULT_WORKSPACE_ID; // public paths never reach data; the proxy gates everything else
  const chosen = jar.get(WS_COOKIE)?.value;
  if (session.role === "owner" && chosen && /^[a-z0-9-]{1,60}$/.test(chosen)) return chosen;
  return session.ws || DEFAULT_WORKSPACE_ID;
}

export function wsCookieHeader(workspaceId: string | null): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return workspaceId ? `${WS_COOKIE}=${workspaceId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}` : `${WS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
