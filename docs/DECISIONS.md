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

## Skill engine (M1, 2 Sep 2026, Claude Code; confirmed by Refal 2 Sep 2026)
- **Relative windows are anchored on the latest loaded post, not on today.** `window.last_n_days` (default 90) counts back from the newest `posted_at` in the workspace (30 Jun 2026 today), so "last 30 days" on a static export returns June, not nothing. Absolute `{from,to}` windows behave as written. `meta.data_window` always states the resolved dates.
- **Default windows per skill**: 90 days (discovery, mercenaries, overlap), 30 days (compare, breakout, top-content, affiliates), 180 days (loyalists), latest month in the data (funnel-mix, brand-strategy), lookback 7 days vs 8 prior weeks (waves).
- **Rate rankings carry a views floor.** `discovery` has `min_views` (default 1,000 total views in the window), `top-content` has `min_views` (default 1,000, applied only when ranking by a rate), `breakout` has `min_followers` (default 100). Without these the rankings are dominated by accounts with a few hundred views.
- **Owned-account posts have `creator_id = null`**, so creator-level skills (discovery, mercenaries, loyalists, overlap, affiliates, breakout, funnel-mix, waves, launch) never count a brand's own account as a creator. `compare`, `top-content` and `brand-strategy` include owned posts and label them.
- **Share of voice** (`compare`, `mv_brand_week`) = the brand's share of all tracked posts on the selected platform(s) in the window.
- **Loyalists retention** = creators with posts in at least two distinct months of the window / all creators for the brand in the window; the category median is over brands with at least 20 creators in the window.
- **Waves baseline** = median weekly distinct creators over the 8 weeks before the lookback window, with missing weeks counted as zero.
- **Skill runs are always persisted** to `skill_runs` (params, params_resolved, full result, status, actor). The CLI can pass `--no-persist`.
- **Tests run against the live Neon database** (`src/skills/__tests__/skills.live.test.ts`, skipped without `DATABASE_URL`) rather than the PRD's synthetic fixture DB; the loaded exports are the fixture.

## Ask / chat (M2, 2 Sep 2026, Claude Code; confirmed by Refal 2 Sep 2026)
- **Chat model** is `ANTHROPIC_MODEL_CHAT` (default `claude-sonnet-5`), streaming, `tool_choice: auto`, `strict: true` on all three tools, prompt caching on the system prompt and the tool list, no temperature, at most 6 tool calls per turn, one automatic continuation on `max_tokens`.
- **Evidence ids are renumbered per turn** (`ev_01…` continues across tool calls in the same answer) so two skills in one answer never collide. Persisted per assistant message; ids from earlier turns stay citable, latest turn wins on a clash. Citations to unknown ids are stripped and counted as `evidence_miss`, shown as a small pill on the answer.
- **Tool results sent to the model are trimmed** to 60 rows and 120-character sample texts; the full result is persisted in `skill_runs` and rendered in the UI from the stream.
- **`/discovery` typed in Ask opens the discovery screen** (`/skills/discovery?run=<id>`) after the skill runs; other skills render inline cards. The discovery screen also has its own filter form and CSV export.
- **No client brand**: the system prompt tells the model there is no "your brand" and to ask which brand the user means. "Get this every Monday" produces a draft card via `create_agent_draft`; creation arrives in M3.
- **Chart colours** use the validated colour-blind-safe categorical palette from the dataviz reference (blue, orange, aqua, yellow, magenta, green, violet, red) rather than the prototype's series colours, whose blue/violet pair fails the colour-vision check. UI tokens are the prototype's `:root` block verbatim.
- **No login in the proof of concept.** The app is single-workspace and every route is open; protect the Vercel deployment with Vercel's deployment protection (password) until users/SSO are in scope.
- **Smoke test** (`pnpm smoke`) runs the 20 questions in `tests/smoke/questions.json` through the real chat loop and reports tools called and `evidence_miss`; it skips when no model credentials are set. It has not run yet: this environment has no `ANTHROPIC_API_KEY`.

## Agents (M3, 2 Sep 2026, Claude Code; confirmed by Refal 2 Sep 2026)
- **Scheduling**: `vercel.json` runs `/api/cron/agents` every 15 minutes; the route (protected by `CRON_SECRET` as `Authorization: Bearer …`) runs every active agent whose `next_run_at` has passed and advances it from its own cron expression in its own time zone. So an agent's cron can be anything (daily 08:00, weekdays, every 6 hours); it fires within 15 minutes of the scheduled time.
- **Promotion freezes `params_resolved` verbatim**, except: absolute `{from,to}` windows become `{last_n_days: n}`, a `month` becomes `last_n_days: 30`, an ISO `week` becomes `last_n_days: 7`, and `"all"` placeholders are dropped. The notes are shown on the draft.
- **Diff keys**: rows are keyed by `diff_key`, plus `source` when a row has one (compare) and `tier` when the key is a brand (funnel-mix). The first run is a baseline (everything "new", delivered once). Watched-metric thresholds come from the registry `watch` blocks and are stored per agent in `diff_config` so they can be edited: compare share-of-voice ±1 pt / posts ±50% / negative ±5 pts; affiliates accounts ±20% / share ±5 pts; alert skills (waves) deliver when a brand enters the alert state.
- **Delivery**: in-app always (Agents page + a `reports` row per run); email through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set, else the run records "email not configured"; WhatsApp is a logged stub. `should_deliver = !only_if_changed || new || gone || changed`.
- **Every run writes a report row** (`reports`, source `agent`) with Markdown, the diff summary and the first 50 rows, so M4's Reports screen has content on day one. The model-written headline is M4.
- **Free-text setup** ("Every Monday, compare …") calls the model with the `create_agent_draft` tool and needs `ANTHROPIC_API_KEY`; without it, agents are created from a run ("Run this weekly" on /discovery, "Create agent" on a draft card in Ask) or by posting a draft to `/api/agents`.
- **Acceptance test** (`src/agents/__tests__/agents.live.test.ts`) promotes a /discovery run, runs it (baseline of 5), raises the limit to 7 as the seeded change, runs again and asserts exactly 2 new entrants and 0 gone, then a third run with no change is not delivered.

## Reports (M4, 2 Sep 2026, Claude Code; confirmed by Refal 2 Sep 2026)
- **A report is created for every agent run and on "Turn into a report" in Ask.** It stores Markdown plus JSON blocks (headline, what changed, first 50 rows, chart, caveats, cited evidence) and renders with the prototype's document structure: header with a "N changes" pill, lead paragraph, What changed, table (with share-of-voice bars when present), Worth acting on, caveats.
- **The headline and "Worth acting on" are one non-streaming model call** (the Ask system rules plus a `write_report` tool, ≤700 output tokens) with the result JSON in the user message; citations are checked against the run's evidence and unknown ones are stripped. Without a model key the report gets a deterministic headline and is marked "no model headline"; the agent email carries the same headline.
- **PDF export is "Print / Save as PDF"** from the browser in v1; a Markdown download exists at `/api/reports/[id]?format=md`. Server-side PDF (headless Chromium) stays later, as the PRD says.
- **Deleting a report never deletes the run**; deleting an agent keeps its reports (agent_run_id set null).

## Confirmations and changes (Refal, 2 Sep 2026, via chat)
- Relative windows anchored on the newest post: confirmed ("last 30 days" = 1 to 30 June on the current data).
- Views/followers floors on rankings, owned posts labelled and excluded from creator pools, loyalists retention, waves baseline, 15-minute cron polling, first-run baseline, month/week → relative window on promotion, model headline with fallback, browser print for PDF: all confirmed.
- Share of voice: confirmed; it follows the `platform` param, so it can be Instagram only, TikTok only, or combined.
- Chat model: `claude-sonnet-5` for now; Refal wants Opus later. That is the `ANTHROPIC_MODEL_CHAT` variable (`claude-opus-5`), no code change.
- **Login is required (changed from "no login").** Email + password accounts in `users` (`password_hash`, scrypt), a signed HttpOnly session cookie (30 days, `AUTH_SECRET` or `CRON_SECRET`), and a request gate (`proxy.ts`) on every page and API route except `/login`, `/api/auth/*` and the cron route. Accounts are created by the owner with `pnpm user add <email>`; the first account is refal@fair-indonesia.com (owner). No self-signup, no password reset by email in v1; `pnpm user reset <email>` prints a new password.

## Strict tool use (2 Sep 2026, after the first production run)
- Anthropic's strict mode only accepts a JSON Schema subset (every object closed, no size/number constraints) and caps optional parameters at 24 across all strict tools. `run_skill` and `create_agent_draft` carry the union of all skill parameters (45), so they run **non-strict**; their inputs are validated server-side against the skill's own schema and validation errors go back to the model as tool errors. `query_metrics` (fixed filter list, 18 optionals) and the report tool stay strict.
