/**
 * Setting a new password (8 Oct 2026). Nobody types a password for someone else: Fair makes a
 * one-time link from the CMS (People → "Password link") and sends or copies it to the person, or
 * the person asks for one from the sign-in page ("Forgot your password?"), which goes by email.
 * The link works once; the new password signs out every session from before it (src/auth/live.ts).
 *
 * Who may make a link for someone: Refal or Rafli (staff.manage) for anyone; data ops for a
 * client account, when they look after every workspace it belongs to; anyone for themselves.
 * A Builder sends their Members to "Forgot your password?" instead: a Builder making links could
 * take over an account that reaches other workspaces.
 */
import { createHash, randomBytes } from "node:crypto";
import { sql } from "../db/client";
import { sendEmail } from "../delivery/email";
import { audit } from "../roles/store";
import { hashPassword } from "./password";
import { can, type Actor } from "./can";
import { forgetUser } from "./live";

export const PASSWORD_MIN = 10;
/** a link Fair makes may travel by chat, so it lasts a day; one asked for by email, two hours */
const HOURS = { fair: 24, self: 2 } as const;
/** links a person may ask for in an hour from the sign-in page */
const SELF_PER_HOUR = 3;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

type Target = { id: string; email: string; name: string | null; staff: string[]; workspaces: string[] };

async function target(email: string): Promise<Target | null> {
  const rows = (await sql.query(
    `select a.id, a.email, a.name, a.staff, coalesce(array(select u.workspace_id from users u where u.account_id = a.id), '{}') as workspaces
       from accounts a where a.email = lower($1)`,
    [email.trim()],
  )) as Target[];
  return rows[0] ?? null;
}

/** May this person make a password link for that account? null = yes, else why not. */
export function mayMakeLink(actor: Actor, t: { email: string; staff: string[]; workspaces: string[] }): string | null {
  if (t.email === actor.email) return null;
  if (can(actor, "staff.manage")) return null;
  if (t.staff.length) return "Only Refal or Rafli can make a password link for Fair staff.";
  if (!t.workspaces.length) return "This account belongs to no workspace yet.";
  if (t.workspaces.every((ws) => can(actor, "workspace.builders", { workspace: ws }))) return null;
  return "Only Fair can make a password link for this person.";
}

async function issue(accountId: string, by: string, hours: number): Promise<{ token: string; expires_at: string }> {
  // a new link replaces any the account still had open
  await sql.query("update password_links set expires_at = now() where account_id = $1 and used_at is null and expires_at > now()", [accountId]);
  const token = randomBytes(32).toString("base64url");
  const r = (await sql.query(
    "insert into password_links (account_id, token_hash, created_by, expires_at) values ($1, $2, $3, now() + make_interval(hours => $4)) returning expires_at",
    [accountId, sha256(token), by, hours],
  )) as { expires_at: string }[];
  return { token, expires_at: r[0].expires_at };
}

const linkUrl = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/reset/${token}`;

function mail(to: string, url: string, hours: number, from: string | null) {
  const who = from ? `${from} made you a link to set a new password` : "You asked to set a new password";
  return sendEmail({
    to,
    subject: "Set your Fair Intelligence password",
    html: `<p>${who} for Fair Intelligence.</p><p><a href="${url}">Set a new password</a> (works once, for ${hours} hours).</p><p>If you did not ask for this, ignore this email; your password stays as it is.</p>`,
    text: `${who} for Fair Intelligence.\n\nSet a new password: ${url}\n(works once, for ${hours} hours)\n\nIf you did not ask for this, ignore this email; your password stays as it is.`,
  });
}

/** Fair, from the CMS: a link for someone, emailed when email is set up and always shown to copy. */
export async function createPasswordLink(actor: Actor, email: string, origin: string): Promise<{ ok: true; url: string; expires_at: string; emailed: boolean; email_error?: string } | { ok: false; error: string }> {
  const t = await target(email);
  if (!t) return { ok: false, error: "No account with that email." };
  const refused = mayMakeLink(actor, t);
  if (refused) return { ok: false, error: refused };
  const { token, expires_at } = await issue(t.id, actor.email, HOURS.fair);
  const url = linkUrl(origin, token);
  await audit({ actor: actor.email, area: "people", action: "password_link", path: t.email });
  const sent = await mail(t.email, url, HOURS.fair, actor.name ?? actor.email);
  return sent.ok ? { ok: true, url, expires_at, emailed: true } : { ok: true, url, expires_at, emailed: false, email_error: sent.error };
}

/**
 * The person, from the sign-in page. Says nothing about whether the email has an account (the
 * answer is the same either way); at most three links an hour; the link only goes by email.
 */
export async function requestPasswordLink(email: string, origin: string): Promise<void> {
  const t = await target(email);
  if (!t) return;
  const recent = (await sql.query("select count(*)::int as n from password_links where account_id = $1 and created_by = 'self' and created_at > now() - interval '1 hour'", [t.id])) as { n: number }[];
  if ((recent[0]?.n ?? 0) >= SELF_PER_HOUR) return;
  const { token } = await issue(t.id, "self", HOURS.self);
  await audit({ actor: t.email, area: "people", action: "password_link_requested", path: t.email });
  await mail(t.email, linkUrl(origin, token), HOURS.self, null);
}

/** A link that still works: whose it is. */
export async function readPasswordLink(token: string): Promise<{ email: string; name: string | null } | null> {
  if (!TOKEN.test(token)) return null;
  const rows = (await sql.query(
    "select a.email, a.name from password_links l join accounts a on a.id = l.account_id where l.token_hash = $1 and l.used_at is null and l.expires_at > now()",
    [sha256(token)],
  )) as { email: string; name: string | null }[];
  return rows[0] ?? null;
}

/** Set the new password; the link is spent and every earlier session of the account signs out. */
export async function usePasswordLink(token: string, password: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (!TOKEN.test(token)) return { ok: false, error: "This link has expired or was already used." };
  if ((password ?? "").length < PASSWORD_MIN) return { ok: false, error: `Choose a password of at least ${PASSWORD_MIN} characters.` };
  const claimed = (await sql.query(
    "update password_links set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning account_id",
    [sha256(token)],
  )) as { account_id: string }[];
  if (!claimed.length) return { ok: false, error: "This link has expired or was already used." };
  const acc = (await sql.query("update accounts set password_hash = $2, password_set_at = now() where id = $1 returning email", [claimed[0].account_id, hashPassword(password)])) as { email: string }[];
  await sql.query("update password_links set expires_at = now() where account_id = $1 and used_at is null and expires_at > now()", [claimed[0].account_id]);
  forgetUser();
  await audit({ actor: acc[0].email, area: "people", action: "password_set", path: acc[0].email });
  return { ok: true, email: acc[0].email };
}
