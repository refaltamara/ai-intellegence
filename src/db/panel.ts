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

/** the platforms the panel's own posts are on, alphabetically; `extra` narrows the posts, over alias p ("and p.source = 'owned'") */
export const panelPlatformsSql = (ws: string, extra = "") =>
  `select v.platform from unnest(${PLATFORM_LIST}) v(platform)
    where exists (select 1 from posts p where p.workspace_id = ${ws} and p.platform = v.platform and p.brought_in_by = 'panel' ${extra}) order by 1`;

/**
 * the panel's newest or oldest post time, as a scalar subquery; `extra` narrows the posts, over alias p. Posts are indexed
 * by workspace, platform and time, so it looks up each platform's edge (one index step each) and keeps the latest or earliest.
 */
export const panelPostEdge = (ws: string, edge: "newest" | "oldest", extra = "") =>
  `(select ${edge === "newest" ? "max" : "min"}(e.t) from unnest(${PLATFORM_LIST}) v(platform)
     cross join lateral (select p.posted_at as t from posts p where p.workspace_id = ${ws} and p.platform = v.platform and p.brought_in_by = 'panel' ${extra}
                           and p.posted_at is not null order by p.posted_at ${dir(edge)} limit 1) e)`;

/** the panel's newest or oldest comment time, as a scalar subquery; `extra` narrows the comments, over alias c */
export const panelCommentEdge = (ws: string, edge: "newest" | "oldest", extra = "") =>
  `(select c.posted_at from comments c where c.workspace_id = ${ws} ${extra} and c.posted_at is not null and ${COMMENT_IN_PANEL("c")} order by c.posted_at ${dir(edge)} limit 1)`;
