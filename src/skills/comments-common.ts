/**
 * Shared pieces for the comment-layer skills (profile workspaces first, DECISIONS
 * "Profile loader and sentiment labels"). Windows here are over comment time and
 * count back from the newest comment, not the newest post.
 */
import type { SkillDb } from "./db";
import { ParamError, type Context, type Window } from "./params";
import type { Platform } from "./types";

export type CommentWindow = Window & { anchor: string; from_ts: string; to_ts: string };

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Resolve a window over comments; `to_ts` is exclusive (end of the local day). */
export async function commentWindow(db: SkillDb, ctx: Context, raw: unknown, defaultDays = 30, platforms: Platform[] | null = null): Promise<CommentWindow> {
  const r = await db.one<{ latest: string | null; earliest: string | null }>(
    `select to_char(max(posted_at at time zone $2), 'YYYY-MM-DD') as latest, to_char(min(posted_at at time zone $2), 'YYYY-MM-DD') as earliest
     from comments where workspace_id = $1 and posted_at is not null ${platforms ? "and platform = any($3::text[])" : ""}`,
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
    // a comment that is not about the subject at all (promo spam, unrelated chatter under a
    // viral post) carries no sentiment and never enters a share; the skills report the count
    `c.off_topic is not true`,
  ];
  if (platforms) parts.push(`c.platform = any(${p(platforms)}::text[])`);
  return parts.join(" and ");
}

export function labelCaveat(total: number, unlabelled: number): string[] {
  if (!total || !unlabelled) return [];
  return [`${unlabelled.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} comments in the window have no sentiment label yet (labelling runs in the background); they are counted as unlabelled, not neutral.`];
}

export const SUBJECT_REPLIES_CAVEAT = "The subject's own replies are excluded from every count.";

/** How many comments in the same window were set aside as not about the subject. */
export async function offTopicCount(db: SkillDb, ctx: Context, w: CommentWindow, platforms: Platform[] | null): Promise<number> {
  const p: unknown[] = [];
  const where = commentWhere(ctx, w, platforms, p).replace("c.off_topic is not true", "c.off_topic");
  const r = await db.one<{ n: number }>(`select count(*)::int as n from comments c where ${where}`, p);
  return r?.n ?? 0;
}

export function offTopicCaveat(n: number): string[] {
  return n ? [`${n.toLocaleString("en-US")} comments in this window were set aside as not about the subject (advertising, unrelated chatter under a viral post); they are in no percentage here.`] : [];
}

export function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}
