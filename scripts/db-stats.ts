/**
 * Prints live database stats: brands, creators, posts, months covered per
 * platform, capture coverage per month, materialized view sizes, last load.
 * Usage: pnpm db:stats [--json]
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl, } from "../src/db/client";
import { DEFAULT_WORKSPACE_ID } from "../src/config/thresholds";

type Row = Record<string, any>;

async function main() {
  const sql = neon(databaseUrl("pooled"));
  const ws = process.env.WORKSPACE_ID ?? DEFAULT_WORKSPACE_ID;
  const json = process.argv.includes("--json");

  const [totals] = (await sql.query(
    `select
       (select count(*) from brands where workspace_id = $1)::int as brands,
       (select count(*) from creators where workspace_id = $1)::int as creators,
       (select count(*) from posts where workspace_id = $1)::int as post_rows,
       (select count(distinct (platform, url)) from posts where workspace_id = $1)::int as unique_posts,
       (select count(*) from comments where workspace_id = $1)::int as comments,
       (select count(*) from post_snapshots)::int as post_snapshots,
       (select max(finished_at) from data_loads where workspace_id = $1) as last_load_at,
       (select max(posted_at) from posts where workspace_id = $1) as latest_post_at`,
    [ws],
  )) as Row[];

  const platforms = (await sql.query(
    `select platform,
            count(*)::int as post_rows,
            count(distinct url)::int as unique_posts,
            count(distinct creator_id)::int as creators,
            count(distinct brand_id)::int as brands,
            count(*) filter (where source = 'owned')::int as owned_posts,
            count(*) filter (where has_cart)::int as cart_posts,
            count(*) filter (where tier is null)::int as no_tier,
            min(month) as first_month, max(month) as last_month,
            count(distinct month)::int as months
     from posts where workspace_id = $1 group by platform order by platform`,
    [ws],
  )) as Row[];

  const months = (await sql.query(
    `select platform, to_char(month, 'YYYY-MM') as month,
            count(*)::int as post_rows,
            count(distinct brand_id)::int as brands,
            count(distinct creator_id)::int as creators,
            count(distinct (posted_at at time zone w.tz)::date)::int as days_captured,
            extract(day from (month + interval '1 month - 1 day'))::int as days_in_month
     from posts p join workspaces w on w.id = p.workspace_id
     where p.workspace_id = $1
     group by platform, month, w.tz order by platform, month`,
    [ws],
  )) as Row[];

  const tiers = (await sql.query(
    `select platform, coalesce(tier, '(unknown)') as tier, count(*)::int as post_rows
     from posts where workspace_id = $1 group by 1, 2 order by 1, 2`,
    [ws],
  )) as Row[];

  const views = (await sql.query(
    `select matviewname as name, pg_size_pretty(pg_total_relation_size('public.' || matviewname)) as size
     from pg_matviews where schemaname = 'public' order by 1`,
  )) as Row[];
  for (const v of views) {
    const [{ n }] = (await sql.query(`select count(*)::int as n from ${v.name}`)) as Row[];
    v.rows = n;
  }

  const loads = (await sql.query(
    `select file, platform, rows_in, rows_loaded, rows_rejected, finished_at
     from data_loads where workspace_id = $1 order by started_at desc limit 5`,
    [ws],
  )) as Row[];

  if (json) {
    console.log(JSON.stringify({ workspace: ws, totals, platforms, months, tiers, views, loads }, null, 2));
    return;
  }

  const n = (x: number) => x.toLocaleString("en-US");
  console.log(`workspace ${ws}`);
  console.log(`brands ${n(totals.brands)} · creators ${n(totals.creators)} · post rows ${n(totals.post_rows)} (unique posts ${n(totals.unique_posts)}) · comments ${n(totals.comments)} · snapshots ${n(totals.post_snapshots)}`);
  console.log(`latest post ${totals.latest_post_at ?? "-"} · last load ${totals.last_load_at ?? "-"}`);
  console.log("\nper platform");
  console.table(platforms.map((p) => ({ ...p, post_rows: n(p.post_rows), unique_posts: n(p.unique_posts), creators: n(p.creators), owned_posts: n(p.owned_posts), cart_posts: n(p.cart_posts), no_tier: n(p.no_tier) })));
  console.log("capture coverage per month");
  console.table(months.map((m) => ({ ...m, post_rows: n(m.post_rows), creators: n(m.creators), coverage: `${m.days_captured}/${m.days_in_month} days (${Math.round((m.days_captured / m.days_in_month) * 100)}%)` })));
  console.log("tier mix (post rows)");
  console.table(tiers.map((t) => ({ ...t, post_rows: n(t.post_rows) })));
  console.log("materialized views");
  console.table(views.map((v) => ({ ...v, rows: n(v.rows) })));
  console.log("recent loads");
  console.table(loads);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
