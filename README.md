# Fair Intel

AI marketing intelligence for Indonesian beauty brands, built on Fair's social listening data. Chat asks questions; Claude answers only through skills that query the database, and every number carries evidence.

Start with `CLAUDE.md`, then `docs/DECISIONS.md`, `docs/DATA_NOTES.md`, `docs/PRD.md`.

Layout:
- `docs/` — PRD, decisions log, data notes, UI prototype
- `skills.registry.json` — the 23-skill catalogue (to be revised per DECISIONS)
- `data/raw/` — Q1/Q2 2026 post-level exports as gzipped CSV, with the original README notes
- `data/seed/` — canonical brand mapping across TikTok and Instagram

## Running (M0)

Requirements: Node 22+, pnpm, Python 3.11+ with pandas (`pip install -r etl/requirements.txt`), and `DATABASE_URL` (Neon pooled URL) in the environment or `.env`.

```
pnpm install
pnpm db:generate      # regenerate src/db/migrations from src/db/schema.ts after schema edits
pnpm db:migrate       # apply migrations, then (re)create the materialized views in src/db/views.sql
pnpm etl:load         # python3 etl/load.py --all: brands seed + the three raw files + refresh views
pnpm db:stats         # live counts, months per platform, capture coverage, view sizes, recent loads
pnpm test             # vitest: config sync, registry integrity, and every Phase 1 skill against the live DB
pnpm skill list       # the 24 registered skills
pnpm skill run brand-strategy --params '{"brand":"skintific","month":"2026-06"}' --compact
pnpm skill run discovery --params '{"used_by":["skintific_official"],"tiers":["nano"],"platform":"tiktok"}'
```

Skills (M1): `src/skills/registry.ts` loads `skills.registry.json`; `runner.ts` validates params (JSON Schema with defaults), checks the data layers a skill requires, runs it, rejects results without evidence, and persists to `skill_runs`. Twelve Phase 1 skills are implemented (discovery, mercenaries, loyalists, affiliates, breakout, funnel-mix, overlap, waves, top-content, compare, launch, brand-strategy); the rest return `status: "unavailable"` with a plain message until their data layer is loaded. Relative windows count back from the newest loaded post (see `docs/DECISIONS.md`, "Skill engine").

Notes:
- Database access goes over Neon's HTTPS SQL endpoint (`@neondatabase/serverless` in TypeScript, `etl/neon_http.py` in Python), so nothing needs port 5432. The unpooled URL is derived from `DATABASE_URL` in `src/db/client.ts`. Node scripts set `NODE_USE_ENV_PROXY=1` so `fetch` honours `HTTPS_PROXY` in sandboxes.
- The loader rejects rows with unknown brand slugs, missing urls, or unparseable dates and reports them; it never guesses. Re-running is idempotent (upsert on `(workspace_id, platform, url, brand_id)`).
- Timestamps in the raw files are read as `Asia/Jakarta` local time and stored in UTC (`SOURCE_TZ` in config; still an open item in `docs/DECISIONS.md`).
- Tiers are recomputed from followers on load with the bands in `docs/DECISIONS.md`; followers 0 or missing give tier `null`.
- `data/seed/brand_mapping_master.csv` now carries a `display_name` column (derived once by the suffix rule; edit freely, the loader prefers it).
