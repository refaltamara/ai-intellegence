-- Materialized views derived from posts (PRD §3.3). Refreshed by the loader after
-- every load and by `pnpm db:migrate`. Post-level is the base truth; nothing here
-- is loaded directly. Applied idempotently by scripts/migrate.ts.
--
-- Conventions
--   er_pct           = engagements / views * 100, null when views is 0/null
--   cart_*           = TikTok only (has_cart), null on other platforms
--   views_per_1k     = views / (followers / 1000), null when followers unknown
--   creator views    exclude owned-account posts (creator_id is null for those)

drop materialized view if exists mv_creator_brand_month cascade;
create materialized view mv_creator_brand_month as
with base as (
  select p.workspace_id, p.platform, p.month, p.brand_id, p.creator_id,
         c.handle as creator_handle, c.followers_latest, c.tier_latest,
         p.views, p.engagements, p.engagements_lc, p.comments_count, p.has_cart, p.url, p.posted_at
  from posts p
  join creators c on c.id = p.creator_id
  where p.creator_id is not null
), agg as (
  select workspace_id, platform, month, brand_id, creator_id,
         max(creator_handle) as creator_handle,
         max(followers_latest) as followers,
         max(tier_latest) as tier,
         count(*)::int as posts,
         sum(views)::bigint as views,
         percentile_cont(0.5) within group (order by views)::bigint as median_views,
         sum(engagements)::bigint as engagements,
         sum(engagements_lc)::bigint as engagements_lc,
         sum(comments_count)::bigint as comments_count,
         case when platform = 'tiktok' then count(*) filter (where has_cart) end::int as cart_posts,
         (array_agg(url order by views desc nulls last))[1] as sample_url,
         max(posted_at) as last_post_at
  from base
  group by workspace_id, platform, month, brand_id, creator_id
)
select a.*,
       case when views > 0 then round(engagements::numeric / views * 100, 4) end as er_pct,
       case when views > 0 then round(engagements_lc::numeric / views * 100, 4) end as er_lc_pct,
       case when views > 0 then round(comments_count::numeric / views * 100, 4) end as comment_rate_pct,
       case when platform = 'tiktok' then round(cart_posts::numeric / posts * 100, 2) end as cart_pct,
       case when followers > 0 then round(views::numeric / (followers::numeric / 1000), 2) end as views_per_1k_followers,
       rank() over (partition by workspace_id, platform, month, brand_id order by views desc nulls last, posts desc)::int as rank_in_brand_month
from agg a;
create unique index mv_creator_brand_month_uq on mv_creator_brand_month (workspace_id, platform, month, brand_id, creator_id);
create index mv_creator_brand_month_brand_idx on mv_creator_brand_month (workspace_id, brand_id, month);
create index mv_creator_brand_month_creator_idx on mv_creator_brand_month (creator_id, month);

drop materialized view if exists mv_creator_brand_history cascade;
create materialized view mv_creator_brand_history as
select p.workspace_id, p.platform, p.creator_id, p.brand_id,
       min(p.posted_at) as first_post,
       max(p.posted_at) as last_post,
       count(*)::int as total_posts,
       count(distinct p.month)::int as months_active,
       max(p.posted_at) filter (where p.is_paid) as last_paid_post_at,
       case when p.platform = 'tiktok' then count(*) filter (where p.has_cart) end::int as cart_posts,
       sum(p.views)::bigint as views
from posts p
where p.creator_id is not null
group by p.workspace_id, p.platform, p.creator_id, p.brand_id;
create unique index mv_creator_brand_history_uq on mv_creator_brand_history (workspace_id, creator_id, brand_id);
create index mv_creator_brand_history_brand_idx on mv_creator_brand_history (workspace_id, brand_id, last_post);

drop materialized view if exists mv_brand_week cascade;
create materialized view mv_brand_week as
with wk as (
  select workspace_id, platform, source, brand_id,
         (date_trunc('week', posted_at at time zone 'Asia/Jakarta'))::date as week_start,
         count(*)::int as posts,
         count(distinct creator_id)::int as creators,
         sum(views)::bigint as views,
         sum(engagements)::bigint as engagements,
         sum(comments_count)::bigint as comments_count,
         case when platform = 'tiktok' then count(*) filter (where has_cart) end::int as cart_posts
  from posts
  group by workspace_id, platform, source, brand_id, week_start
), tot as (
  select workspace_id, platform, week_start,
         sum(posts) as ws_posts, sum(views) as ws_views
  from wk group by workspace_id, platform, week_start
)
select w.*,
       to_char(w.week_start, 'IYYY-"W"IW') as iso_week,
       case when t.ws_posts > 0 then round(w.posts::numeric / t.ws_posts * 100, 2) end as sov_posts_pct,
       case when t.ws_views > 0 then round(w.views::numeric / t.ws_views * 100, 2) end as sov_views_pct,
       case when w.views > 0 then round(w.engagements::numeric / w.views * 100, 4) end as er_pct,
       case when w.platform = 'tiktok' and w.posts > 0 then round(w.cart_posts::numeric / w.posts * 100, 2) end as cart_pct
from wk w join tot t using (workspace_id, platform, week_start);
create unique index mv_brand_week_uq on mv_brand_week (workspace_id, platform, source, brand_id, week_start);
create index mv_brand_week_brand_idx on mv_brand_week (workspace_id, brand_id, week_start);

drop materialized view if exists mv_creator_cart_profile cascade;
create materialized view mv_creator_cart_profile as
select workspace_id, creator_id, month,
       count(*)::int as posts,
       count(*) filter (where has_cart)::int as cart_posts,
       round(count(*) filter (where has_cart)::numeric / count(*) * 100, 2) as cart_pct,
       count(distinct brand_id)::int as brands
from posts
where platform = 'tiktok' and creator_id is not null
group by workspace_id, creator_id, month;
create unique index mv_creator_cart_profile_uq on mv_creator_cart_profile (workspace_id, creator_id, month);
