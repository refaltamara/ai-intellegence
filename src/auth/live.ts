/**
 * Is this membership still there, and its account? A signed cookie proves who someone
 * was when they signed in; this checks users and accounts so a removed person or a
 * changed duty takes effect within half a minute, not when the cookie expires.
 * role is "staff" for Fair staff, else "member"; what a person may do is can() (src/auth/can.ts).
 */
import { sql } from "../db/client";
import { forgetActors } from "./accounts";

export type LiveUser = { id: string; email: string; role: string; workspace_id: string };

const TTL_MS = 30 * 1000;
const cache = new Map<string, { at: number; user: LiveUser | null }>();

export async function liveUser(uid: string): Promise<LiveUser | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) return null;
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.user;
  const rows = (await sql.query("select u.id, a.email, case when cardinality(a.staff) > 0 then 'staff' else 'member' end as role, u.workspace_id from users u join accounts a on a.id = u.account_id where u.id = $1 and a.password_hash is not null", [uid])) as LiveUser[];
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
  forgetActors();
}
