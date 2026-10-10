/**
 * The serving layer (DECISIONS, 10 Oct 2026, step 4): what every screen's numbers are made of, counted once by the
 * definitions in catalog.ts and rebuilt per workspace after every load, every change of relevance, and each night.
 *   post_d7          each post's reading at day 7: the reading nearest day 7 after posting, from any of its links'
 *                    readings; a post that went up less than 7 days before the data's latest reading is too new
 *   daily_totals     per local day of posting, brand, platform and owned or earned: posts, flags, carts, views,
 *                    engagement (latest and at day 7), and the rated sums rates are made of; brand '*' counts each post once
 *   daily_creators   per day, brand, platform and creator: earned posts, carts, views, for creators, affiliators and the
 *                    viewership mix, which are worked out per period
 * A post set aside as not about its brand (relevant = false) never counts.
 */
import { sql } from "../db/client";
import { CATALOG_VERSION, sqlOf } from "./catalog";

const q = async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[];

/**
 * The reading nearest day 7; on a tie the later one, then the latest read, then the most views. A post is too new when it
 * went up less than 7 days before the workspace's latest reading (the data's as-of, not the clock, so a rebuild without
 * new data changes nothing). A post whose reading came before day 7 and was never read again keeps that reading.
 */
const D7_SQL = `
  with r as (
    select distinct on (p.item_id) p.item_id, r.day_n, r.read_at, r.views, r.likes, r.comments_count, r.shares, r.saves
      from posts p join post_readings r on r.post_id = p.id
     where p.workspace_id = $1
     order by p.item_id, abs(r.day_n - 7), r.day_n desc, r.read_at desc, r.views desc nulls last
  ), asof as (
    select max(r.read_at) as t from posts p join post_readings r on r.post_id = p.id where p.workspace_id = $1
  ), v as (
    select r.*, i.posted_at <= (select t from asof) - interval '7 days' as ok from r join post_items i on i.id = r.item_id
  ), w as (
    insert into post_d7 (item_id, workspace_id, day_n, read_at, views, likes, comments_count, shares, saves)
    select item_id, $1, case when ok then day_n end, case when ok then read_at end, case when ok then views end, case when ok then likes end,
           case when ok then comments_count end, case when ok then shares end, case when ok then saves end
      from v
    on conflict (item_id) do update set day_n = excluded.day_n, read_at = excluded.read_at, views = excluded.views, likes = excluded.likes,
      comments_count = excluded.comments_count, shares = excluded.shares, saves = excluded.saves
    where (post_d7.day_n, post_d7.read_at, post_d7.views, post_d7.likes, post_d7.comments_count, post_d7.shares, post_d7.saves)
          is distinct from (excluded.day_n, excluded.read_at, excluded.views, excluded.likes, excluded.comments_count, excluded.shares, excluded.saves)
    returning 1
  )
  select (select count(*) from v)::int as posts, (select count(*) from v where not ok)::int as too_new, (select count(*) from w)::int as changed`;

/** the sums one group of posts gives: `x` carries a post's numbers (latest as i_*, day 7 as d_*), its flag and its cart */
const SUMS = `
  count(*)::int, count(*) filter (where flagged)::int, count(*) filter (where cart)::int,
  coalesce(sum(views), 0), coalesce(sum(eng), 0), coalesce(sum(eng_lc), 0), coalesce(sum(comments), 0),
  count(*) filter (where r)::int, coalesce(sum(views) filter (where r), 0), coalesce(sum(eng) filter (where r), 0),
  count(*) filter (where r_lc)::int, coalesce(sum(views) filter (where r_lc), 0), coalesce(sum(eng_lc) filter (where r_lc), 0),
  count(*) filter (where d7)::int, coalesce(sum(d_views), 0), coalesce(sum(d_eng), 0), coalesce(sum(d_eng_lc), 0),
  count(*) filter (where d_r)::int, coalesce(sum(d_views) filter (where d_r), 0), coalesce(sum(d_eng) filter (where d_r), 0),
  count(*) filter (where d_r_lc)::int, coalesce(sum(d_views) filter (where d_r_lc), 0), coalesce(sum(d_eng_lc) filter (where d_r_lc), 0)`;

const TOTAL_COLS = `workspace_id, day, brand_id, platform, source, posts, flagged, cart_posts, views, engagement, engagement_lc, comments,
  rated_posts, rated_views, rated_engagement, rated_lc_posts, rated_lc_views, rated_lc_engagement,
  d7_posts, d7_views, d7_engagement, d7_engagement_lc, d7_rated_posts, d7_rated_views, d7_rated_engagement, d7_rated_lc_posts, d7_rated_lc_views, d7_rated_lc_engagement, definitions`;

/** a post's numbers by the definitions: i = post_items, d = post_d7 */
const NUMBERS = `
  i.views, ${sqlOf("engagement", "i")} as eng, ${sqlOf("engagement_lc", "i")} as eng_lc, i.comments_count as comments,
  not ${sqlOf("flagged", "i")} and ${sqlOf("engagement_rate", "i")} as r,
  not ${sqlOf("flagged", "i")} and ${sqlOf("engagement_rate_lc", "i")} as r_lc,
  d.day_n is not null as d7, d.views as d_views, ${sqlOf("engagement", "d")} as d_eng, ${sqlOf("engagement_lc", "d")} as d_eng_lc,
  not ${sqlOf("flagged", "i")} and ${sqlOf("engagement_rate", "d")} as d_r,
  not ${sqlOf("flagged", "i")} and ${sqlOf("engagement_rate_lc", "d")} as d_r_lc,
  ${sqlOf("flagged", "i")} as flagged`;

/** a brand's rows count its links */
const BRAND_SQL = `
  insert into daily_totals (${TOTAL_COLS})
  select $1, day, brand_id, platform, source, ${SUMS}, $3
    from (select (i.posted_at at time zone $2)::date as day, p.brand_id, p.platform, p.source, coalesce(p.has_cart, false) as cart, ${NUMBERS}
            from posts p join post_items i on i.id = p.item_id left join post_d7 d on d.item_id = i.id
           where p.workspace_id = $1 and p.relevant is not false) x
   group by day, brand_id, platform, source`;

/** the panel's rows ('*') count each post once: owned when a panel brand's own account posted it */
const PANEL_SQL = `
  insert into daily_totals (${TOTAL_COLS})
  select $1, day, '*', platform, source, ${SUMS}, $3
    from (select (i.posted_at at time zone $2)::date as day, i.platform, case when l.owned then 'owned' else 'earned' end as source, l.cart, ${NUMBERS}
            from (select p.item_id, bool_or(p.source = 'owned') as owned, bool_or(coalesce(p.has_cart, false)) as cart
                    from posts p where p.workspace_id = $1 and p.relevant is not false group by p.item_id) l
            join post_items i on i.id = l.item_id left join post_d7 d on d.item_id = i.id) x
   group by day, platform, source`;

/** a creator's earned links per day and brand (the brand's own accounts are not creators) */
const CREATORS_SQL = `
  insert into daily_creators (workspace_id, day, brand_id, platform, creator_id, posts, cart_posts, views, d7_views, engagement_lc, followers, definitions)
  select $1, (i.posted_at at time zone $2)::date, p.brand_id, p.platform, i.creator_id, count(*)::int, count(*) filter (where p.has_cart)::int,
         coalesce(sum(i.views), 0), coalesce(sum(d.views), 0), coalesce(sum(${sqlOf("engagement_lc", "i")}), 0), max(i.followers_at_post), $3
    from posts p join post_items i on i.id = p.item_id left join post_d7 d on d.item_id = i.id
   where p.workspace_id = $1 and p.relevant is not false and p.source = 'earned' and i.creator_id is not null
   group by 2, 3, 4, 5`;

export type ServingReport = { workspace: string; posts: number; too_new: number; d7_changed: number; totals: number; creators: number; ms: number };

/** rebuild one workspace's serving rows; readers see the old rows until the new ones are in (one transaction) */
export async function refreshServing(ws: string): Promise<ServingReport> {
  const started = Date.now();
  const tz = (await q<{ tz: string }>(`select tz from workspaces where id = $1`, [ws]))[0]?.tz;
  if (!tz) throw new Error(`no workspace ${ws}`);
  const d7 = (await q<{ posts: number; too_new: number; changed: number }>(D7_SQL, [ws]))[0];
  const r = (await sql.transaction([
    sql.query(`delete from daily_totals where workspace_id = $1`, [ws]),
    sql.query(`delete from daily_creators where workspace_id = $1`, [ws]),
    sql.query(`with i as (${BRAND_SQL} returning 1) select count(*)::int as n from i`, [ws, tz, CATALOG_VERSION]),
    sql.query(`with i as (${PANEL_SQL} returning 1) select count(*)::int as n from i`, [ws, tz, CATALOG_VERSION]),
    sql.query(`with i as (${CREATORS_SQL} returning 1) select count(*)::int as n from i`, [ws, tz, CATALOG_VERSION]),
  ])) as unknown as [unknown, unknown, { n: number }[], { n: number }[], { n: number }[]];
  return { workspace: ws, posts: d7.posts, too_new: d7.too_new, d7_changed: d7.changed, totals: r[2][0].n + r[3][0].n, creators: r[4][0].n, ms: Date.now() - started };
}

/** every workspace that has posts, or only those `which` names */
export async function refreshAll(which: string[] | null = null, log: (s: string) => void = () => {}): Promise<ServingReport[]> {
  const ws = await q<{ id: string }>(`select distinct workspace_id as id from posts where $1::text[] is null or workspace_id = any($1::text[]) order by 1`, [which]);
  const out: ServingReport[] = [];
  for (const { id } of ws) {
    const r = await refreshServing(id);
    out.push(r);
    log(`${id}: ${r.posts} posts (${r.too_new} too new for day 7, ${r.d7_changed} day-7 readings written), ${r.totals} daily totals, ${r.creators} creator days (${r.ms} ms)`);
  }
  return out;
}
