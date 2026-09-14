import { EvidenceList, PLATFORM_LABEL, aggregateEvidence, postEvidence, profileUrl } from "./common";
import { SUBJECT_REPLIES_CAVEAT, commentWhere, commentWindow, labelCaveat, pct } from "./comments-common";
import { limitOf, resolvePlatforms } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

/** /drivers — the posts, accounts and commenters carrying the conversation in the window. */
export const drivers: SkillImpl = async (db, ctx, _def, params) => {
  const platforms = resolvePlatforms(params.platform);
  const w = await commentWindow(db, ctx, params.window, 30, platforms);
  const sort = String(params.sort ?? "negative");
  const limit = limitOf(params, 20);

  const p: unknown[] = [];
  const where = commentWhere(ctx, w, platforms, p);
  const order = sort === "views" ? "p.views desc nulls last, negative desc" : sort === "comments" ? "comments desc, negative desc" : "negative desc, comments desc";
  const pLimit = `$${p.push(limit)}`;
  const posts = await db.q<Row>(
    `select p.id, p.url, p.platform, p.brand_id, p.creator_id, p.creator_handle, p.source, p.stance, p.posted_at, p.views::float8 as views, p.likes,
            p.comments_count, p.shares, p.followers_at_post, p.tier, p.caption, p.content_type,
            count(c.id)::int as comments,
            count(c.id) filter (where c.sentiment = 'negative')::int as negative,
            count(c.id) filter (where c.sentiment = 'neutral')::int as neutral,
            count(c.id) filter (where c.sentiment = 'positive')::int as positive,
            count(c.id) filter (where c.sentiment is null)::int as unlabelled,
            count(distinct c.author_handle)::int as commenters,
            coalesce(sum(c.likes), 0)::int as comment_likes,
            count(*) over() as matched
     from posts p join comments c on c.post_id = p.id
     where ${where}
     group by p.id
     order by ${order}
     limit ${pLimit}`,
    p,
  );
  const matched = posts.length ? Number(posts[0].matched) : 0;
  const accounts = await db.q<Row>(
    `with per_post as (
       select p.id, p.platform, p.creator_handle as handle, p.source, p.followers_at_post, p.views, p.stance,
              count(c.id)::int as comments, count(c.id) filter (where c.sentiment = 'negative')::int as negative,
              count(c.id) filter (where c.sentiment = 'positive')::int as positive
       from posts p join comments c on c.post_id = p.id
       where ${where} and p.creator_handle is not null
       group by p.id)
     select platform, handle, source, max(followers_at_post)::int as followers, count(*)::int as posts, sum(views)::float8 as views,
            sum(comments)::int as comments, sum(negative)::int as negative, sum(positive)::int as positive,
            count(*) filter (where stance = 'negative')::int as posts_against,
            count(*) filter (where stance = 'positive')::int as posts_for,
            count(*) filter (where stance = 'neutral')::int as posts_neutral
     from per_post group by 1, 2, 3 order by negative desc, comments desc limit 12`,
    p.slice(0, p.length - 1),
  );
  const commenters = await db.q<Row>(
    `select c.platform, c.author_handle as handle, count(*)::int as comments, count(distinct c.post_id)::int as posts,
            coalesce(sum(c.likes), 0)::int as likes, count(*) filter (where c.sentiment = 'negative')::int as negative,
            count(*) filter (where c.sentiment = 'positive')::int as positive
     from comments c where ${where} and c.author_handle is not null
     group by 1, 2 order by comments desc, likes desc limit 12`,
    p.slice(0, p.length - 1),
  );
  const totals = await db.one<{ comments: number; unlabelled: number; posts: number }>(
    `select count(*)::int as comments, count(*) filter (where c.sentiment is null)::int as unlabelled, count(distinct c.post_id)::int as posts from comments c where ${where}`,
    p.slice(0, p.length - 1),
  );

  const ev = new EvidenceList(160);
  const rows = posts.map((r) => {
    const id = ev.push((eid) => postEvidence(eid, r, { comments_in_window: r.comments as number, negative: r.negative as number, positive: r.positive as number, stance: (r.stance as string) ?? null }));
    return {
      post_id: r.id, url: r.url, platform: r.platform, account: r.creator_handle, source: r.source, stance: r.stance, posted_at: r.posted_at,
      views: r.views, likes: r.likes, followers: r.followers_at_post, comments: r.comments, negative: r.negative, neutral: r.neutral, positive: r.positive, unlabelled: r.unlabelled,
      negative_pct: pct(r.negative as number, (r.comments as number) - (r.unlabelled as number)), commenters: r.commenters, comment_likes: r.comment_likes,
      caption: r.caption ? String(r.caption).replace(/\s+/g, " ").slice(0, 140) : null, evidence_ids: id ? [id] : [],
    };
  });
  const accountRows = accounts.map((a) => {
    const id = ev.push((eid) => ({ ...aggregateEvidence(eid, `posts by @${a.handle} on ${a.platform} with comments in the window`, `@${a.handle} · ${PLATFORM_LABEL[a.platform as string] ?? a.platform} · ${a.posts} posts`, { followers: (a.followers as number) ?? null, views: (a.views as number) ?? null, comments: a.comments as number, negative: a.negative as number, posts_against: a.posts_against as number, posts_for: a.posts_for as number }), url: profileUrl(a.platform as string, a.handle as string) }));
    return { ...a, evidence_id: id };
  });
  const commenterRows = commenters.map((c) => {
    const id = ev.push((eid) => ({ ...aggregateEvidence(eid, `comments by @${c.handle} on ${c.platform} in the window`, `@${c.handle} · ${PLATFORM_LABEL[c.platform as string] ?? c.platform} · ${c.comments} comments`, { comments: c.comments as number, posts: c.posts as number, likes: c.likes as number, negative: c.negative as number, positive: c.positive as number }), url: profileUrl(c.platform as string, c.handle as string) }));
    return { ...c, evidence_id: id };
  });
  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", sort, limit },
    summary: {
      window: w.label, posts_with_comments: totals?.posts ?? 0, comments: totals?.comments ?? 0, unlabelled: totals?.unlabelled ?? 0,
      sorted_by: sort, top_accounts: accountRows, top_commenters: commenterRows,
      rule: "one row per post that drew comments in the window; accounts are the posts' authors, ranked by negative comments drawn; commenters by comment count",
    },
    rows,
    evidence: ev.list,
    matched,
    data_window: { from: w.from, to: w.to },
    caveats: [...labelCaveat(totals?.comments ?? 0, totals?.unlabelled ?? 0), SUBJECT_REPLIES_CAVEAT, "Stance is the post's own position toward the subject (earned posts only); views are the export's single capture."],
  };
};
