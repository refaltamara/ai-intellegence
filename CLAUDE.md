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

## Partner experience (docs/PRD_V2_PARTNER.md, v2.1 amendments)
- The product and persona are CeMO ("Your CMO", Creator Intelligence for Market Monitoring). "Fair Intel" is the codename.
- Inside a conversation, skills are internal: never a skill name, slash command, tool name, or "Running…" in the thread or in model text. The server strips slashed skill names and logs mechanism_leak for anything else. The Skills page stays in the sidebar as the library of what CeMO can do.
- Activity strings and result-card titles come from skills.registry.json (`activity`, `title`), templated from workspace counts, params_resolved and SkillResult.meta.
- The model asks at most one clarifying question per turn (ask_user; the turn ends on it and the next user message is its tool_result), may emit one <counter> block per answer (rendered amber), and ends substantive answers with a <followups> block that the server parses, validates against available analyses, and strips. Follow-ups are never a tool call.
- Client brand is workspaces.client_brand_id (owner sets it on the Data page; default none) until Decisions ship, then decisions.client_brand_id.
- Chats (`/`) is the default and free-form; Decisions (`/decisions`) carries the brief, watchers' findings and the decisions. Next: the evidence pane with /discovery folded in, then brand pages without sounds. No pg-boss; no strict tools.

