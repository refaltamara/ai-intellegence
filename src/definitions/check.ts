/**
 * The daily totals against what they are counted from (src/definitions/totals.ts): every difference is 0 when the
 * serving layer is in step with the core. Also checks them against the Brand & KOL dashboard's own monthly numbers
 * (src/dashboard/data.ts, which counts straight from posts), so a screen moved onto the totals shows what it showed.
 */
import { sql } from "../db/client";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { buckets } from "../dashboard/data";
import { monthOf } from "../dashboard/period";
import { sqlOf } from "./catalog";

const q = async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[];

export type TotalsCheck = {
  workspace: string; rows: number;
  /** brand rows against the links they count */
  links: number; views: number; engagement: number; flagged: number; carts: number;
  /** panel rows against each post once */
  panel_posts: number; panel_views: number; d7_posts: number; d7_views: number;
  /** creator days against the earned links with a creator */
  creator_posts: number;
  /** the dashboard's brand × platform × month posts and views, nine months back from its latest month */
  dashboard: number;
};

export async function checkTotals(which: string[] | null = null): Promise<TotalsCheck[]> {
  const ws = await q<{ id: string }>(
    `select w.id from workspaces w where exists (select 1 from posts p where p.workspace_id = w.id) and ($1::text[] is null or w.id = any($1::text[])) order by 1`, [which]);
  const out: TotalsCheck[] = [];
  for (const { id } of ws) {
    const [t] = await q<Record<string, number>>(
      `with b as (select coalesce(sum(posts), 0)::bigint as posts, coalesce(sum(views), 0)::bigint as views, coalesce(sum(engagement), 0)::bigint as eng,
                         coalesce(sum(flagged), 0)::bigint as flagged, coalesce(sum(cart_posts), 0)::bigint as carts, count(*)::int as rows
                    from daily_totals where workspace_id = $1 and brand_id <> '*'),
            pn as (select coalesce(sum(posts), 0)::bigint as posts, coalesce(sum(views), 0)::bigint as views, coalesce(sum(d7_posts), 0)::bigint as d7_posts,
                          coalesce(sum(d7_views), 0)::bigint as d7_views, count(*)::int as rows
                     from daily_totals where workspace_id = $1 and brand_id = '*'),
            l as (select count(*)::bigint as posts, coalesce(sum(i.views), 0)::bigint as views, coalesce(sum(${sqlOf("engagement", "i")}), 0)::bigint as eng,
                         count(*) filter (where ${sqlOf("flagged", "i")})::bigint as flagged, count(*) filter (where p.has_cart)::bigint as carts,
                         count(*) filter (where p.source = 'earned' and i.creator_id is not null)::bigint as creator_posts
                    from posts p join post_items i on i.id = p.item_id where p.workspace_id = $1 and p.relevant is not false),
            it as (select count(*)::bigint as posts, coalesce(sum(i.views), 0)::bigint as views, count(d.day_n)::bigint as d7_posts, coalesce(sum(d.views), 0)::bigint as d7_views
                     from post_items i left join post_d7 d on d.item_id = i.id
                    where i.workspace_id = $1 and exists (select 1 from posts p where p.item_id = i.id and p.relevant is not false)),
            c as (select coalesce(sum(posts), 0)::bigint as posts from daily_creators where workspace_id = $1)
       select b.rows + pn.rows as rows, b.posts - l.posts as links, b.views - l.views as views, b.eng - l.eng as engagement, b.flagged - l.flagged as flagged,
              b.carts - l.carts as carts, pn.posts - it.posts as panel_posts, pn.views - it.views as panel_views, pn.d7_posts - it.d7_posts as d7_posts,
              pn.d7_views - it.d7_views as d7_views, c.posts - l.creator_posts as creator_posts
         from b, pn, l, it, c`, [id]);
    // the dashboard, counted its own way, month by month
    const db = new SkillDb();
    const ctx = await loadContext(db, id);
    const { rows } = await buckets(db, ctx, { platform: "all", brands: [], period: monthOf(ctx.asOf) });
    const from = rows.reduce((m, r) => (r.bucket < m ? r.bucket : m), "9999-12-31");
    const mine = await q<{ brand_id: string; platform: string; bucket: string; posts: number; views: number }>(
      `select brand_id, platform, to_char(date_trunc('month', day), 'YYYY-MM-DD') as bucket, sum(posts)::int as posts, sum(views)::float8 as views
         from daily_totals where workspace_id = $1 and brand_id <> '*' and day >= $2::date and day <= $3::date group by 1, 2, 3`,
      [id, from, monthOf(ctx.asOf).to]);
    const key = (r: { brand_id: string; platform: string; bucket: string }) => `${r.brand_id}|${r.platform}|${r.bucket}`;
    const theirs = new Map(rows.map((r) => [key(r), r]));
    const ours = new Map(mine.map((r) => [key(r), r]));
    let dashboard = 0;
    for (const k of new Set([...theirs.keys(), ...ours.keys()])) {
      const a = theirs.get(k), b = ours.get(k);
      if (!a || !b || Number(a.posts) !== Number(b.posts) || Number(a.views) !== Number(b.views)) dashboard++;
    }
    out.push({ workspace: id, rows: Number(t.rows), links: Number(t.links), views: Number(t.views), engagement: Number(t.engagement), flagged: Number(t.flagged), carts: Number(t.carts),
      panel_posts: Number(t.panel_posts), panel_views: Number(t.panel_views), d7_posts: Number(t.d7_posts), d7_views: Number(t.d7_views), creator_posts: Number(t.creator_posts), dashboard });
  }
  return out;
}
