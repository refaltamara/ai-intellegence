refresh materialized view mv_creator_brand_month;
refresh materialized view mv_creator_brand_history;
refresh materialized view mv_brand_week;
refresh materialized view mv_creator_cart_profile;
-- fresh statistics after every load: the planner sizes a workspace from them (DECISIONS 8 Oct 2026)
analyze posts;
analyze comments;
analyze creators;
