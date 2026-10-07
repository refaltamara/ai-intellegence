/**
 * A team's case words (DECISIONS, 7 Oct 2026, "Teams build their own"): the partner brands named
 * beside the subject (sister brands) and the words a boycott uses. Fair set them per workspace;
 * a Builder now adds and removes the team's own, seeing what each matches before saving. They are
 * words over the data (counted in SQL by the dashboard, the crisis slides and the chronology),
 * never a change to the data itself, so they cost nothing. Fair's entries stay; only the team's
 * own can be removed by the team.
 */
import type { Actor } from "../auth/can";
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { audit } from "../roles/store";
import { by, signal } from "../learning/signals";
import type { CaseWordRequest, CommercialSettings, Partner } from "../workspace/config";
import { isBuilder } from "./creations";

export type CaseWords = {
  partners: { name: string; terms: string[]; by: string | null; posts: number; comments: number }[];
  boycott: { term: string; by: string | null; posts: number; comments: number }[];
  /** what Members asked to add, with what it would match */
  pending: (CaseWordRequest & { posts: number; comments: number })[];
};

const clean = (t: unknown) => String(t ?? "").replace(/[%_\\]/g, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40);
const terms = (v: unknown) => [...new Set((Array.isArray(v) ? v : String(v ?? "").split(",")).map(clean).filter((t) => t.length >= 2))].slice(0, 8);

async function raw(ws: string): Promise<CommercialSettings> {
  const r = (await sql.query("select settings->'commercial' as c from workspaces where id = $1", [ws])) as { c: CommercialSettings | null }[];
  return r[0]?.c ?? {};
}

/** Posts and comments that use any of the words (posts about the case only; the subject's own replies out). */
export async function matches(ws: string, words: string[]): Promise<{ posts: number; comments: number }> {
  const like = words.map((w) => `%${clean(w)}%`).filter((w) => w.length > 3);
  if (!like.length) return { posts: 0, comments: 0 };
  const r = (await sql.query(
    `select (select count(*) from posts p where p.workspace_id = $1 and p.relevant is not false and p.caption ilike any($2::text[]))::int as posts,
            (select count(*) from comments c join posts p on p.id = c.post_id where c.workspace_id = $1 and p.relevant is not false and c.sentiment_source is distinct from 'subject' and c.text ilike any($2::text[]))::int as comments`,
    [ws, like],
  )) as { posts: number; comments: number }[];
  return r[0] ?? { posts: 0, comments: 0 };
}

export async function caseWords(ws: string): Promise<CaseWords> {
  const c = await raw(ws);
  const partners = await Promise.all((c.partners ?? []).filter((p) => p.name?.trim()).map(async (p) => {
    const t = p.terms?.length ? p.terms : [p.name];
    return { name: p.name, terms: t, by: p.by ?? null, ...(await matches(ws, t)) };
  }));
  const boycott = await Promise.all((c.boycott_terms ?? []).map(async (t) => ({ term: t, by: c.boycott_by?.[t] ?? null, ...(await matches(ws, [t])) })));
  const pending = await Promise.all((c.pending ?? []).map(async (r) => ({ ...r, ...(await matches(ws, r.terms)) })));
  return { partners, boycott, pending };
}

export type CaseWordsOp = { list: "partners" | "boycott"; action: "add" | "remove" | "preview" | "request" | "approve" | "decline"; name?: string; terms?: string[] | string; id?: string };

type Lists = { partners: Partner[]; boycott: string[]; boycottBy: Record<string, string> };

/** One add or remove on the lists; the error is a sentence for the person. */
function applyOp(l: Lists, list: "partners" | "boycott", action: "add" | "remove", name: string, words: string[], who: string): string | null {
  if (list === "partners") {
    if (action === "add") {
      if (!name) return "Name the brand.";
      if (l.partners.some((p) => p.name.toLowerCase() === name.toLowerCase())) return `${name} is already on the list.`;
      if (l.partners.length >= 20) return "The list holds 20 brands at most.";
      l.partners.push({ name, terms: words.length ? words : [clean(name)], by: who });
      return null;
    }
    const i = l.partners.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    if (i < 0) return `${name} is not on the list.`;
    if (!l.partners[i].by) return `${l.partners[i].name} was set by Fair; ask Fair to take it off.`;
    l.partners.splice(i, 1);
    return null;
  }
  if (action === "add") {
    const fresh = words.filter((w) => !l.boycott.includes(w));
    if (!fresh.length) return "Those words are already on the list.";
    if (l.boycott.length + fresh.length > 30) return "The list holds 30 words at most.";
    for (const w of fresh) { l.boycott.push(w); l.boycottBy[w] = who; }
    return null;
  }
  const w = words[0];
  if (!w || !l.boycott.includes(w)) return "That word is not on the list.";
  if (!l.boycottBy[w]) return `"${w}" was set by Fair; ask Fair to take it off.`;
  l.boycott.splice(l.boycott.indexOf(w), 1);
  delete l.boycottBy[w];
  return null;
}

/**
 * Add or remove a team's case word. A Builder's change is saved at once; a Member asks (request)
 * and it waits under Case words until a Builder approves or declines it; preview only counts.
 */
export async function changeCaseWords(actor: Actor, ws: string, op: CaseWordsOp): Promise<{ ok: true; words?: CaseWords; preview?: { posts: number; comments: number; terms: string[] } } | { ok: false; error: string }> {
  const list = op.list === "boycott" ? "boycott" : "partners";
  const name = String(op.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  const words = list === "boycott" ? terms(op.terms ?? name) : terms(op.terms?.length ? op.terms : name);
  if (op.action === "preview") {
    if (!words.length) return { ok: false, error: "Give at least one word of two letters or more." };
    return { ok: true, preview: { ...(await matches(ws, words)), terms: words } };
  }
  const builder = isBuilder(actor, ws, "pr");
  const c = await raw(ws);
  const l: Lists = { partners: [...(c.partners ?? [])], boycott: [...(c.boycott_terms ?? [])], boycottBy: { ...(c.boycott_by ?? {}) } };
  let pending = [...(c.pending ?? [])];
  const who = actor.name ?? actor.email;
  let path = `${list}:${list === "partners" ? name : words.join(",")}`;
  if (op.action === "add" || op.action === "remove") {
    if (!builder) return { ok: false, error: "Only a Builder changes the team's case words; send it to yours to add." };
    const err = applyOp(l, list, op.action, name, words, who);
    if (err) return { ok: false, error: err };
  } else if (op.action === "request") {
    // checked against the lists as they are, so a Builder never gets a request that cannot apply
    const err = applyOp({ partners: [...l.partners], boycott: [...l.boycott], boycottBy: { ...l.boycottBy } }, list, "add", name, words, who);
    if (err) return { ok: false, error: err };
    if (pending.length >= 20) return { ok: false, error: "Twenty requests already wait for a Builder." };
    pending.push({ id: crypto.randomUUID(), list, name: list === "partners" ? name : words.join(", "), terms: words.length ? words : [clean(name)], by: who, by_email: actor.email, at: new Date().toISOString() });
  } else {
    if (!builder) return { ok: false, error: "Only a Builder answers a request." };
    const r = pending.find((x) => x.id === op.id);
    if (!r) return { ok: false, error: "That request is no longer waiting." };
    pending = pending.filter((x) => x.id !== r.id);
    path = `${r.list}:${r.name}`;
    if (op.action === "approve") {
      // the word is the Member's: it carries their name
      const err = applyOp(l, r.list, "add", r.list === "partners" ? r.name : "", r.terms, r.by);
      if (err) return { ok: false, error: err };
    }
  }
  const next: CommercialSettings = { ...c, partners: l.partners, boycott_terms: l.boycott, boycott_by: l.boycottBy, pending };
  await sql.query("update workspaces set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{commercial}', $2::jsonb) where id = $1", [ws, toJson(next)]);
  await audit({ workspace_id: ws, actor: actor.email, area: "case_words", action: op.action, path, old: c as Record<string, unknown>, new: next as Record<string, unknown> });
  await signal(by(actor, ws, "pr"), "casewords.changed", { list, action: op.action });
  return { ok: true, words: await caseWords(ws) };
}
