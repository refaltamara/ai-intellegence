/**
 * The company version of a role, from the client side (CMS plan, "The Builder"): preview a
 * change, apply it, see every change with who made it, undo one, suggest one to Fair. CeMO
 * in Builder mode only proposes; applying is this server call, which checks the person's
 * level and the field's guard rails (src/roles/policy.ts) whatever the request says.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import type { Actor } from "../auth/can";
import { ROLES, type RoleId, type RoleModel } from "../roles/model";
import { POLICY_HELP, allowed, resolve, valueAt, type Overrides } from "../roles/policy";
import { audit, companyVersion, fairVersion, setCompanyChanges } from "../roles/store";
import { isBuilder } from "./creations";
import { by, signal } from "../learning/signals";

export type ChangeLine = { path: string; label: string; from: unknown; to: unknown };
export type Preview = { lines: ChangeLine[]; dropped: { path: string; label: string; why: string }[]; note?: string };

const label = (p: string) => POLICY_HELP[p]?.label ?? p;

/** The Fair release this workspace runs (its pin, or the latest it follows). */
async function fairFor(ws: string, role: RoleId): Promise<RoleModel> {
  const company = await companyVersion(ws, role);
  return (company?.base_version ? await fairVersion(role, company.base_version) : null) ?? (await fairVersion(role, null, ws)) ?? ROLES[role];
}

/**
 * What a change would do, field by field, against what the team sees now. A value of null
 * returns the field to Fair's. Locked fields and values outside the guard rails come back
 * in `dropped` with the reason, so CeMO can say so plainly.
 */
export async function previewChange(ws: string, role: RoleId, changes: Overrides): Promise<Preview> {
  const fair = await fairFor(ws, role);
  const company = await companyVersion(ws, role);
  const before = resolve(fair, company?.overrides).role;
  const merged: Overrides = { ...(company?.overrides ?? {}) };
  const dropped: Preview["dropped"] = [];
  for (const [p, v] of Object.entries(changes)) {
    if (!allowed(p, "company")) { dropped.push({ path: p, label: label(p), why: "Fair keeps this part the same for every client." }); continue; }
    if (v === null) delete merged[p];
    else merged[p] = v;
  }
  const after = resolve(fair, merged);
  for (const d of after.dropped) {
    if (d.layer === "company" && d.path in changes && changes[d.path] !== null && !dropped.some((x) => x.path === d.path)) {
      dropped.push({ path: d.path, label: label(d.path), why: d.why === "locked" ? "This team's role has no such setting." : `Outside its guard rails (${POLICY_HELP[d.path]?.range ?? "not allowed"}).` });
    }
  }
  const lines: ChangeLine[] = [];
  for (const p of Object.keys(changes)) {
    if (dropped.some((d) => d.path === p)) continue;
    const from = valueAt(before, p);
    const to = valueAt(after.role, p);
    if (JSON.stringify(from) !== JSON.stringify(to)) lines.push({ path: p, label: label(p), from, to });
  }
  return { lines, dropped };
}

/** Apply a change for everyone on the team. Only a Builder (or Fair's owners and data ops). */
export async function applyChange(actor: Actor, ws: string, role: RoleId, changes: Overrides, note?: string | null): Promise<{ ok: true; version: number; preview: Preview } | { ok: false; error: string }> {
  if (!isBuilder(actor, ws, role)) return { ok: false, error: "Only a Builder changes the team's version." };
  const preview = await previewChange(ws, role, changes);
  if (!preview.lines.length) return { ok: false, error: preview.dropped.length ? preview.dropped.map((d) => `${d.label}: ${d.why}`).join(" ") : "Nothing would change." };
  const keep = Object.fromEntries(preview.lines.map((l) => [l.path, changes[l.path]]));
  const r = await setCompanyChanges(ws, role, keep, actor.email, note ?? undefined);
  for (const l of preview.lines) await signal(by(actor, ws, role), "setting.changed", { path: l.path, value: changes[l.path], reset: changes[l.path] === null });
  return { ok: true, version: r.version, preview };
}

export type HistoryRow = { version: number; author: string | null; note: string | null; created_at: string; base_version: string | null; lines: ChangeLine[]; undone_by?: number };

/** Every company version of this team, newest first, each with the fields it changed. */
export async function companyHistory(ws: string, role: RoleId): Promise<HistoryRow[]> {
  const rows = (await sql.query("select version, base_version, overrides, author, note, created_at from company_versions where workspace_id = $1 and role = $2 order by version", [ws, role])) as { version: number; base_version: string | null; overrides: Overrides; author: string | null; note: string | null; created_at: string }[];
  const out: HistoryRow[] = [];
  let prev: Overrides = {};
  for (const r of rows) {
    const paths = [...new Set([...Object.keys(prev), ...Object.keys(r.overrides)])].filter((p) => JSON.stringify(prev[p]) !== JSON.stringify(r.overrides[p]));
    out.push({ version: r.version, author: r.author, note: r.note, created_at: r.created_at, base_version: r.base_version, lines: paths.map((p) => ({ path: p, label: label(p), from: prev[p] ?? null, to: r.overrides[p] ?? null })) });
    prev = r.overrides;
  }
  for (const h of out) {
    const m = /^undo v(\d+)/.exec(h.note ?? "");
    if (m) { const t = out.find((x) => x.version === Number(m[1])); if (t) t.undone_by = h.version; }
  }
  return out.reverse();
}

/** Undo one company version: the fields it changed go back to what they were before it; later changes to other fields stay. */
export async function undoVersion(actor: Actor, ws: string, role: RoleId, version: number): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  if (!isBuilder(actor, ws, role)) return { ok: false, error: "Only a Builder undoes a change." };
  const hist = await companyHistory(ws, role);
  const h = hist.find((x) => x.version === version);
  if (!h || !h.lines.length) return { ok: false, error: "Nothing to undo there." };
  const back: Overrides = Object.fromEntries(h.lines.map((l) => [l.path, l.from]));
  const r = await setCompanyChanges(ws, role, back, actor.email, `undo v${version}`);
  for (const l of h.lines) await signal(by(actor, ws, role), "setting.undone", { path: l.path });
  return { ok: true, version: r.version };
}

/** What Fair's role does where it sets no value of its own (the crisis bar follows the issue level, every section shows). */
export function fairShown(fair: RoleModel, path: string): unknown {
  const v = valueAt(fair, path);
  if (v !== undefined) return v;
  if (path === "alert.crisis_multiple" && fair.alert) return `${Math.round(fair.alert.negative_multiple * 1.5 * 100) / 100} (1.5× the issue level)`;
  if (path === "alert.crisis_min_negative" && fair.alert) return `${fair.alert.min_comments} (the comment floor)`;
  if (path === "tiles.hidden") return "none";
  if (path === "tiles.order") return "Fair's order";
  if (path === "tiles.names") return "Fair's names";
  return null;
}

/** The company's changes now, each with Fair's value beside it, for "Our Chorus". */
export async function companyState(ws: string, role: RoleId): Promise<{ fair: RoleModel; effective: RoleModel; follows: string; company_version: number | null; changes: (ChangeLine & { fair: unknown })[] }> {
  const fair = await fairFor(ws, role);
  const company = await companyVersion(ws, role);
  const effective = resolve(fair, company?.overrides).role;
  const changes = Object.keys(company?.overrides ?? {}).filter((p) => allowed(p, "company")).map((p) => ({ path: p, label: label(p), from: fairShown(fair, p), to: valueAt(effective, p) ?? null, fair: fairShown(fair, p) }));
  return { fair, effective, follows: company?.base_version ? `pinned to ${fair.version}` : "follows the latest", company_version: company?.version ?? null, changes };
}

// ------------------------------------------------------------------ suggest to Fair

export type Suggestion = { id: string; workspace_id: string; role: RoleId; ref_kind: "creation" | "setting"; ref: string; value: unknown; note: string | null; by_email: string; status: "new" | "seen" | "adopted" | "declined"; fair_note: string | null; fair_by: string | null; created_at: string; updated_at: string };

/** A Builder sends a company item to Fair's role owners, with a note. */
export async function suggestToFair(actor: Actor, ws: string, role: RoleId, ref: { kind: "creation" | "setting"; ref: string; value?: unknown }, note: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isBuilder(actor, ws, role)) return { ok: false, error: "Only a Builder suggests to Fair." };
  if (!note.trim()) return { ok: false, error: "Say in a line why Fair should have it." };
  if (ref.kind === "creation") {
    const c = (await sql.query("select 1 from creations where id = $1 and workspace_id = $2 and status = 'approved'", [ref.ref, ws])) as unknown[];
    if (!c.length) return { ok: false, error: "Only a live creation can be suggested." };
  } else if (!allowed(ref.ref, "company")) return { ok: false, error: "That is not a company setting." };
  const rows = (await sql.query(
    "insert into fair_suggestions (workspace_id, role, ref_kind, ref, value, note, by_email) values ($1, $2, $3, $4, $5::jsonb, $6, $7) returning id",
    [ws, role, ref.kind, ref.ref, ref.value === undefined ? null : toJson(ref.value), note.trim().slice(0, 500), actor.email],
  )) as { id: string }[];
  await audit({ workspace_id: ws, actor: actor.email, area: "suggestion", action: "suggest", path: `${role}:${ref.kind}:${ref.ref}`, note });
  const kindOf = ref.kind === "creation" ? ((await sql.query("select kind from creations where id = $1", [ref.ref])) as { kind: string }[])[0]?.kind : undefined;
  await signal(by(actor, ws, role), "suggestion.sent", { ref_kind: ref.kind, kind: kindOf, path: ref.kind === "setting" ? ref.ref : undefined });
  return { ok: true, id: rows[0].id };
}

export async function listSuggestions(o: { ws?: string; status?: Suggestion["status"][] } = {}): Promise<(Suggestion & { workspace_name: string; title: string | null })[]> {
  const where = ["true"];
  const args: unknown[] = [];
  if (o.ws) { args.push(o.ws); where.push(`s.workspace_id = $${args.length}`); }
  if (o.status?.length) { args.push(o.status); where.push(`s.status = any($${args.length}::text[])`); }
  return (await sql.query(
    `select s.*, w.name as workspace_name, c.title from fair_suggestions s join workspaces w on w.id = s.workspace_id
       left join creations c on s.ref_kind = 'creation' and c.id::text = s.ref
      where ${where.join(" and ")} order by s.created_at desc limit 300`,
    args,
  )) as never;
}

/** A role owner answers a suggestion in the CMS. */
export async function answerSuggestion(who: { email: string }, id: string, status: "seen" | "adopted" | "declined", note?: string | null): Promise<boolean> {
  const rows = (await sql.query("update fair_suggestions set status = $2, fair_note = coalesce($3, fair_note), fair_by = $4, updated_at = now() where id = $1 returning workspace_id", [id, status, note ?? null, who.email])) as { workspace_id: string }[];
  if (rows[0]) await audit({ workspace_id: rows[0].workspace_id, actor: who.email, area: "suggestion", action: status, path: id, note: note ?? null });
  return rows.length > 0;
}
