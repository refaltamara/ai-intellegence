/**
 * Cases (DECISIONS, 10 Oct 2026, step 5): an ad hoc watch inside a panel, such as a crisis or a one-off check. A case's
 * posts are stored once with the panel's and counted apart (posts.brought_in_by, case_posts). Each case has its own access
 * list: only the people on it see the case, Fair staff included (`case.view` in src/auth/can.ts), and only Fair's owners
 * and data ops on it change it (`case.manage`). Set up in the CMS, on a workspace's Cases tab.
 */
import { can, type Actor } from "../auth/can";
import { sql } from "../db/client";
import { PLATFORMS } from "../db/schema";
import { audit } from "../roles/store";

export type CaseRow = {
  id: string;
  workspace_id: string;
  name: string;
  about: string | null;
  starts_on: string;
  ends_on: string | null;
  terms: string[];
  platforms: string[] | null;
  pace: "daily" | "hourly";
  scraper_request: string | null;
  access: string[];
  status: "open" | "closed";
  /** the case's own settings (schema.ts): brand, label, pr, commercial, notes */
  settings: CaseSettings;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** posts the case caught, whether or not the panel caught them too */
  posts: number;
  /** of those, posts only the case brought in: they never count in the panel's everyday numbers */
  case_only: number;
};

export type CaseSettings = {
  /** the panel brand the case is about */
  brand?: string | null;
  label?: Record<string, unknown> | null;
  pr?: { hide?: string[] } | null;
  commercial?: Record<string, unknown> | null;
  notes?: { at: string; text: string; source: string }[];
  subject_noun?: string | null;
  copied_from?: string;
};

export type CaseInput = {
  id?: string;
  name: string;
  about?: string | null;
  starts_on: string;
  ends_on?: string | null;
  terms?: string[];
  platforms?: string[] | null;
  pace?: string;
  scraper_request?: string | null;
  access: string[];
};

const q = async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[];

const COLS = `c.id, c.workspace_id, c.name, c.about, to_char(c.starts_on, 'YYYY-MM-DD') as starts_on, to_char(c.ends_on, 'YYYY-MM-DD') as ends_on,
  c.terms, c.platforms, c.pace, c.scraper_request, c.access, c.status, c.settings, c.created_by, c.created_at, c.updated_at,
  (select count(*) from case_posts cp where cp.case_id = c.id)::int as posts,
  (select count(distinct p.item_id) from posts p where p.workspace_id = c.workspace_id and p.brought_in_by = c.id)::int as case_only`;

/** the statements that write a case (kept here so the live test plans exactly these) */
export const CASE_SQL = {
  insert: `insert into cases (id, workspace_id, name, about, starts_on, ends_on, terms, platforms, pace, scraper_request, access, created_by)
           values ($1, $2, $3, $4, $5::date, $6::date, $7::text[], $8::text[], $9, $10, $11::text[], $12)`,
  update: `update cases set name = $2, about = $3, starts_on = $4::date, ends_on = $5::date, terms = $6::text[], platforms = $7::text[], pace = $8,
           scraper_request = $9, access = $10::text[], updated_at = now() where id = $1`,
  status: "update cases set status = $2, updated_at = now() where id = $1",
  list: `select ${COLS} from cases c where c.workspace_id = $1 order by c.starts_on desc, c.name`,
};

/** every case of a workspace, whoever may see it: for the server only, never shown as is */
export async function casesOf(ws: string): Promise<CaseRow[]> {
  return q<CaseRow>(CASE_SQL.list, [ws]);
}

/** the cases of a workspace this person may see */
export async function casesFor(actor: Actor, ws: string): Promise<CaseRow[]> {
  return (await casesOf(ws)).filter((c) => can(actor, "case.view", { workspace: ws, case: c }));
}

export async function getCase(id: string): Promise<CaseRow | null> {
  return (await q<CaseRow>(`select ${COLS} from cases c where c.id = $1`, [id]))[0] ?? null;
}

/** a load goes into a case only while the case is open, and only into a case of the load's own workspace */
export async function assertOpenCase(ws: string, caseId: string): Promise<void> {
  const c = (await q<{ workspace_id: string; status: string }>(`select workspace_id, status from cases where id = $1`, [caseId]))[0];
  if (!c || c.workspace_id !== ws) throw new Error(`no case ${caseId} in ${ws}`);
  if (c.status !== "open") throw new Error(`case ${caseId} is closed: open it again to load into it`);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d: string) => DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** a case's settings as given, cleaned; the problems in plain words when they do not hold */
export function cleanCase(input: CaseInput, actorEmail: string): { ok: true; value: Required<Omit<CaseInput, "id">> } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 80) return { ok: false, error: "Give the case a name of 3 to 80 characters." };
  const starts = String(input.starts_on ?? "").trim();
  if (!validDay(starts)) return { ok: false, error: "The start date is a day, as YYYY-MM-DD." };
  const ends = input.ends_on ? String(input.ends_on).trim() : "";
  if (ends && !validDay(ends)) return { ok: false, error: "The end date is a day, as YYYY-MM-DD, or empty while the case runs on." };
  if (ends && ends < starts) return { ok: false, error: "The case ends before it starts." };
  const terms = [...new Map((input.terms ?? []).map((t) => String(t).trim().replace(/\s+/g, " ")).filter(Boolean).map((t) => [t.toLowerCase(), t])).values()];
  if (terms.some((t) => t.length < 2 || t.length > 60)) return { ok: false, error: "Each term is 2 to 60 characters." };
  if (terms.length > 50) return { ok: false, error: "At most 50 terms." };
  const platforms = input.platforms?.length ? [...new Set(input.platforms.map((p) => String(p).toLowerCase()))] : null;
  if (platforms?.some((p) => !(PLATFORMS as readonly string[]).includes(p))) return { ok: false, error: `Platforms are ${PLATFORMS.join(", ")}.` };
  const pace = String(input.pace ?? "daily");
  if (pace !== "daily" && pace !== "hourly") return { ok: false, error: "The case is read daily or hourly." };
  const access = [...new Set((input.access ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  const bad = access.find((e) => !EMAIL.test(e));
  if (bad) return { ok: false, error: `${bad} is not an email.` };
  // whoever saves the case stays on its list, so nobody shuts themselves out by accident
  const me = actorEmail.trim().toLowerCase();
  if (!access.includes(me)) access.unshift(me);
  if (access.length > 50) return { ok: false, error: "At most 50 people on the list." };
  const about = input.about ? String(input.about).trim().slice(0, 600) : null;
  const scraper = input.scraper_request ? String(input.scraper_request).trim().slice(0, 200) : null;
  return { ok: true, value: { name, about, starts_on: starts, ends_on: ends || null, terms, platforms, pace, scraper_request: scraper, access } };
}

/** set up a case, or change one this person may manage; Fair's owners and data ops only */
export async function saveCase(actor: Actor, ws: string, input: CaseInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const existing = input.id ? await getCase(input.id) : null;
  if (input.id && (!existing || existing.workspace_id !== ws)) return { ok: false, error: "No such case here." };
  if (!can(actor, "case.manage", { workspace: ws, ...(existing ? { case: existing } : {}) })) return { ok: false, error: existing ? "Only Fair's owners and data ops on this case's list change it." : "Only Fair's owners and data ops set up a case." };
  const c = cleanCase(input, actor.email);
  if (!c.ok) return c;
  const v = c.value;
  if (existing) {
    await sql.query(CASE_SQL.update, [existing.id, v.name, v.about, v.starts_on, v.ends_on, v.terms, v.platforms, v.pace, v.scraper_request, v.access]);
    await audit({ workspace_id: ws, actor: actor.email, area: "case", action: "update", path: existing.id, old: pick(existing), new: v });
    return { ok: true, id: existing.id };
  }
  const base = slug(v.name) || "case";
  const taken = new Set((await q<{ id: string }>("select id from cases where id = $1 or id like $1 || '-%'", [base])).map((r) => r.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  await sql.query(CASE_SQL.insert, [id, ws, v.name, v.about, v.starts_on, v.ends_on, v.terms, v.platforms, v.pace, v.scraper_request, v.access, actor.email]);
  await audit({ workspace_id: ws, actor: actor.email, area: "case", action: "create", path: id, new: v });
  return { ok: true, id };
}

/** close a case, or open it again: its posts stay where they are */
export async function setCaseStatus(actor: Actor, ws: string, id: string, status: "open" | "closed"): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getCase(id);
  if (!existing || existing.workspace_id !== ws) return { ok: false, error: "No such case here." };
  if (!can(actor, "case.manage", { workspace: ws, case: existing })) return { ok: false, error: "Only Fair's owners and data ops on this case's list change it." };
  if (existing.status === status) return { ok: true };
  await sql.query(CASE_SQL.status, [id, status]);
  await audit({ workspace_id: ws, actor: actor.email, area: "case", action: status === "closed" ? "close" : "reopen", path: id });
  return { ok: true };
}

const pick = (c: CaseRow) => ({ name: c.name, about: c.about, starts_on: c.starts_on, ends_on: c.ends_on, terms: c.terms, platforms: c.platforms, pace: c.pace, scraper_request: c.scraper_request, access: c.access });
