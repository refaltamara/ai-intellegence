/**
 * Invitations (CMS plan, People and access). Data ops invites a client's first Builder at
 * go-live; Builders invite Members; Refal or Rafli invite Fair staff. An invite names a
 * workspace and the level per role; it lasts seven days and is used once. The link goes
 * by email (Resend) when email is configured; the person inviting can always copy it.
 */
import { createHash, randomBytes } from "node:crypto";
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { sendEmail } from "../delivery/email";
import { DUTY_LABEL, isDuty, type Duty } from "../config/staff";
import { ROLES, isRoleId, type RoleId } from "../roles/model";
import { getWorkspace } from "../workspace/store";
import { can, isLevel, type Actor, type Level } from "./can";
import { ensureMember, findAccount } from "./accounts";
import { audit } from "../roles/store";

const DAYS = 7;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type InviteRow = { id: string; workspace_id: string; email: string; name: string | null; levels: Partial<Record<RoleId, Level>>; staff: Duty[]; invited_by: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string };

export type InviteInput = { workspace_id: string; email: string; name?: string | null; levels: Partial<Record<RoleId, Level>>; staff?: Duty[] };

/** May this person send this invite? Members by a Builder of the workspace, Builders by owners or data ops, Fair staff by owners. */
export function mayInvite(actor: Actor, input: InviteInput): string | null {
  const ws = { workspace: input.workspace_id };
  if (input.staff?.length && !can(actor, "staff.manage")) return "Only Refal or Rafli can invite Fair staff.";
  if (Object.values(input.levels).includes("builder") && !can(actor, "workspace.builders", ws)) return "Only Fair can make someone a Builder.";
  if (!can(actor, "team.manage", ws)) return "You can't invite people to this workspace.";
  return null;
}

/** The levels an invite may carry: only roles the workspace offers, and for a client only roles the inviter may use there. */
async function cleanLevels(actor: Actor, ws: string, levels: Record<string, unknown>): Promise<Partial<Record<RoleId, Level>>> {
  const offered = (await getWorkspace(ws))?.roles ?? [];
  return Object.fromEntries(
    Object.entries(levels).filter(([r, l]) => isRoleId(r) && offered.includes(r) && isLevel(l) && can(actor, "role.use", { workspace: ws, role: r })),
  ) as Partial<Record<RoleId, Level>>;
}

export async function createInvite(actor: Actor, raw: InviteInput, origin: string): Promise<{ ok: true; url: string; emailed: boolean; email_error?: string } | { ok: false; error: string }> {
  const email = raw.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: "That is not an email address." };
  const cfg = await getWorkspace(raw.workspace_id);
  if (!cfg) return { ok: false, error: "Unknown workspace." };
  if (!can(actor, "team.manage", { workspace: raw.workspace_id })) return { ok: false, error: "You can't invite people to this workspace." };
  const levels = await cleanLevels(actor, raw.workspace_id, raw.levels as Record<string, unknown>);
  const staff = (raw.staff ?? []).filter(isDuty);
  if (!Object.keys(levels).length && !staff.length) return { ok: false, error: "Pick at least one team for them." };
  const input = { ...raw, email, levels, staff };
  const refused = mayInvite(actor, input);
  if (refused) return { ok: false, error: refused };
  const token = randomBytes(32).toString("base64url");
  await sql.query("update invites set revoked_at = now() where workspace_id = $1 and email = $2 and accepted_at is null and revoked_at is null", [raw.workspace_id, email]);
  await sql.query(
    "insert into invites (workspace_id, email, name, levels, staff, token_hash, invited_by, expires_at) values ($1, $2, $3, $4::jsonb, $5::text[], $6, $7, now() + make_interval(days => $8))",
    [raw.workspace_id, email, raw.name?.trim() || null, toJson(levels), staff, sha256(token), actor.email, DAYS],
  );
  await audit({ workspace_id: raw.workspace_id, actor: actor.email, area: "people", action: "invite", path: email, new: { levels, staff } });
  const url = `${origin.replace(/\/$/, "")}/invite/${token}`;
  const teams = Object.entries(levels).map(([r, l]) => `${ROLES[r as RoleId].label} (${l === "builder" ? "Builder" : "Member"})`);
  const what = [...teams, ...staff.map((d) => `Fair ${DUTY_LABEL[d]}`)].join(", ");
  const sent = await sendEmail({
    to: email,
    subject: `${actor.name ?? actor.email} invited you to ${cfg.name} on Fair Intelligence`,
    html: `<p>${actor.name ?? actor.email} invited you to <b>${cfg.name}</b> on Fair Intelligence: ${what}.</p><p><a href="${url}">Accept the invitation</a> (valid for ${DAYS} days).</p>`,
    text: `${actor.name ?? actor.email} invited you to ${cfg.name} on Fair Intelligence: ${what}.\n\nAccept: ${url}\n(valid for ${DAYS} days)`,
  });
  return sent.ok ? { ok: true, url, emailed: true } : { ok: true, url, emailed: false, email_error: sent.error };
}

/** A usable invite, with whether its email already has an account (then no new password is asked). */
export async function readInvite(token: string): Promise<(InviteRow & { workspace_name: string; has_account: boolean }) | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const rows = (await sql.query(
    "select i.*, w.name as workspace_name from invites i join workspaces w on w.id = i.workspace_id where i.token_hash = $1 and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()",
    [sha256(token)],
  )) as (InviteRow & { workspace_name: string })[];
  if (!rows[0]) return null;
  const acc = await findAccount(rows[0].email);
  return { ...rows[0], has_account: !!acc?.password_hash };
}

/**
 * Accept: a new person sets a name and password; someone who already has an account just
 * gains the membership (they sign in with their own password). Returns the membership
 * the session should start in.
 */
export async function acceptInvite(token: string, o: { name?: string; password?: string }): Promise<{ ok: true; user_id: string; email: string; workspace_id: string; staff: boolean } | { ok: false; error: string }> {
  const inv = await readInvite(token);
  if (!inv) return { ok: false, error: "This invitation has expired or was already used." };
  if (!inv.has_account && (o.password ?? "").length < 10) return { ok: false, error: "Choose a password of at least 10 characters." };
  const claimed = (await sql.query("update invites set accepted_at = now() where id = $1 and accepted_at is null returning id", [inv.id])) as unknown[];
  if (!claimed.length) return { ok: false, error: "This invitation was already used." };
  const existing = (await sql.query("select u.levels from users u join accounts a on a.id = u.account_id where a.email = $1 and u.workspace_id = $2", [inv.email, inv.workspace_id])) as { levels: Partial<Record<RoleId, Level>> }[];
  const levels = { ...(existing[0]?.levels ?? {}), ...inv.levels };
  const m = await ensureMember({ email: inv.email, name: o.name?.trim() || inv.name, workspaceId: inv.workspace_id, levels, password: inv.has_account ? undefined : o.password, staff: inv.staff, invitedBy: inv.invited_by });
  await sql.query("update accounts set last_seen_at = now() where id = $1", [m.account_id]);
  await audit({ workspace_id: inv.workspace_id, actor: inv.email, area: "people", action: "accept", path: inv.email, new: { levels, staff: inv.staff } });
  return { ok: true, user_id: m.user_id, email: inv.email, workspace_id: inv.workspace_id, staff: inv.staff.length > 0 };
}

export async function listInvites(ws?: string): Promise<(InviteRow & { workspace_name: string })[]> {
  return (await sql.query(
    `select i.*, w.name as workspace_name from invites i join workspaces w on w.id = i.workspace_id
      where i.accepted_at is null and i.revoked_at is null and i.expires_at > now() ${ws ? "and i.workspace_id = $1" : ""} order by i.created_at desc`,
    ws ? [ws] : [],
  )) as never;
}

export async function revokeInvite(actor: Actor, id: string): Promise<boolean> {
  const rows = (await sql.query("select workspace_id, email, levels, staff from invites where id = $1 and accepted_at is null and revoked_at is null", [id])) as InviteRow[];
  const inv = rows[0];
  if (!inv || mayInvite(actor, { workspace_id: inv.workspace_id, email: inv.email, levels: inv.levels, staff: inv.staff })) return false;
  await sql.query("update invites set revoked_at = now() where id = $1", [id]);
  await audit({ workspace_id: inv.workspace_id, actor: actor.email, area: "people", action: "revoke", path: inv.email });
  return true;
}
