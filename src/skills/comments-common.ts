/**
 * Shared pieces for the comment-layer skills (profile workspaces first, DECISIONS
 * "Profile loader and sentiment labels"). Windows here are over comment time and
 * count back from the newest comment, not the newest post.
 */
import type { SkillDb } from "./db";
import { ParamError, type Context, type Window } from "./params";
import type { Platform } from "./types";
import { commentIn, panelCommentEdge } from "../db/panel";

export type CommentWindow = Window & { anchor: string; from_ts: string; to_ts: string };

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Resolve a window over comments; `to_ts` is exclusive (end of the local day). */
export async function commentWindow(db: SkillDb, ctx: Context, raw: unknown, defaultDays = 30, platforms: Platform[] | null = null): Promise<CommentWindow> {
  // the newest and oldest stored time, then the local day: the (workspace, posted_at) index answers it in a lookup,
  // where taking the max of a converted time read every comment (the same day in any zone without a midnight clock change)
  const only = platforms ? "and c.platform = any($3::text[])" : "";
  const r = await db.one<{ latest: string | null; earliest: string | null }>(
    `select to_char(${panelCommentEdge("$1", "newest", only, ctx.scope)} at time zone $2, 'YYYY-MM-DD') as latest, to_char(${panelCommentEdge("$1", "oldest", only, ctx.scope)} at time zone $2, 'YYYY-MM-DD') as earliest`,
    platforms ? [ctx.workspaceId, ctx.tz, platforms] : [ctx.workspaceId, ctx.tz],
  );
  const anchor = r?.latest ?? ctx.asOf;
  const w = (raw ?? {}) as { last_n_days?: number; from?: string; to?: string };
  let from: string, to: string, label: string;
  if (w.from || w.to) {
    from = w.from ?? (r?.earliest ?? ctx.earliest);
    to = w.to ?? anchor;
    if (from > to) throw new ParamError(`window.from ${from} is after window.to ${to}`);
    label = `${from} to ${to}`;
  } else {
    const n = w.last_n_days ?? defaultDays;
    to = anchor;
    from = addDays(to, -(n - 1));
    label = `last ${n} days of comments (${from} to ${to})`;
  }
  return { from, to, label, anchor, from_ts: from, to_ts: addDays(to, 1) };
}

/** WHERE fragment on comments alias `c` for a window and optional platforms; appends to params. */
export function commentWhere(ctx: Context, w: CommentWindow, platforms: Platform[] | null, params: unknown[]): string {
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const parts = [
    `c.workspace_id = ${p(ctx.workspaceId)}`,
    `c.posted_at >= (${p(w.from_ts)}::date::timestamp at time zone ${p(ctx.tz)})`,
    `c.posted_at < (${p(w.to_ts)}::date::timestamp at time zone ${p(ctx.tz)})`,
    `c.sentiment_source is distinct from 'subject'`,
    // comments under a post that is not about its brand are not about the brand either (DECISIONS 3 Oct 2026), and those
    // under a post only a case brought in count in that case, not here (DECISIONS 10 Oct 2026, step 5)
    ...(ctx.scope?.caseId
      ? [`not exists (select 1 from posts rp where rp.id = c.post_id and rp.relevant = false)`, commentIn(ctx.scope, "c")]
      : [`not exists (select 1 from posts rp where rp.id = c.post_id and (rp.relevant = false or rp.brought_in_by <> 'panel'))`]),
  ];
  if (platforms) parts.push(`c.platform = any(${p(platforms)}::text[])`);
  return parts.join(" and ");
}

export function labelCaveat(total: number, unlabelled: number): string[] {
  if (!total || !unlabelled) return [];
  return [`${unlabelled.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} comments in the window have no sentiment label yet (labelling runs in the background); they are counted as unlabelled, not neutral.`];
}

export const SUBJECT_REPLIES_CAVEAT = "The subject's own replies are excluded from every count.";

/** How many comments in the same window are not about the subject (counted as neutral). */
export async function offTopicCount(db: SkillDb, ctx: Context, w: CommentWindow, platforms: Platform[] | null): Promise<number> {
  const p: unknown[] = [];
  const where = commentWhere(ctx, w, platforms, p) + " and c.off_topic";
  const r = await db.one<{ n: number }>(`select count(*)::int as n from comments c where ${where}`, p);
  return r?.n ?? 0;
}

export function offTopicCaveat(n: number): string[] {
  return n ? [`${n.toLocaleString("en-US")} comments in this window are not about the subject (advertising, unrelated chatter under a viral post). They are counted, as neutral: they are real activity under these posts, and the volume is part of the episode.`] : [];
}

export function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}
