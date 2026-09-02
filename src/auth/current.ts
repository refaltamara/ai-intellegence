/** Read the current session in server components and route handlers. */
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";

export async function currentSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}
