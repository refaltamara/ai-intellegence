/**
 * The relevance terms editor (CMS plan, "Relevance"): as terms change, a live preview of
 * the share of a brand's posts that would count, by platform, with the posts that would
 * flip in each direction and their views; apply recomputes posts.relevant for that brand
 * (only the posts that change), refreshes the views, and keeps the before and after.
 * Same rule as the loader (src/onboard/relevance.ts).
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { audit } from "../roles/store";
import { brandMatcher, isRelevant } from "./relevance";
import { refreshViews } from "./load";

type PostLite = { id: string; platform: string; url: string; caption: string | null; source: string; tagged_handles: string[] | null; views: number | null; relevant: boolean; creator_handle: string | null };
export type Flip = { url: string; platform: string; handle: string | null; views: number | null; caption: string };
export type TermsPreview = {
  brand: { id: string; name: string };
  terms: string[];
  never: string[];
  by_platform: { platform: string; posts: number; now: number; after: number }[];
  total: { posts: number; now: number; after: number; views_now: number; views_after: number };
  to_counting: Flip[];
  to_not: Flip[];
};

async function brandPosts(ws: string, brandId: string): Promise<PostLite[]> {
  return (await sql.query(
    "select id, platform, url, caption, source, tagged_handles, views, relevant, creator_handle from posts where workspace_id = $1 and brand_id = $2",
    [ws, brandId],
  )) as PostLite[];
}

async function brandBasics(ws: string, brandId: string): Promise<{ name: string; handles: string[]; terms: string[]; never: string[] } | null> {
  const b = ((await sql.query("select name from brands where id = $1 and workspace_id = $2", [brandId, ws])) as { name: string }[])[0];
  if (!b) return null;
  const hs = (await sql.query("select handle from brand_handles where workspace_id = $1 and brand_id = $2", [ws, brandId])) as { handle: string }[];
  const ts = (await sql.query("select term, mode from brand_terms where workspace_id = $1 and brand_id = $2 order by created_at", [ws, brandId])) as { term: string; mode: string }[];
  return { name: b.name, handles: hs.map((h) => h.handle), terms: ts.filter((t) => t.mode === "counts").map((t) => t.term), never: ts.filter((t) => t.mode === "never").map((t) => t.term) };
}

const clean = (xs: unknown) => [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x).trim()).filter((x) => x.length >= 2 && x.length <= 60))].slice(0, 80);

/** What the brand's posts would look like under these terms (or the saved ones). */
export async function previewTerms(ws: string, brandId: string, draft?: { terms?: unknown; never?: unknown }): Promise<TermsPreview | null> {
  const base = await brandBasics(ws, brandId);
  if (!base) return null;
  const terms = draft?.terms !== undefined ? clean(draft.terms) : base.terms;
  const never = draft?.never !== undefined ? clean(draft.never) : base.never;
  const handles = new Set(base.handles.map((h) => h.toLowerCase()));
  const m = brandMatcher([...terms, ...base.handles], never);
  const posts = await brandPosts(ws, brandId);
  const plats = new Map<string, { posts: number; now: number; after: number }>();
  const toCounting: (Flip & { v: number })[] = [];
  const toNot: (Flip & { v: number })[] = [];
  let viewsNow = 0, viewsAfter = 0, now = 0, after = 0;
  for (const p of posts) {
    const next = isRelevant({ owned: p.source === "owned", tagged: p.tagged_handles ?? [], caption: p.caption }, handles, m);
    const x = plats.get(p.platform) ?? { posts: 0, now: 0, after: 0 };
    x.posts += 1; if (p.relevant) x.now += 1; if (next) x.after += 1;
    plats.set(p.platform, x);
    if (p.relevant) { now += 1; viewsNow += Number(p.views ?? 0); }
    if (next) { after += 1; viewsAfter += Number(p.views ?? 0); }
    const f = { url: p.url, platform: p.platform, handle: p.creator_handle, views: p.views == null ? null : Number(p.views), caption: (p.caption ?? "").slice(0, 160), v: Number(p.views ?? 0) };
    if (next && !p.relevant) toCounting.push(f);
    if (!next && p.relevant) toNot.push(f);
  }
  const top = (xs: (Flip & { v: number })[]) => xs.sort((a, b) => b.v - a.v).slice(0, 10).map(({ v: _v, ...r }) => r);
  return {
    brand: { id: brandId, name: base.name }, terms, never,
    by_platform: [...plats].map(([platform, x]) => ({ platform, ...x })).sort((a, b) => b.posts - a.posts),
    total: { posts: posts.length, now, after, views_now: viewsNow, views_after: viewsAfter },
    to_counting: top(toCounting), to_not: top(toNot),
  };
}

/** Save a brand's terms (the load and apply then use them). */
export async function saveTerms(ws: string, brandId: string, terms: unknown, never: unknown, by: string): Promise<{ terms: string[]; never: string[] }> {
  const t = clean(terms), n = clean(never);
  const old = await brandBasics(ws, brandId);
  await sql.query("delete from brand_terms where workspace_id = $1 and brand_id = $2", [ws, brandId]);
  const rows = [...t.map((term) => ({ term, mode: "counts" })), ...n.map((term) => ({ term, mode: "never" }))];
  if (rows.length) await sql.query("insert into brand_terms (workspace_id, brand_id, term, mode) select $2, $3, r.term, r.mode from jsonb_to_recordset($1::jsonb) as r(term text, mode text)", [toJson(rows), ws, brandId]);
  await sql.query("update brands set keywords = $3::jsonb where id = $2 and workspace_id = $1", [ws, brandId, toJson(t)]);
  await audit({ workspace_id: ws, actor: by, area: "data", action: "terms", path: brandId, old: old ? { terms: old.terms, never: old.never } : null, new: { terms: t, never: n } });
  return { terms: t, never: n };
}

/** Recompute posts.relevant for one brand under its saved terms; only changed posts are written. */
export async function applyRelevance(ws: string, brandId: string, by: string): Promise<{ changed: number; before: { posts: number; views: number }; after: { posts: number; views: number } }> {
  const p = await previewTerms(ws, brandId);
  if (!p) throw new Error("No such brand.");
  const base = await brandBasics(ws, brandId);
  const handles = new Set(base!.handles.map((h) => h.toLowerCase()));
  const m = brandMatcher([...base!.terms, ...base!.handles], base!.never);
  const posts = await brandPosts(ws, brandId);
  const on: string[] = [], off: string[] = [];
  for (const x of posts) {
    const next = isRelevant({ owned: x.source === "owned", tagged: x.tagged_handles ?? [], caption: x.caption }, handles, m);
    if (next !== x.relevant) (next ? on : off).push(x.id);
  }
  // checked_by: who last judged each link's relevance (DECISIONS, 10 Oct 2026); the labels below keep the history
  if (on.length) await sql.query("update posts set relevant = true, checked_by = 'rule:terms' where id = any($1::uuid[])", [on]);
  if (off.length) await sql.query("update posts set relevant = false, checked_by = 'rule:terms' where id = any($1::uuid[])", [off]);
  // the rule's judgment, kept with which terms made it (labels; who applied them is in the audit log)
  const { recordLabels, ruleVersion } = await import("../labels/record");
  await recordLabels(ws, "rule:terms", ruleVersion({ brand: brandId, terms: base!.terms, never: base!.never, handles: base!.handles }), [
    ...on.map((id) => ({ target: "post" as const, target_id: id, kind: "relevant", value: "yes" })),
    ...off.map((id) => ({ target: "post" as const, target_id: id, kind: "relevant", value: "no" })),
  ]).catch((e) => console.error("[labels]", (e as Error).message));
  if (on.length || off.length) await refreshViews();
  const before = { posts: p.total.now, views: p.total.views_now };
  const after = { posts: p.total.after, views: p.total.views_after };
  await audit({ workspace_id: ws, actor: by, area: "data", action: "relevance", path: brandId, old: before, new: { ...after, counting: on.length, not_counting: off.length } });
  return { changed: on.length + off.length, before, after };
}
