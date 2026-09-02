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
