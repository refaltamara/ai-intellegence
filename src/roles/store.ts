/**
 * Roles as data (CMS plan, phase 1). Fair's versions live in role_versions, a client's
 * changes in company_versions, a person's settings in personal_settings; getRole()
 * resolves the three (src/roles/policy.ts) for one request. With the tables empty, or
 * FI_ROLE_TABLES=off, the constants in src/roles/model.ts are every role's 1.0.
 *
 * Releases (DECISIONS, 4 Oct 2026): every client follows the latest release unless
 * Refal or Rafli pin it; only they release; a role owner may roll a release back. A
 * release never touches what a client built: company changes are re-applied on top.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import type { Duty } from "../config/staff";

/** who acts: an account's email and its Fair duties (src/auth/accounts.ts); checked like can() in src/auth/can.ts */
export type Who = { email: string; staff: readonly Duty[] };
const isOwner = (w: Who) => w.staff.includes("owner");
const isRoleOwner = (w: Who) => isOwner(w) || w.staff.includes("role_owner");
import { ROLES, isRoleId, type RoleId, type RoleModel } from "./model";
import { resolve, sanitize, type Overrides, type Resolved } from "./policy";
import { compareVersions, isVersion } from "./version";

const TTL_MS = 60 * 1000;
type Hit<T> = { at: number; v: T };
const fairCache = new Map<string, Hit<RoleModel | null>>();
const companyCache = new Map<string, Hit<CompanyVersion | null>>();

export function invalidateRoles(): void {
  fairCache.clear();
  companyCache.clear();
}

const tablesOn = () => (process.env.FI_ROLE_TABLES ?? "").trim().toLowerCase() !== "off";

/** a stored spec over the code's own constant, so a field added in code after a release still has its 1.0 value */
export const fromRowSpec = (role: RoleId, spec: unknown, version: string): RoleModel => fromRow(role, spec, version);
function fromRow(role: RoleId, spec: unknown, version: string): RoleModel {
  return { ...ROLES[role], ...(spec as Partial<RoleModel>), id: role, codename: ROLES[role].codename, version };
}


/**
 * Fair's current release of a role, or the named released version; null when none is
 * stored. A staged release (stage_workspaces) is current only in its workspaces until it
 * goes out to everyone; elsewhere the release before it stays current.
 */
export async function fairVersion(role: RoleId, version?: string | null, ws?: string | null): Promise<RoleModel | null> {
  const key = `${role}@${version ?? "current"}@${ws ?? "*"}`;
  const hit = fairCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  const rows = (await sql.query(
    version
      ? "select version, spec from role_versions where role = $1 and version = $2 and status = 'released'"
      : "select version, spec from role_versions where role = $1 and status = 'released' and (stage_workspaces is null or $2::text = any(stage_workspaces)) order by released_at desc limit 1",
    version ? [role, version] : [role, ws ?? null],
  )) as { version: string; spec: unknown }[];
  const v = rows[0] ? fromRow(role, rows[0].spec, rows[0].version) : null;
  fairCache.set(key, { at: Date.now(), v });
  return v;
}

export type CompanyVersion = { version: number; base_version: string | null; overrides: Overrides; author: string | null; note: string | null; created_at: string };

export async function companyVersion(ws: string, role: RoleId): Promise<CompanyVersion | null> {
  const key = `${ws}:${role}`;
  const hit = companyCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  const rows = (await sql.query(
    "select version, base_version, overrides, author, note, created_at from company_versions where workspace_id = $1 and role = $2 order by version desc limit 1",
    [ws, role],
  )) as CompanyVersion[];
  const v = rows[0] ?? null;
  companyCache.set(key, { at: Date.now(), v });
  return v;
}

export async function personalSettings(ws: string, userId: string, role: RoleId): Promise<Overrides | null> {
  const rows = (await sql.query("select settings from personal_settings where workspace_id = $1 and user_id = $2 and role = $3", [ws, userId, role])) as { settings: Overrides }[];
  return rows[0]?.settings ?? null;
}

export type EffectiveRole = Resolved & { company_version: number | null };

/**
 * The role a request runs on: Fair's release (the company's pinned one, else the latest),
 * then the company's changes, then the person's. Never throws: a database error falls
 * back to the constant, so a page always has a role.
 */
export async function getRoleResolved(ws: string, roleId: RoleId, userId?: string | null): Promise<EffectiveRole> {
  const base = ROLES[roleId];
  if (!tablesOn()) return { role: base, dropped: [], company_version: null };
  try {
    const company = await companyVersion(ws, roleId);
    const pinned = company?.base_version ? await fairVersion(roleId, company.base_version) : null;
    const fair = pinned ?? (await fairVersion(roleId, null, ws)) ?? base;
    const personal = userId ? await personalSettings(ws, userId, roleId) : null;
    return { ...resolve(fair, company?.overrides, personal), company_version: company?.version ?? null };
  } catch (e) {
    console.error("[roles] resolve failed, using the built-in role", (e as Error).message);
    return { role: base, dropped: [], company_version: null };
  }
}

export async function getRole(ws: string, roleId: RoleId, userId?: string | null): Promise<RoleModel> {
  return (await getRoleResolved(ws, roleId, userId)).role;
}

// ------------------------------------------------------------------ changes

export async function audit(e: { workspace_id?: string | null; actor: string; area: string; action: string; path?: string | null; old?: unknown; new?: unknown; note?: string | null }): Promise<void> {
  await sql.query("insert into audit_log (workspace_id, actor, area, action, path, old, new, note) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)", [
    e.workspace_id ?? null, e.actor, e.area, e.action, e.path ?? null, e.old === undefined ? null : toJson(e.old), e.new === undefined ? null : toJson(e.new), e.note ?? null,
  ]);
}

/** Seed each role's 1.0 from the constants; a role that already has a version is left alone. */
export async function seedRoles(by = "seed"): Promise<RoleId[]> {
  const added: RoleId[] = [];
  for (const r of Object.values(ROLES)) {
    const rows = (await sql.query(
      "insert into role_versions (role, codename, version, status, spec, release_note, proposed_by, released_by, released_at) select $1, $2, $3, 'released', $4::jsonb, $5, $6, $6, now() where not exists (select 1 from role_versions where role = $1) returning id",
      [r.id, r.codename, r.version, toJson(r), `${r.codename} ${r.version}: the role as built in code.`, by],
    )) as { id: string }[];
    if (rows.length) {
      added.push(r.id);
      await audit({ actor: by, area: "role", action: "seed", path: r.id, new: { version: r.version } });
    }
  }
  invalidateRoles();
  return added;
}

type Result = { ok: true; version: string } | { ok: false; error: string };

/** A new draft of Fair's role: a full spec, a version above every existing one. */
export async function saveDraft(roleId: RoleId, version: string, spec: Partial<RoleModel>, who: Who, note?: string): Promise<Result> {
  if (!isRoleOwner(who)) return { ok: false, error: `${who.email} is not a role owner.` };
  const by = who.email;
  if (!isVersion(version)) return { ok: false, error: "A version reads major.minor, like 1.1." };
  const rows = (await sql.query("select version from role_versions where role = $1", [roleId])) as { version: string }[];
  if (rows.some((r) => compareVersions(r.version, version) >= 0)) return { ok: false, error: `${ROLES[roleId].codename} already has ${version} or a later version.` };
  const full = { ...ROLES[roleId], ...spec, id: roleId, codename: ROLES[roleId].codename, version };
  await sql.query("insert into role_versions (role, codename, version, status, spec, release_note, proposed_by) values ($1, $2, $3, 'draft', $4::jsonb, $5, $6)", [roleId, full.codename, version, toJson(full), note ?? null, by]);
  await audit({ actor: by, area: "role", action: "draft", path: `${roleId}@${version}`, note });
  return { ok: true, version };
}

/** Only Refal or Rafli release; the version becomes current for every client that follows the latest. */
export async function releaseVersion(roleId: RoleId, version: string, who: Who, note?: string, stage?: string[] | null): Promise<Result> {
  const by = who.email;
  if (!isOwner(who)) return { ok: false, error: "Only Refal or Rafli can release a version." };
  const staged = stage?.length ? [...new Set(stage)] : null;
  const rows = (await sql.query(
    "update role_versions set status = 'released', released_by = $3, released_at = now(), release_note = coalesce($4, release_note), stage_workspaces = $5::text[] where role = $1 and version = $2 and status in ('draft','proposed') returning version",
    [roleId, version, by, note ?? null, staged],
  )) as { version: string }[];
  if (!rows.length) return { ok: false, error: `No draft ${ROLES[roleId].codename} ${version} to release.` };
  await audit({ actor: by, area: "role", action: staged ? "release_staged" : "release", path: `${roleId}@${version}`, new: staged ? { workspaces: staged } : undefined, note });
  invalidateRoles();
  return { ok: true, version };
}

/** A staged release goes out to every client that follows the latest. Only Refal or Rafli. */
export async function releaseToAll(roleId: RoleId, version: string, who: Who): Promise<Result> {
  if (!isOwner(who)) return { ok: false, error: "Only Refal or Rafli can release a version." };
  const rows = (await sql.query("update role_versions set stage_workspaces = null where role = $1 and version = $2 and status = 'released' and stage_workspaces is not null returning version", [roleId, version])) as unknown[];
  if (!rows.length) return { ok: false, error: `${ROLES[roleId].codename} ${version} is not a staged release.` };
  await audit({ actor: who.email, area: "role", action: "release_all", path: `${roleId}@${version}` });
  invalidateRoles();
  return { ok: true, version };
}

/** The next minor version after every version a role has, as a draft copied from its current release. */
export async function newDraft(roleId: RoleId, who: Who, note?: string): Promise<Result> {
  const rows = (await sql.query("select version from role_versions where role = $1", [roleId])) as { version: string }[];
  const top = rows.map((r) => r.version).sort(compareVersions).at(-1) ?? "1.0";
  const [major, minor] = top.split(".").map(Number);
  const current = (await fairVersion(roleId)) ?? ROLES[roleId];
  return saveDraft(roleId, `${major}.${minor + 1}`, current, who, note);
}

/** The fields of Fair's role a draft may change here (identity and nav stay with code changes). */
export const DRAFT_FIELDS = ["voice", "hero_title", "hero_intro", "suggested", "recipes", "deck_templates", "skill_order", "alert", "watch", "description"] as const;
export type DraftPatch = Partial<Pick<RoleModel, (typeof DRAFT_FIELDS)[number]>>;

/** Change a draft (or a proposal, which goes back to draft): only the listed fields, by a role owner. */
export async function updateDraft(roleId: RoleId, version: string, patch: DraftPatch, who: Who): Promise<Result> {
  if (!isRoleOwner(who)) return { ok: false, error: `${who.email} is not a role owner.` };
  const rows = (await sql.query("select spec from role_versions where role = $1 and version = $2 and status in ('draft','proposed')", [roleId, version])) as { spec: RoleModel }[];
  if (!rows[0]) return { ok: false, error: `No draft ${ROLES[roleId].codename} ${version}.` };
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => (DRAFT_FIELDS as readonly string[]).includes(k)));
  const spec = { ...rows[0].spec, ...clean };
  await sql.query("update role_versions set spec = $3::jsonb, status = 'draft', test_summary = null, updated_at = now() where role = $1 and version = $2", [roleId, version, toJson(spec)]);
  await audit({ actor: who.email, area: "role", action: "edit", path: `${roleId}@${version}`, new: Object.keys(clean) });
  return { ok: true, version };
}

/** A draft's spec as stored, over the code's constant */
export async function draftSpec(roleId: RoleId, version: string): Promise<(RoleModel & { _status: string; _updated_at: string; _note: string | null; _stage: string[] | null }) | null> {
  const rows = (await sql.query("select spec, status, updated_at, release_note, stage_workspaces from role_versions where role = $1 and version = $2", [roleId, version])) as { spec: unknown; status: string; updated_at: string; release_note: string | null; stage_workspaces: string[] | null }[];
  return rows[0] ? { ...fromRow(roleId, rows[0].spec, version), _status: rows[0].status, _updated_at: rows[0].updated_at, _note: rows[0].release_note, _stage: rows[0].stage_workspaces } : null;
}

/** A role owner proposes a draft for release with its test summary and release note. */
export async function proposeVersion(roleId: RoleId, version: string, summary: unknown, note: string, who: Who): Promise<Result> {
  if (!isRoleOwner(who)) return { ok: false, error: `${who.email} is not a role owner.` };
  const rows = (await sql.query("update role_versions set status = 'proposed', test_summary = $3::jsonb, release_note = $4 where role = $1 and version = $2 and status = 'draft' returning version", [roleId, version, toJson(summary), note])) as unknown[];
  if (!rows.length) return { ok: false, error: `No draft ${ROLES[roleId].codename} ${version} to propose.` };
  await audit({ actor: who.email, area: "role", action: "propose", path: `${roleId}@${version}`, note });
  return { ok: true, version };
}

/**
 * Roll the current release back: clients on it return to the release before it, with
 * their own changes intact. A role owner may do it without approval, since it only
 * returns to something already released. The first release cannot be rolled back.
 */
export async function rollbackRole(roleId: RoleId, who: Who, note?: string): Promise<Result> {
  const by = who.email;
  if (!isRoleOwner(who)) return { ok: false, error: `${by} cannot roll a role back.` };
  const rows = (await sql.query("select version from role_versions where role = $1 and status = 'released' order by released_at desc limit 2", [roleId])) as { version: string }[];
  if (rows.length < 2) return { ok: false, error: `${ROLES[roleId].codename} has no earlier release to return to.` };
  await sql.query("update role_versions set status = 'rolled_back', rolled_back_by = $3, rolled_back_at = now() where role = $1 and version = $2", [roleId, rows[0].version, by]);
  await audit({ actor: by, area: "role", action: "rollback", path: `${roleId}@${rows[0].version}`, new: { current: rows[1].version }, note });
  invalidateRoles();
  return { ok: true, version: rows[1].version };
}

/**
 * Save a company's changes as its next version. Only what the company layer may change
 * is kept (src/roles/policy.ts); the rest of its earlier changes carry over unless
 * `replace` is set. Returns what was dropped.
 */
export async function setCompanyChanges(ws: string, roleId: RoleId, changes: Overrides, author: string, note?: string, opts: { replace?: boolean } = {}): Promise<{ version: number; dropped: string[] }> {
  const prev = await companyVersion(ws, roleId);
  const fair = (await fairVersion(roleId)) ?? ROLES[roleId];
  const kept = sanitize(changes, "company", fair);
  const dropped = Object.keys(changes).filter((k) => changes[k] !== null && !(k in kept));
  const overrides = { ...(opts.replace ? {} : prev?.overrides ?? {}), ...kept };
  for (const [k, v] of Object.entries(changes)) if (v === null) delete overrides[k];
  const version = (prev?.version ?? 0) + 1;
  await sql.query("insert into company_versions (workspace_id, role, version, base_version, overrides, author, note) values ($1, $2, $3, $4, $5::jsonb, $6, $7)", [
    ws, roleId, version, prev?.base_version ?? null, toJson(overrides), author, note ?? null,
  ]);
  await audit({ workspace_id: ws, actor: author, area: "company", action: "change", path: roleId, old: prev?.overrides ?? {}, new: overrides, note });
  companyCache.delete(`${ws}:${roleId}`);
  return { version, dropped };
}

/** Pin a client to a released version, or null to follow the latest again. Only Refal or Rafli. */
export async function pinCompany(ws: string, roleId: RoleId, version: string | null, who: Who): Promise<Result> {
  const by = who.email;
  if (!isOwner(who)) return { ok: false, error: "Only Refal or Rafli can pin a client to a version." };
  if (version && !(await fairVersion(roleId, version))) return { ok: false, error: `${ROLES[roleId].codename} ${version} is not a released version.` };
  const prev = await companyVersion(ws, roleId);
  const next = (prev?.version ?? 0) + 1;
  await sql.query("insert into company_versions (workspace_id, role, version, base_version, overrides, author, note) values ($1, $2, $3, $4, $5::jsonb, $6, $7)", [
    ws, roleId, next, version, toJson(prev?.overrides ?? {}), by, version ? `pinned to ${version}` : "follows the latest",
  ]);
  await audit({ workspace_id: ws, actor: by, area: "company", action: version ? "pin" : "unpin", path: roleId, old: prev?.base_version ?? null, new: version });
  companyCache.delete(`${ws}:${roleId}`);
  return { ok: true, version: version ?? "latest" };
}

/** A person's own settings; only member-editable fields are kept. */
export async function setPersonal(ws: string, userId: string, roleId: RoleId, settings: Overrides): Promise<Overrides> {
  const fair = (await fairVersion(roleId)) ?? ROLES[roleId];
  const kept = sanitize(settings, "member", fair);
  await sql.query(
    "insert into personal_settings (workspace_id, user_id, role, settings) values ($1, $2, $3, $4::jsonb) on conflict (workspace_id, user_id, role) do update set settings = personal_settings.settings || excluded.settings, updated_at = now()",
    [ws, userId, roleId, toJson(kept)],
  );
  return kept;
}

/** Fair's versions of a role, newest first, for the CLI and later the CMS. */
export async function roleHistory(roleId: RoleId): Promise<{ version: string; status: string; release_note: string | null; released_by: string | null; released_at: string | null; rolled_back_by: string | null }[]> {
  return (await sql.query(
    "select version, status, release_note, released_by, released_at, rolled_back_by from role_versions where role = $1 order by created_at desc",
    [roleId],
  )) as never;
}

export { isRoleId };
