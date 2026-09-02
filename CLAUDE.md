Project: Fair Intel — AI marketing intelligence on Fair's social listening data (Indonesian beauty, TikTok + Instagram).

Read in this order before doing anything: docs/DECISIONS.md (overrides), docs/DATA_NOTES.md (what the data actually contains), docs/PRD.md (full spec), skills.registry.json (skill catalogue). UI reference: docs/prototype/fair-intel-prototype-v2.html.

Rules:
1. The model never computes numbers; skills and the query builder do, in SQL. Every skill result must include evidence; the runner rejects results without it.
2. skills.registry.json is the single source of truth for skills. UI, slash menu, and the run_skill tool definition are generated from it.
3. No raw SQL from model input. query_metrics is a whitelisted builder only.
4. All tables carry workspace_id. Brand ids are the canonical slugs in data/seed/brand_mapping_master.csv.
5. Tier and affiliate thresholds live in src/config; never hardcode. Bands are in docs/DECISIONS.md.
6. Instagram posts can belong to several brands; uniqueness is (platform, url, brand). Owned vs earned exists on TikTok only.
7. Skills whose data layer is missing return status "unavailable" with a plain message. velocity, forecast, narrative and all comment-layer skills are unavailable in v1.
8. Stack: Next.js App Router + TypeScript, Drizzle, Neon Postgres, Vercel (Vercel Cron for agents), Resend email, Python/pandas ETL. Do not add Railway, pg-boss, or Redis.
9. Use `pnpm skill run <name>` to verify skills before touching UI. Verification: pnpm test, pnpm smoke, pnpm db:stats.
10. Do not integrate Fair Space or Fair Hub. Never commit secrets; .env is gitignored.
