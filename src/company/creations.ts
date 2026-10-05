/**
 * What a client makes on a team (CMS plan, "The client side"): company skills (recipes),
 * deck templates, house rules, memory facts and vocabulary, in one table with a status.
 *
 *   draft      made (by asking CeMO, or "Save as template"); works for its maker only
 *   waiting    a Member sent it to the Builder
 *   approved   live for everyone on the team, badged with the client's name
 *   sent_back  the Builder asked for a change (with a note); the maker can send it again
 *   rejected   the Builder said no
 *   removed    taken away (undo); a Builder can bring it back
 *
 * A Builder's own creation is approved when they add it; a Member's waits (DECISIONS,
 * 4 Oct 2026). A release never touches these rows; Fair sees them in the CMS.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { can, type Actor } from "../auth/can";
import { CREATION_LIMITS, MEMBER_OPEN_LIMIT } from "../config/company";
import { ROLES, type RoleId } from "../roles/model";
import { audit } from "../roles/store";
import { fairRecipes } from "../recipes/store";
import { validateRecipe, type RecipeSpec } from "../recipes/spec";
import { skillNames } from "../skills/registry";
import { DECK_TEMPLATES, type DeckTemplate } from "../decks/templates";
import { GRAINS } from "../competitor/period";
import { cleanSlides } from "../competitor/slides";
import { cleanRepSlides } from "../reputation/slides";
import { cleanSocialSlides } from "../social/slides";
import { refuseTerm, refuseText, type Memory, type Term } from "./rules";
import { validateExt, type ExtDefInput } from "../extensions/spec";
import { by, signal } from "../learning/signals";
import { creationShape } from "../learning/vocab";

export const CREATION_KINDS = ["skill", "deck_template", "rule", "fact", "term", "extension"] as const;
export type CreationKind = (typeof CREATION_KINDS)[number];
export type CreationStatus = "draft" | "waiting" | "approved" | "sent_back" | "rejected" | "removed";
export const isCreationKind = (v: unknown): v is CreationKind => (CREATION_KINDS as readonly string[]).includes(v as string);

export const KIND_LABEL: Record<CreationKind, string> = { skill: "Skill", deck_template: "Deck template", rule: "House rule", fact: "Memory", term: "Vocabulary", extension: "Data extension" };

export type Creation = {
  id: string;
  workspace_id: string;
  role: RoleId;
  kind: CreationKind;
  key: string | null;
  title: string;
  spec: Record<string, unknown>;
  status: CreationStatus;
  maker_user_id: string | null;
  maker_email: string;
  maker_name: string | null;
  approver: string | null;
  note: string | null;
  decided_at: string | null;
  updated_at: string;
  created_at: string;
};

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "item";

/** may this person act as a Builder of this team? Fair's owners and data ops may too */
export const isBuilder = (a: Actor, ws: string, role: RoleId) => can(a, "company.change", { workspace: ws, role });

// ------------------------------------------------------------------ specs

/** A company deck template: a Fair template's shape, its slides from the role's own library. */
export type CompanyTemplate = Omit<DeckTemplate, "roles"> & { roles: RoleId[]; from?: string | null };

export function cleanTemplate(input: Record<string, unknown>, role: RoleId, key: string): CompanyTemplate | { error: string } {
  const name = String(input.name ?? "").trim().slice(0, 60);
  if (!name) return { error: "Give the template a name." };
  const from = typeof input.from === "string" ? DECK_TEMPLATES.find((t) => t.key === input.from && t.roles.includes(role)) ?? null : null;
  const grain = GRAINS.includes(input.grain as never) ? (input.grain as DeckTemplate["grain"]) : from?.grain ?? "month";
  const base: Omit<CompanyTemplate, "slides"> = {
    key,
    name,
    title: String(input.title ?? name).trim().slice(0, 60) || name,
    description: String(input.description ?? from?.description ?? "").trim().slice(0, 300),
    grain,
    brands: from?.brands ?? (role === "brand_kol" ? "watchlist" : "focus"),
    recurring: typeof input.recurring === "boolean" ? input.recurring : from?.recurring ?? true,
    roles: [role],
    from: from?.key ?? null,
  };
  if (role === "pr") return { ...base, slides: ["summary"], family: "reputation", rep_slides: cleanRepSlides(input.slides ?? from?.rep_slides) };
  if (role === "social") return { ...base, slides: ["summary"], family: "social", social_slides: cleanSocialSlides(input.slides ?? from?.social_slides) };
  const slides = cleanSlides(input.slides ?? from?.slides);
  return slides.length > 1 ? { ...base, slides } : { error: "Pick at least one slide besides the summary." };
}

/** A creation's spec, checked for its kind; the error is a sentence for the person. */
export async function cleanCreation(kind: CreationKind, role: RoleId, input: Record<string, unknown>, ws: string): Promise<{ title: string; key: string | null; spec: Record<string, unknown> } | { error: string }> {
  if (kind === "rule" || kind === "fact") {
    const text = String(input.text ?? "").trim();
    const why = refuseText(text, kind);
    return why ? { error: why } : { title: text.length <= 120 ? text : `${text.slice(0, 117).replace(/\s+\S*$/, "")}…`, key: null, spec: { text } };
  }
  if (kind === "term") {
    const t = { say: String(input.say ?? "").trim(), not: String(input.not ?? "").trim() } as Term;
    const why = refuseTerm(t);
    return why ? { error: why } : { title: `"${t.say}", not "${t.not}"`, key: null, spec: t };
  }
  if (kind === "extension") {
    // the definition rides on the creation, so a removed extension can be brought back (src/extensions/)
    const v = validateExt(input as Partial<ExtDefInput>);
    return v.ok ? { title: v.def.name, key: v.def.key, spec: v.def as unknown as Record<string, unknown> } : { error: v.errors.join(" ") };
  }
  if (kind === "skill") {
    const title = String(input.title ?? "").trim();
    const key = typeof input.key === "string" && input.key ? input.key : slug(title);
    const spec = { ...input, key, roles: [role] } as RecipeSpec;
    const errors = validateRecipe(spec);
    if (errors.length) return { error: `The skill does not check out: ${errors.join(" ")}` };
    const fair = await fairRecipes();
    if (fair.has(key) || skillNames().includes(key)) return { error: `"${key}" is already one of Fair's; pick another key.` };
    return { title: spec.title, key, spec: spec as unknown as Record<string, unknown> };
  }
  const key = `co-${slug(String(input.name ?? "template"))}`;
  const t = cleanTemplate(input, role, key);
  return "error" in t ? t : { title: t.name, key: t.key, spec: t as unknown as Record<string, unknown> };
}

// ------------------------------------------------------------------ store

async function one(id: string): Promise<Creation | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const rows = (await sql.query("select * from creations where id = $1", [id])) as Creation[];
  return rows[0] ?? null;
}

export async function getCreation(id: string, ws: string): Promise<Creation | null> {
  const c = await one(id);
  return c && c.workspace_id === ws ? c : null;
}

async function limitError(ws: string, role: RoleId, kind: CreationKind, actor: Actor): Promise<string | null> {
  const rows = (await sql.query(
    "select count(*) filter (where kind = $3 and status = 'approved')::int as live, count(*) filter (where maker_email = $4 and status in ('draft','waiting','sent_back'))::int as open from creations where workspace_id = $1 and role = $2",
    [ws, role, kind, actor.email],
  )) as { live: number; open: number }[];
  const r = rows[0] ?? { live: 0, open: 0 };
  if (r.live >= CREATION_LIMITS[kind]) return `${ROLES[role].codename} here already holds ${CREATION_LIMITS[kind]} of these; remove one first.`;
  if (!isBuilder(actor, ws, role) && r.open >= MEMBER_OPEN_LIMIT) return `You have ${MEMBER_OPEN_LIMIT} creations waiting or in draft; finish some first.`;
  return null;
}

/** Make a creation. A Builder's goes live when `live` is set (they pressed Add); everyone else's starts as a draft. */
export async function makeCreation(actor: Actor, o: { ws: string; role: RoleId; kind: CreationKind; input: Record<string, unknown>; live?: boolean }): Promise<Ok<{ creation: Creation }> | Err> {
  if (!can(actor, "role.use", { workspace: o.ws, role: o.role })) return { ok: false, error: "You are not on this team." };
  const clean = await cleanCreation(o.kind, o.role, o.input, o.ws);
  if ("error" in clean) return { ok: false, error: clean.error };
  const limit = await limitError(o.ws, o.role, o.kind, actor);
  if (limit) return { ok: false, error: limit };
  if (clean.key) {
    const taken = (await sql.query("select 1 from creations where workspace_id = $1 and role = $2 and key = $3 and status = 'approved'", [o.ws, o.role, clean.key])) as unknown[];
    if (taken.length) return { ok: false, error: "Your team already has one with that name; pick another." };
  }
  const live = !!o.live && isBuilder(actor, o.ws, o.role);
  const rows = (await sql.query(
    `insert into creations (workspace_id, role, kind, key, title, spec, status, maker_user_id, maker_email, maker_name, approver, decided_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, ${live ? "now()" : "null"}) returning *`,
    [o.ws, o.role, o.kind, clean.key, clean.title, toJson(clean.spec), live ? "approved" : "draft", actor.memberships.some((m) => m.user_id === actor.uid && m.workspace_id === o.ws) ? actor.uid : null, actor.email, actor.name, live ? actor.email : null],
  )) as Creation[];
  await audit({ workspace_id: o.ws, actor: actor.email, area: "creation", action: live ? "add" : "draft", path: `${o.role}:${o.kind}:${rows[0].id}`, new: { title: clean.title } });
  const level = actor.staff.length ? "fair" : isBuilder(actor, o.ws, o.role) ? "builder" : "member";
  const shape = creationShape(o.kind, clean.spec);
  await signal(by(actor, o.ws, o.role), "creation.made", { kind: o.kind, level, shape });
  if (live) await signal(by(actor, o.ws, o.role), "creation.approved", { kind: o.kind, shape, own: true });
  return { ok: true, creation: rows[0] };
}

export type CreationAction = "add" | "submit" | "approve" | "send_back" | "reject" | "remove" | "restore" | "discard";

/**
 * Move a creation along. The maker sends a draft (or a sent-back one) to the Builder, or
 * discards it; a Builder adds their own, approves, sends back with a note, rejects,
 * removes a live one (undo) or brings a removed one back.
 */
export async function actOn(actor: Actor, id: string, ws: string, action: CreationAction, note?: string | null): Promise<Ok<{ creation: Creation }> | Err> {
  const c = await getCreation(id, ws);
  if (!c) return { ok: false, error: "No such creation." };
  const builder = isBuilder(actor, ws, c.role);
  const mine = c.maker_email === actor.email;
  const go = async (status: CreationStatus, decided: boolean) => {
    // an extension is filled once approved: refused when the month cannot cover its estimate
    if (c.kind === "extension" && status === "approved") {
      const block = await (await import("../extensions/store")).approvalBlock(c.id);
      if (block) return { ok: false as const, error: block };
    }
    if (c.key && status === "approved") {
      const taken = (await sql.query("select 1 from creations where workspace_id = $1 and role = $2 and key = $3 and status = 'approved' and id <> $4", [ws, c.role, c.key, c.id])) as unknown[];
      if (taken.length) return { ok: false as const, error: "Your team already has a live one with that name." };
    }
    const rows = (await sql.query(
      `update creations set status = $2, note = $3, updated_at = now()${decided ? ", approver = $4, decided_at = now()" : ""} where id = $1 returning *`,
      decided ? [c.id, status, note ?? null, actor.email] : [c.id, status, note ?? c.note],
    )) as Creation[];
    await audit({ workspace_id: ws, actor: actor.email, area: "creation", action, path: `${c.role}:${c.kind}:${c.id}`, old: { status: c.status }, new: { status }, note: note ?? null });
    if (c.kind === "extension") await (await import("../extensions/store")).onCreationStatus(rows[0], status, actor);
    const sig = { kind: c.kind, shape: creationShape(c.kind, c.spec) };
    const kind = status === "approved" ? (action === "restore" ? "creation.restored" : "creation.approved") : status === "waiting" ? "creation.submitted" : status === "sent_back" ? "creation.sent_back" : status === "rejected" ? "creation.rejected" : "creation.removed";
    await signal(by(actor, ws, c.role), kind, { ...sig, own: mine, live: c.status === "approved" });
    return { ok: true as const, creation: rows[0] };
  };
  switch (action) {
    case "add":
      if (!builder || !mine || !["draft", "sent_back"].includes(c.status)) return { ok: false, error: "Only a Builder adds their own draft for everyone." };
      return go("approved", true);
    case "submit":
      if (!mine || !["draft", "sent_back"].includes(c.status)) return { ok: false, error: "Only its maker can send a draft to the Builder." };
      return builder ? go("approved", true) : go("waiting", false);
    case "approve":
      if (!builder || c.status !== "waiting") return { ok: false, error: "Only a Builder approves a creation that is waiting." };
      return go("approved", true);
    case "send_back":
    case "reject":
      if (!builder || c.status !== "waiting") return { ok: false, error: "Only a Builder answers a creation that is waiting." };
      if (action === "send_back" && !note?.trim()) return { ok: false, error: "Say what to change." };
      return go(action === "send_back" ? "sent_back" : "rejected", true);
    case "remove":
      if (c.status === "approved" ? !builder : !(mine && ["draft", "waiting", "sent_back"].includes(c.status))) return { ok: false, error: "You can't remove this one." };
      return go("removed", c.status === "approved");
    case "restore":
      if (!builder || c.status !== "removed" || !c.approver) return { ok: false, error: "Only a Builder brings back something that was live." };
      if (c.kind === "extension") {
        // its values were deleted with it: bring the definition back, estimate again, then approve
        const x = await import("../extensions/store");
        const made = await x.createDraftDef(ws, c.spec as Partial<ExtDefInput>, c.maker_email, c.id);
        if (!made.ok) return { ok: false, error: made.error };
        await x.estimateDef(made.def, { email: actor.email, staff: actor.staff.length > 0 });
      }
      return go("approved", true);
    case "discard":
      if (!mine || !["draft", "sent_back"].includes(c.status)) return { ok: false, error: "Only its maker can discard a draft." };
      return go("removed", false);
  }
}

export async function listCreations(ws: string, o: { role?: RoleId; status?: CreationStatus[]; kinds?: CreationKind[]; maker?: string } = {}): Promise<Creation[]> {
  const where = ["workspace_id = $1"];
  const args: unknown[] = [ws];
  if (o.role) { args.push(o.role); where.push(`role = $${args.length}`); }
  if (o.status?.length) { args.push(o.status); where.push(`status = any($${args.length}::text[])`); }
  if (o.kinds?.length) { args.push(o.kinds); where.push(`kind = any($${args.length}::text[])`); }
  if (o.maker) { args.push(o.maker); where.push(`maker_email = $${args.length}`); }
  return (await sql.query(`select * from creations where ${where.join(" and ")} order by updated_at desc limit 500`, args)) as Creation[];
}

/** Every client's creations, for the CMS (Fair only). */
export async function allCreations(o: { status?: CreationStatus[]; role?: RoleId } = {}): Promise<(Creation & { workspace_name: string })[]> {
  const where = ["true"];
  const args: unknown[] = [];
  if (o.status?.length) { args.push(o.status); where.push(`c.status = any($${args.length}::text[])`); }
  if (o.role) { args.push(o.role); where.push(`c.role = $${args.length}`); }
  return (await sql.query(`select c.*, w.name as workspace_name from creations c join workspaces w on w.id = c.workspace_id where ${where.join(" and ")} order by c.updated_at desc limit 500`, args)) as never;
}

/** live for this person: everyone's approved ones, plus their own that are not live yet (they work for their maker) */
async function liveFor(ws: string, role: RoleId, kind: CreationKind, email?: string | null): Promise<Creation[]> {
  return (await sql.query(
    "select * from creations where workspace_id = $1 and role = $2 and kind = $3 and (status = 'approved' or (maker_email = $4 and status in ('draft','waiting','sent_back'))) order by status = 'approved' desc, created_at",
    [ws, role, kind, email ?? ""],
  )) as Creation[];
}

/** The company's skills as recipes, with whose they are; a person's own drafts come along for them only. */
export async function companyRecipes(ws: string, role: RoleId, email?: string | null): Promise<(RecipeSpec & { _creation: { id: string; status: CreationStatus; maker: string } })[]> {
  const rows = await liveFor(ws, role, "skill", email);
  const seen = new Set<string>();
  return rows.filter((r) => r.key && !seen.has(r.key) && seen.add(r.key)).map((r) => ({ ...(r.spec as unknown as RecipeSpec), key: r.key!, roles: [role], _creation: { id: r.id, status: r.status, maker: r.maker_name ?? r.maker_email } }));
}

export async function companyTemplates(ws: string, role: RoleId, email?: string | null): Promise<(CompanyTemplate & { _creation: { id: string; status: CreationStatus; maker: string } })[]> {
  const rows = await liveFor(ws, role, "deck_template", email);
  return rows.map((r) => ({ ...(r.spec as unknown as CompanyTemplate), key: r.key!, _creation: { id: r.id, status: r.status, maker: r.maker_name ?? r.maker_email } }));
}

/** House rules, facts and vocabulary that are live for the whole team (a draft is never in CeMO's prompt). */
export async function teamMemory(ws: string, role: RoleId): Promise<Memory & { version: string }> {
  const rows = (await sql.query("select kind, spec, maker_name, maker_email, updated_at from creations where workspace_id = $1 and role = $2 and kind in ('rule','fact','term') and status = 'approved' order by created_at", [ws, role])) as { kind: CreationKind; spec: Record<string, string>; maker_name: string | null; maker_email: string; updated_at: string }[];
  const by = (r: (typeof rows)[number]) => r.maker_name ?? r.maker_email;
  return {
    rules: rows.filter((r) => r.kind === "rule").map((r) => ({ text: r.spec.text, by: by(r) })),
    facts: rows.filter((r) => r.kind === "fact").map((r) => ({ text: r.spec.text, by: by(r) })),
    terms: rows.filter((r) => r.kind === "term").map((r) => ({ say: r.spec.say, not: r.spec.not, by: by(r) })),
    // changes whenever the live set does, so a cached prompt is rebuilt
    version: `${rows.length}:${rows.map((r) => r.updated_at).sort().at(-1) ?? ""}`,
  };
}

/** what waits for a Builder on this workspace (every team they build) */
export async function waitingFor(actor: Actor, ws: string): Promise<Creation[]> {
  const rows = await listCreations(ws, { status: ["waiting"] });
  return rows.filter((c) => isBuilder(actor, ws, c.role));
}

/** A live company skill by key, on any team of the workspace (decks run them as findings). */
export async function companyRecipeByKey(ws: string, key: string): Promise<RecipeSpec | null> {
  const rows = (await sql.query("select key, spec, role from creations where workspace_id = $1 and kind = 'skill' and status = 'approved' and key = $2 limit 1", [ws, key])) as { key: string; spec: RecipeSpec; role: RoleId }[];
  return rows[0] ? { ...rows[0].spec, key: rows[0].key } : null;
}
