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
import type { CommercialSettings, Partner } from "../workspace/config";
import { isBuilder } from "./creations";

export type CaseWords = {
  partners: { name: string; terms: string[]; by: string | null; posts: number; comments: number }[];
  boycott: { term: string; by: string | null; posts: number; comments: number }[];
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
  return { partners, boycott };
}

export type CaseWordsOp = { list: "partners" | "boycott"; action: "add" | "remove" | "preview"; name?: string; terms?: string[] | string };

/** Add or remove a team's case word. A Builder's change is saved at once; preview only counts. */
export async function changeCaseWords(actor: Actor, ws: string, op: CaseWordsOp): Promise<{ ok: true; words?: CaseWords; preview?: { posts: number; comments: number; terms: string[] } } | { ok: false; error: string }> {
  const list = op.list === "boycott" ? "boycott" : "partners";
  const name = String(op.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  const words = list === "boycott" ? terms(op.terms ?? name) : terms(op.terms?.length ? op.terms : name);
  if (op.action === "preview") {
    if (!words.length) return { ok: false, error: "Give at least one word of two letters or more." };
    return { ok: true, preview: { ...(await matches(ws, words)), terms: words } };
  }
  if (!isBuilder(actor, ws, "pr")) return { ok: false, error: "Only a Builder changes the team's case words; ask yours to add it." };
  const c = await raw(ws);
  const partners: Partner[] = [...(c.partners ?? [])];
  const boycott = [...(c.boycott_terms ?? [])];
  const boycottBy = { ...(c.boycott_by ?? {}) };
  const who = actor.name ?? actor.email;
  if (list === "partners") {
    if (op.action === "add") {
      if (!name) return { ok: false, error: "Name the brand." };
      if (partners.some((p) => p.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: `${name} is already on the list.` };
      if (partners.length >= 20) return { ok: false, error: "The list holds 20 brands at most." };
      partners.push({ name, terms: words.length ? words : [clean(name)], by: who });
    } else {
      const i = partners.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
      if (i < 0) return { ok: false, error: `${name} is not on the list.` };
      if (!partners[i].by) return { ok: false, error: `${partners[i].name} was set by Fair; ask Fair to take it off.` };
      partners.splice(i, 1);
    }
  } else {
    if (op.action === "add") {
      const fresh = words.filter((w) => !boycott.includes(w));
      if (!fresh.length) return { ok: false, error: "Those words are already on the list." };
      if (boycott.length + fresh.length > 30) return { ok: false, error: "The list holds 30 words at most." };
      for (const w of fresh) { boycott.push(w); boycottBy[w] = who; }
    } else {
      const w = words[0];
      if (!w || !boycott.includes(w)) return { ok: false, error: "That word is not on the list." };
      if (!boycottBy[w]) return { ok: false, error: `"${w}" was set by Fair; ask Fair to take it off.` };
      boycott.splice(boycott.indexOf(w), 1);
      delete boycottBy[w];
    }
  }
  const next: CommercialSettings = { ...c, partners, boycott_terms: boycott, boycott_by: boycottBy };
  await sql.query("update workspaces set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{commercial}', $2::jsonb) where id = $1", [ws, toJson(next)]);
  await audit({ workspace_id: ws, actor: actor.email, area: "case_words", action: op.action, path: `${list}:${list === "partners" ? name : words.join(",")}`, old: c as Record<string, unknown>, new: next as Record<string, unknown> });
  await signal(by(actor, ws, "pr"), "casewords.changed", { list, action: op.action });
  return { ok: true, words: await caseWords(ws) };
}
