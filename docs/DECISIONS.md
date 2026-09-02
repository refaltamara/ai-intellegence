# Decisions log

Decisions made with Refal on 2 Sep 2026 while digesting the PRD, registry, prototype and data. These override the PRD where they conflict.

## Scope of v1 (proof of concept)
- In: Ask (chat with evidence chips), Skills page, /discovery screen, Agents (schedule + diff + email via Resend), Reports in minimal form (list + view of what agents/asks already rendered), Data page.
- Out: WhatsApp delivery (interface stub only), PDF export, billing, multi-tenant admin, user-authored skills, live scraping.
- No client brand in the proof workspace. `brands.is_client` stays false for all; `discovery.exclude_used_by` defaults to empty. Client-brand behaviour is kept in code for later.
- Deployed on Vercel; must be usable from a URL.

## Stack (replaces PRD §2 where different)
- Next.js (App Router) + TypeScript, Drizzle ORM, Postgres on **Neon**, deployed on **Vercel**.
- Agent scheduling via **Vercel Cron** hitting a protected API route (`CRON_SECRET`), not pg-boss/Railway. No long-running worker in v1.
- Claude API: `claude-sonnet-5` for chat. Tool use with `strict: true`, `tool_choice: auto`, prompt caching on system + tools, loop capped at 6 tool calls per turn.
- Email via Resend. `EMAIL_FROM` is the verified sender.
- ETL in Python + pandas (`/etl`), loading `data/raw/*.csv.gz` and `data/seed/brand_mapping_master.csv`.
- `DATABASE_URL_UNPOOLED` is derived in code from `DATABASE_URL` by removing `-pooler` from the host; it is not a separate env var.

## Registry changes
- **Remove** `spend-estimate`.
- **Add** `brand-strategy` (layer: brands, phase 1). One brand, one month or ISO week: posts, creators, tier mix, owned vs earned (TikTok), cart share, content_format mix, product_category mix, top 10 posts, week-by-week volume. Params: `brand` (required), `month` or `week`, `platform`. Output: table+chart, diff_key `brand_id`.
- **Add** `top-content` (layer: posts, phase 1). Best posts by views, comment rate, or engagement rate, filtered by `brands`, `has_cart`, `content_format`, `product_category`, `tiers`, `platform`, `window`. Output: table, diff_key `post_id`. Evidence = the posts themselves.
- `affiliates`: rule is post-level. `has_cart = true` → affiliate post; creator with ≥1 affiliate post in window → affiliator. Registry `rule` block becomes `{min_cart_posts: 1}` with the old thresholds available as optional stricter settings.
- `mercenaries`: drop the PRD's `quarter` param; `window` only.
- `breakout`: fix the example text; `min_views_per_1k` 5000 means 5 views per follower, not 5,000×.
- `narrative`: gate on platform data presence, not only on the `posts` table.
- Tier enum drops `sub`.

## Tier bands (recompute from followers on load)
| Tier | Followers |
|---|---|
| Nano | ≤ 10,000 |
| Micro | 10,001 to 50,000 |
| Mid-Tier | 50,001 to 500,000 |
| Macro | 500,001 to 1,000,000 |
| Mega & Celebrities | > 1,000,000 |

Followers 0 or null → tier null, excluded from per-1k metrics. Discovery keeps `min_followers` so tiny accounts can be excluded.

## Brand identity
- Canonical brand id = `brand` column in `data/seed/brand_mapping_master.csv` (91 brands: 54 on both platforms, 37 Instagram only).
- Display name derived by stripping suffixes (`_id`, `official`, `cosmetics`, `beauty`, `indonesia`, dots and underscores) and title-casing; editable in the seed.

## Environment
- Vercel env: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_CHAT`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`.
- Claude Code cloud environment `fair-intel`: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_CHAT`; network access Custom with `*.neon.tech` plus the default package-manager list.

## Open
- Time zone of `date_posted` in the raw files (assumed Asia/Jakarta local; confirm).
- Whether the Fair Listening MCP topic taxonomy becomes the Phase 2 topic seed.

## Skill engine (M1, 2 Sep 2026, Claude Code; confirm or change)
- **Relative windows are anchored on the latest loaded post, not on today.** `window.last_n_days` (default 90) counts back from the newest `posted_at` in the workspace (30 Jun 2026 today), so "last 30 days" on a static export returns June, not nothing. Absolute `{from,to}` windows behave as written. `meta.data_window` always states the resolved dates.
- **Default windows per skill**: 90 days (discovery, mercenaries, overlap), 30 days (compare, breakout, top-content, affiliates), 180 days (loyalists), latest month in the data (funnel-mix, brand-strategy), lookback 7 days vs 8 prior weeks (waves).
- **Rate rankings carry a views floor.** `discovery` has `min_views` (default 1,000 total views in the window), `top-content` has `min_views` (default 1,000, applied only when ranking by a rate), `breakout` has `min_followers` (default 100). Without these the rankings are dominated by accounts with a few hundred views.
- **Owned-account posts have `creator_id = null`**, so creator-level skills (discovery, mercenaries, loyalists, overlap, affiliates, breakout, funnel-mix, waves, launch) never count a brand's own account as a creator. `compare`, `top-content` and `brand-strategy` include owned posts and label them.
- **Share of voice** (`compare`, `mv_brand_week`) = the brand's share of all tracked posts on the selected platform(s) in the window.
- **Loyalists retention** = creators with posts in at least two distinct months of the window / all creators for the brand in the window; the category median is over brands with at least 20 creators in the window.
- **Waves baseline** = median weekly distinct creators over the 8 weeks before the lookback window, with missing weeks counted as zero.
- **Skill runs are always persisted** to `skill_runs` (params, params_resolved, full result, status, actor). The CLI can pass `--no-persist`.
- **Tests run against the live Neon database** (`src/skills/__tests__/skills.live.test.ts`, skipped without `DATABASE_URL`) rather than the PRD's synthetic fixture DB; the loaded exports are the fixture.

## Ask / chat (M2, 2 Sep 2026, Claude Code; confirm or change)
- **Chat model** is `ANTHROPIC_MODEL_CHAT` (default `claude-sonnet-5`), streaming, `tool_choice: auto`, `strict: true` on all three tools, prompt caching on the system prompt and the tool list, no temperature, at most 6 tool calls per turn, one automatic continuation on `max_tokens`.
- **Evidence ids are renumbered per turn** (`ev_01…` continues across tool calls in the same answer) so two skills in one answer never collide. Persisted per assistant message; ids from earlier turns stay citable, latest turn wins on a clash. Citations to unknown ids are stripped and counted as `evidence_miss`, shown as a small pill on the answer.
- **Tool results sent to the model are trimmed** to 60 rows and 120-character sample texts; the full result is persisted in `skill_runs` and rendered in the UI from the stream.
- **`/discovery` typed in Ask opens the discovery screen** (`/skills/discovery?run=<id>`) after the skill runs; other skills render inline cards. The discovery screen also has its own filter form and CSV export.
- **No client brand**: the system prompt tells the model there is no "your brand" and to ask which brand the user means. "Get this every Monday" produces a draft card via `create_agent_draft`; creation arrives in M3.
- **Chart colours** use the validated colour-blind-safe categorical palette from the dataviz reference (blue, orange, aqua, yellow, magenta, green, violet, red) rather than the prototype's series colours, whose blue/violet pair fails the colour-vision check. UI tokens are the prototype's `:root` block verbatim.
- **No login in the proof of concept.** The app is single-workspace and every route is open; protect the Vercel deployment with Vercel's deployment protection (password) until users/SSO are in scope.
- **Smoke test** (`pnpm smoke`) runs the 20 questions in `tests/smoke/questions.json` through the real chat loop and reports tools called and `evidence_miss`; it skips when no model credentials are set. It has not run yet: this environment has no `ANTHROPIC_API_KEY`.
