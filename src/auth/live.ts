/**
 * Is this account still there, and what may it do now? A signed cookie proves who
 * someone was when they signed in; this checks the users table so a removed account
 * or a changed role takes effect within half a minute, not when the cookie expires.
 */
import { sql } from "../db/client";

export type LiveUser = { id: string; email: string; role: string; workspace_id: string };

const TTL_MS = 30 * 1000;
const cache = new Map<string, { at: number; user: LiveUser | null }>();

export async function liveUser(uid: string): Promise<LiveUser | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) return null;
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.user;
  const rows = (await sql.query("select id, email, role, workspace_id from users where id = $1 and password_hash is not null", [uid])) as LiveUser[];
  const user = rows[0] ?? null;
  cache.set(uid, { at: Date.now(), user });
  return user;
}

/** For the request gate: a database hiccup must not lock everyone out, so only a definite "gone" says no. */
export async function stillActive(uid: string): Promise<boolean> {
  try {
    return (await liveUser(uid)) != null;
  } catch {
    return true;
  }
}

export function forgetUser(uid?: string): void {
  if (uid) cache.delete(uid);
  else cache.clear();
}
