/**
 * Accounts and memberships (CMS plan, phase 2). An account is a person: one email, one
 * password, Fair duties when they are staff. A membership (a users row) is that person
 * in one workspace, with a level per role. Sign-in is by account; the session keeps the
 * membership it signed in with, so everything already pointing at users stays put.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { STAFF_DOMAIN, STAFF_SEED, isDuty, type Duty } from "../config/staff";
import { getWorkspace } from "../workspace/store";
import type { RoleId } from "../roles/model";
import { hashPassword, verifyPassword } from "./password";
import { isLevel, type Actor, type Level, type Membership } from "./can";

export type AccountRow = { id: string; email: string; name: string | null; password_hash: string | null; staff: Duty[]; last_seen_at: string | null; created_at: string };

const TTL_MS = 30 * 1000;
const actorCache = new Map<string, { at: number; actor: Actor | null }>();

export function forgetActors(): void {
  actorCache.clear();
}

const cleanLevels = (v: unknown): Partial<Record<RoleId, Level>> =>
  Object.fromEntries(Object.entries((v ?? {}) as Record<string, unknown>).filter(([, l]) => isLevel(l))) as Partial<Record<RoleId, Level>>;

/** The person behind a session's membership, with every workspace they belong to. Null when the membership or the account is gone. */
export async function loadActor(uid: string): Promise<Actor | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) return null;
  const hit = actorCache.get(uid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.actor;
  const rows = (await sql.query(
    `select u.id as uid, u.workspace_id as home, a.id as account_id, a.email, a.name, a.staff,
            (select coalesce(json_agg(json_build_object('user_id', m.id, 'workspace_id', m.workspace_id, 'levels', m.levels) order by m.created_at), '[]') from users m join workspaces w on w.id = m.workspace_id
               -- a client reaches only live workspaces (CMS plan, Workspace lifecycle); Fair staff reach every one
               where m.account_id = a.id and (w.status = 'live' or cardinality(a.staff) > 0)
                 and not (jsonb_typeof(w.settings->'restricted_to') = 'array' and jsonb_array_length(w.settings->'restricted_to') > 0 and not (w.settings->'restricted_to' ? a.email))) as memberships,
            -- a workspace restricted to named people is closed to everyone else, Fair staff included
            (select coalesce(array_agg(w.id order by w.id), '{}') from workspaces w
               where jsonb_typeof(w.settings->'restricted_to') = 'array' and jsonb_array_length(w.settings->'restricted_to') > 0 and not (w.settings->'restricted_to' ? a.email)) as hidden
       from users u join accounts a on a.id = u.account_id
      where u.id = $1 and a.password_hash is not null`,
    [uid],
  )) as { uid: string; home: string; account_id: string; email: string; name: string | null; staff: string[]; memberships: Membership[]; hidden: string[] }[];
  const r = rows[0];
  const actor: Actor | null = r
    ? { uid: r.uid, home: r.home, account_id: r.account_id, email: r.email, name: r.name, staff: (r.staff ?? []).filter(isDuty), memberships: r.memberships.map((m) => ({ ...m, levels: cleanLevels(m.levels) })), hidden: r.hidden ?? [] }
    : null;
  actorCache.set(uid, { at: Date.now(), actor });
  return actor;
}

export async function findAccount(email: string): Promise<AccountRow | null> {
  const rows = (await sql.query("select * from accounts where email = lower($1)", [email.trim()])) as AccountRow[];
  return rows[0] ?? null;
}

/** "rafli", "Rafli" or "rafli@fair-indonesia.com": the account, when exactly one matches */
export async function findAccountByWho(who: string): Promise<AccountRow | null> {
  const w = who.trim().toLowerCase();
  const rows = (await sql.query(w.includes("@") ? "select * from accounts where email = $1" : "select * from accounts where split_part(email, '@', 1) = $1", [w])) as AccountRow[];
  return rows.length === 1 ? rows[0] : null;
}

/** Sign-in: the account and the membership the session starts in (the first one it was given). */
export async function authenticateAccount(email: string, password: string): Promise<{ account: AccountRow; membership: { id: string; workspace_id: string } | null } | null> {
  const account = await findAccount(email);
  if (!account || !verifyPassword(password, account.password_hash)) return null;
  // the first membership the person may reach: a client's workspace must be live
  const m = (await sql.query("select u.id, u.workspace_id from users u join workspaces w on w.id = u.workspace_id where u.account_id = $1 and (w.status = 'live' or cardinality($2::text[]) > 0) order by u.created_at limit 1", [account.id, account.staff ?? []])) as { id: string; workspace_id: string }[];
  if (!m[0]) return { account, membership: null };
  await sql.query("update accounts set last_seen_at = now() where id = $1", [account.id]).catch(() => undefined);
  return { account, membership: m[0] };
}

/** every role the workspace offers, at one level */
async function allRoles(ws: string, level: Level): Promise<Partial<Record<RoleId, Level>>> {
  const cfg = await getWorkspace(ws);
  return Object.fromEntries((cfg?.roles ?? ["brand_kol"]).map((r) => [r, level]));
}

/**
 * Create the account when it is new, then its membership in a workspace (or update the
 * levels of the one it has). The password is set only when given.
 */
export async function ensureMember(o: { email: string; name?: string | null; workspaceId: string; levels?: Partial<Record<RoleId, Level>>; password?: string; staff?: Duty[]; invitedBy?: string | null }): Promise<{ account_id: string; user_id: string }> {
  const email = o.email.trim().toLowerCase();
  const acc = (await sql.query(
    `insert into accounts (email, name, password_hash, password_set_at, staff) values ($1, $2, $3, case when $3::text is null then null else now() end, $4::text[])
     on conflict (email) do update set name = coalesce(accounts.name, excluded.name), password_hash = coalesce(excluded.password_hash, accounts.password_hash),
       password_set_at = case when excluded.password_hash is null then accounts.password_set_at else now() end,
       staff = (select array(select distinct unnest(accounts.staff || excluded.staff)))
     returning id`,
    [email, o.name ?? null, o.password ? hashPassword(o.password) : null, o.staff ?? []],
  )) as { id: string }[];
  const levels = o.levels && Object.keys(o.levels).length ? o.levels : await allRoles(o.workspaceId, "member");
  const m = (await sql.query(
    `insert into users (workspace_id, email, name, role, account_id, levels, invited_by) values ($1, $2, $3, 'member', $4, $5::jsonb, $6)
     on conflict (workspace_id, email) do update set account_id = excluded.account_id, levels = excluded.levels, name = coalesce(users.name, excluded.name)
     returning id`,
    [o.workspaceId, email, o.name ?? null, acc[0].id, toJson(levels), o.invitedBy ?? null],
  )) as { id: string }[];
  forgetActors();
  return { account_id: acc[0].id, user_id: m[0].id };
}

/**
 * Existing sign-ins become accounts (idempotent; run by `pnpm db:migrate`). One account per
 * email with the password of its owner row; Fair duties from the seed (src/config/staff.ts);
 * every membership gets every role of its workspace, Builder for Fair staff, Member for the rest.
 */
export async function migrateAccounts(): Promise<{ accounts: number; memberships: number }> {
  const pending = (await sql.query(
    "select id, workspace_id, lower(email) as email, name, role, password_hash from users where account_id is null order by (role = 'owner') desc, created_at",
  )) as { id: string; workspace_id: string; email: string; name: string | null; role: string; password_hash: string | null }[];
  let accounts = 0;
  for (const u of pending) {
    const local = u.email.split("@")[0];
    const staff = u.email.endsWith(`@${STAFF_DOMAIN}`) ? STAFF_SEED[local] ?? [] : [];
    const acc = (await sql.query(
      `insert into accounts (email, name, password_hash, staff) values ($1, $2, $3, $4::text[])
       on conflict (email) do update set password_hash = coalesce(accounts.password_hash, excluded.password_hash), name = coalesce(accounts.name, excluded.name)
       returning id, (xmax = 0) as created`,
      [u.email, u.name, u.password_hash, staff],
    )) as { id: string; created: boolean }[];
    if (acc[0].created) accounts++;
    const levels = await allRoles(u.workspace_id, staff.length ? "builder" : "member");
    await sql.query("update users set account_id = $2, levels = case when levels = '{}'::jsonb then $3::jsonb else levels end where id = $1", [u.id, acc[0].id, toJson(levels)]);
  }
  forgetActors();
  return { accounts, memberships: pending.length };
}

// ---------------------------------------------------------------- people

export type MemberRow = { user_id: string; account_id: string; email: string; name: string | null; levels: Partial<Record<RoleId, Level>>; staff: Duty[]; invited_by: string | null; last_seen_at: string | null; created_at: string };

export async function listMembers(ws: string): Promise<MemberRow[]> {
  const rows = (await sql.query(
    `select u.id as user_id, a.id as account_id, a.email, coalesce(a.name, u.name) as name, u.levels, a.staff, u.invited_by, a.last_seen_at, u.created_at
       from users u join accounts a on a.id = u.account_id where u.workspace_id = $1 order by u.created_at`,
    [ws],
  )) as MemberRow[];
  return rows.map((r) => ({ ...r, levels: cleanLevels(r.levels), staff: (r.staff ?? []).filter(isDuty) }));
}

export async function listStaff(): Promise<(AccountRow & { home: string | null })[]> {
  return (await sql.query(
    "select a.*, (select u.workspace_id from users u where u.account_id = a.id order by u.created_at limit 1) as home from accounts a where cardinality(a.staff) > 0 order by a.created_at",
  )) as never;
}

export async function listAccounts(): Promise<(Omit<AccountRow, "password_hash"> & { workspaces: string[] })[]> {
  return (await sql.query(
    "select a.id, a.email, a.name, a.staff, a.last_seen_at, a.created_at, coalesce(array(select u.workspace_id from users u where u.account_id = a.id order by u.created_at), '{}') as workspaces from accounts a order by a.created_at",
  )) as never;
}

export async function setLevels(ws: string, userId: string, levels: Partial<Record<RoleId, Level>>): Promise<boolean> {
  const rows = (await sql.query("update users set levels = $3::jsonb where id = $2 and workspace_id = $1 returning id", [ws, userId, toJson(cleanLevels(levels))])) as unknown[];
  forgetActors();
  return rows.length > 0;
}

/** Take someone out of a workspace: their chats and decks stay, detached; an account with no workspace left is removed. */
export async function removeMember(ws: string, userId: string): Promise<boolean> {
  const rows = (await sql.query("select account_id from users where id = $1 and workspace_id = $2", [userId, ws])) as { account_id: string | null }[];
  if (!rows[0]) return false;
  for (const t of ["conversations", "agents", "decks", "pulses", "decisions", "attachments", "exports", "mcp_calls"]) await sql.query(`update ${t} set user_id = null where user_id = $1`, [userId]);
  await sql.query("delete from users where id = $1", [userId]);
  if (rows[0].account_id) await sql.query("delete from accounts a where a.id = $1 and cardinality(a.staff) = 0 and not exists (select 1 from users u where u.account_id = a.id)", [rows[0].account_id]);
  forgetActors();
  return true;
}

export async function setStaff(accountId: string, staff: Duty[]): Promise<boolean> {
  const rows = (await sql.query("update accounts set staff = $2::text[] where id = $1 returning id", [accountId, [...new Set(staff.filter(isDuty))]])) as unknown[];
  forgetActors();
  return rows.length > 0;
}

export async function setAccountPassword(email: string, password: string): Promise<boolean> {
  // sessions signed in before this stop passing the request gate (src/auth/live.ts)
  const rows = (await sql.query("update accounts set password_hash = $2, password_set_at = now() where email = lower($1) returning id", [email.trim(), hashPassword(password)])) as unknown[];
  forgetActors();
  return rows.length > 0;
}
