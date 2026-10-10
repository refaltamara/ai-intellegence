/**
 * The panel's own data, read cheaply (DECISIONS, 10 Oct 2026, step 5; definition case_post). A post only a case brought in
 * never counts in the panel, nor the comments under it. Where a query used to read an index alone (the newest post, the
 * platforms a panel holds, the newest comment), these lookups keep that speed: each stops at the first row that counts.
 * `ws` is a SQL parameter reference such as $1; the platform list is a fixed constant, never input.
 */
import { PLATFORMS } from "./schema";

const PLATFORM_LIST = `array[${PLATFORMS.map((p) => `'${p}'`).join(", ")}]::text[]`;
const dir = (edge: "newest" | "oldest") => (edge === "newest" ? "desc" : "asc");

/** a comment counts in the panel unless its post is one only a case brought in (comments without a post count, as before) */
export const COMMENT_IN_PANEL = (c = "c") => `not exists (select 1 from posts cp where cp.id = ${c}.post_id and cp.brought_in_by <> 'panel')`;

/**
 * What a screen counts: the panel's own posts, or a case's (step 5: every post the case caught, case_posts, whether or not
 * the panel has it too). A case's screens run the panel's queries with its scope.
 */
export type Scope = { caseId: string | null };
export const PANEL: Scope = { caseId: null };
const CASE_ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
/**
 * a case's posts as SQL (case ids are slugs, src/cases/store.ts, checked again here because they are written into the
 * query). Posts join the case's list, so a query can start from the case's few posts; comments look each one up in the list,
 * hashed once (inside coalesce the planner keeps it a list), since a join there let it, guessing few comments, walk the
 * case's posts once per comment.
 */
function caseIn(s: Scope, item: string, hashed: boolean): string {
  if (!s.caseId || !CASE_ID.test(s.caseId)) throw new Error(`not a case id: ${s.caseId}`);
  const list = `${item} in (select k.item_id from case_posts k where k.case_id = '${s.caseId}')`;
  return hashed ? `coalesce(${list}, false)` : list;
}
/** the posts a scope counts, over alias p */
export const postIn = (s: Scope, p = "p") => (s.caseId ? caseIn(s, `${p}.item_id`, false) : `${p}.brought_in_by = 'panel'`);
/** the comments a scope counts, over alias c */
export const commentIn = (s: Scope, c = "c") => (s.caseId ? caseIn(s, `${c}.item_id`, true) : COMMENT_IN_PANEL(c));
/** a scope's key, for caches */
export const scopeKey = (ws: string, s: Scope) => (s.caseId ? `${ws}#${s.caseId}` : ws);

/** the platforms the panel's own posts are on (or a case's), alphabetically; `extra` narrows the posts, over alias p ("and p.source = 'owned'") */
export const panelPlatformsSql = (ws: string, extra = "", scope: Scope = PANEL) =>
  scope.caseId
    ? `select distinct p.platform from posts p where p.workspace_id = ${ws} and ${postIn(scope)} ${extra} order by 1`
    : `select v.platform from unnest(${PLATFORM_LIST}) v(platform)
    where exists (select 1 from posts p where p.workspace_id = ${ws} and p.platform = v.platform and p.brought_in_by = 'panel' ${extra}) order by 1`;

/**
 * the panel's newest or oldest post time, as a scalar subquery; `extra` narrows the posts, over alias p. Posts are indexed
 * by workspace, platform and time, so it looks up each platform's edge (one index step each) and keeps the latest or earliest.
 */
export const panelPostEdge = (ws: string, edge: "newest" | "oldest", extra = "", scope: Scope = PANEL) =>
  scope.caseId
    ? `(select ${edge === "newest" ? "max" : "min"}(p.posted_at) from posts p where p.workspace_id = ${ws} and ${postIn(scope)} ${extra})`
    : `(select ${edge === "newest" ? "max" : "min"}(e.t) from unnest(${PLATFORM_LIST}) v(platform)
     cross join lateral (select p.posted_at as t from posts p where p.workspace_id = ${ws} and p.platform = v.platform and p.brought_in_by = 'panel' ${extra}
                           and p.posted_at is not null order by p.posted_at ${dir(edge)} limit 1) e)`;

/** the panel's newest or oldest comment time, as a scalar subquery; `extra` narrows the comments, over alias c */
export const panelCommentEdge = (ws: string, edge: "newest" | "oldest", extra = "", scope: Scope = PANEL) =>
  scope.caseId
    ? `(select ${edge === "newest" ? "max" : "min"}(c.posted_at) from comments c where c.workspace_id = ${ws} ${extra} and ${commentIn(scope)})`
    : `(select c.posted_at from comments c where c.workspace_id = ${ws} ${extra} and c.posted_at is not null and ${COMMENT_IN_PANEL("c")} order by c.posted_at ${dir(edge)} limit 1)`;
