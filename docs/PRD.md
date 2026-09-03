# Fair Intel — Product Requirements Document (v1 build)

Working title: **Fair Intel** (name TBD). Owner: Refal. Target builder: Claude Code.
Companion files: `fair-intel-prototype-v2.html` (UI reference, pixel-level), `skills.registry.json` (machine-readable skill catalogue used by the app).

---

## 0. What we are building, in one paragraph

An AI marketing-intelligence product for Indonesian beauty brands, built on Fair's proprietary social listening data (TikTok, Instagram, Threads, X — every brand in the category, not just the client). A user asks questions in chat; a general reasoning model (Claude) answers only through **tools that query Fair's database**, so every number is real and every claim carries evidence. The product exposes **skills** — 23 named analyses with defined inputs and outputs — which can be run once in chat or promoted into **agents** that re-run on a schedule and report only what changed. The data is the moat; the skills are the product; the chat is the interface.

Positioning: "Claude, but for socials." Go to market through the creator wedge (creator discovery is the first thing a buyer will pay for); the engine underneath is general.

---

## 1. Scope for v1

### In scope
1. **Data contract + loader**: a canonical Postgres schema that Refal's cleaned exports load into. Refal owns the cleaning; the app owns the schema and the loader entry point.
2. **Skill engine**: registry + runner. 23 skills declared; the ones runnable on creator/post data ship now, the comment-layer ones ship when comment data lands (Phase 2).
3. **Ask (chat)**: Claude API with tools, streaming, evidence chips, slash-menu for skills, conversation history.
4. **Agents**: create from a skill run ("run this weekly"), inherit the full run, schedule, diff against previous run, deliver via email (WhatsApp adapter stubbed).
5. **Reports**: persisted, rendered output of any run or agent run; export to PDF later.
6. **UI**: the five screens in the prototype — Ask, Skills, Agents, Reports, Data — plus the /discovery result screen.

### Out of scope for v1
- Dashboards (charts are chat/report output only; dashboards come once usage shows which charts people ask for).
- Fair Space and Fair Hub integration. Do not connect them.
- Billing, multi-tenant admin, SSO. Single workspace per deployment is fine for v1; keep `workspace_id` on every table so multi-tenant is a config change later.
- User-authored skills (this is the platform endgame; design the registry so it can be user-extended, but don't build the authoring UI).
- Live re-fetching from platforms. v1 runs on data loaded into Postgres. "Refresh" in /discovery means "read the latest snapshot we have", not "scrape now".

### Data available at build time (from Refal)
- **Instagram**: Q1 + Q2 2026 (tagged posts + owned accounts).
- **TikTok**: Q2 2026, post-level, with performance, content fields, and brand mapping (keyword/hashtag search + owned accounts).
- **Comments, sentiment, topics**: **not available yet**. Schema must accept them; skills that need them are registered but return `status: "unavailable"` with a clear message until the tables are populated.
- Reference example of an aggregated export: `Raw_Data_Example.xlsx` (columns: month, brand, rank, creator_username, tier, followers, posts, views, median_views, engagements, er_pct, views_per_1k_followers, cart_pct, months_in_top20, repeat_flag, sample_url).

---

## 2. Recommended stack (opinionated; change if there's a strong reason)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) + TypeScript** | One repo for UI + API routes + streaming; easy on Railway/Vercel |
| DB | **Postgres 16** | Window functions and materialized views do most of the skill work; keep the model out of arithmetic |
| ORM / migrations | **Drizzle** | Typed SQL that stays close to real SQL, which the skills need |
| Model | **Claude API** — `claude-sonnet-5` for chat; `claude-haiku-4-5-20251001` for bulk classification in Phase 2 | Sonnet for tool-using conversation quality at reasonable cost; Haiku for millions of comment classifications |
| SDK | `@anthropic-ai/sdk` (TypeScript) | Use the SDK's tool runner for the agentic loop where it fits; hand-roll only for streaming custom events |
| Jobs | **pg-boss** (Postgres-backed queue) | No Redis to run; one worker process handles agents and Phase-2 classification |
| Deploy | **Railway**: web + worker + Postgres | Matches where Fair already runs its MCP |
| ETL | **Python + pandas** scripts in `/etl` | Refal is already cleaning in pandas; loader is a thin `COPY` into staging tables |

Environment variables (`.env.example` must exist):
```
DATABASE_URL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL_CHAT=claude-sonnet-5
ANTHROPIC_MODEL_BULK=claude-haiku-4-5-20251001
APP_URL=
EMAIL_PROVIDER=resend   # or smtp
EMAIL_API_KEY=
WHATSAPP_PROVIDER=stub  # adapter; real provider later
TZ_DEFAULT=Asia/Jakarta
```

---

## 3. Data model

Design rules:
- **Post-level is the base truth.** Everything creator-month or brand-week is derived (materialized views), never loaded directly. If an export only has aggregates (some IG months may), load them into `creator_brand_month_import` and mark `derived=false` so skills can flag reduced confidence.
- Every table carries `workspace_id` (v1 has one workspace: `beauty-id`).
- IDs are stable slugs where possible (`brand.slug`, `creator.handle` per platform) so tool results are readable by the model.
- Timestamps in UTC; display in `Asia/Jakarta`.

### 3.1 Core tables

```sql
-- Workspaces and users
workspaces(id text pk, name, category text, client_brand_id text, created_at)
users(id uuid pk, workspace_id, email, name, role text, whatsapp_e164 text null, created_at)

-- Brands tracked in the category (client + competitors)
brands(
  id text pk,               -- slug, e.g. 'skintific'
  workspace_id,
  name text,
  is_client boolean,        -- the "your brand" in the UI
  owned_handles jsonb,      -- {"tiktok":["skintific_id"],"instagram":["skintific_id"],"threads":[],"x":[]}
  keywords jsonb,           -- search terms used for earned collection
  created_at
)

-- Creators (one row per platform handle)
creators(
  id uuid pk,
  workspace_id,
  platform text check (platform in ('tiktok','instagram','threads','x')),
  handle text,
  display_name text null,
  followers_latest int null,
  tier_latest text null,     -- computed from followers_latest via config thresholds
  location text null,
  first_seen date, last_seen date,
  unique (workspace_id, platform, handle)
)

-- Optional follower history (if exports include it)
creator_snapshots(creator_id, captured_at date, followers int, primary key (creator_id, captured_at))

-- Posts: the base truth
posts(
  id uuid pk,
  workspace_id,
  platform text,
  platform_post_id text,
  creator_id uuid null,      -- null for owned-account posts that aren't creators
  brand_id text,             -- which brand this post is attributed to
  source text check (source in ('owned','earned')),
  collection text,           -- 'keyword' | 'hashtag' | 'tagged' | 'owned'
  posted_at timestamptz,
  month date,                -- first day of month, for fast grouping
  url text,
  caption text null,
  hashtags text[] null,
  is_paid boolean null,      -- platform paid-partnership tag if captured
  has_cart boolean null,     -- TikTok yellow cart present (TikTok only)
  views bigint null, likes int null, comments_count int null, shares int null, saves int null,
  engagements int null,      -- likes+comments+shares+saves if not supplied
  captured_days int null,    -- how many of the 7 tracking days were captured
  unique (workspace_id, platform, platform_post_id)
)

-- Day-by-day tracking during the 7-day window (Phase 1b: load if exports have it)
post_snapshots(post_id, day_n smallint check (day_n between 0 and 7), captured_at timestamptz,
               views bigint, likes int, comments_count int, primary key (post_id, day_n))

-- Aggregated imports when post-level isn't available for a month
creator_brand_month_import(
  workspace_id, platform, month date, brand_id, creator_id,
  rank int, posts int, views bigint, median_views bigint, engagements bigint,
  er_pct numeric, views_per_1k_followers numeric, cart_pct numeric null,
  sample_url text, primary key (workspace_id, platform, month, brand_id, creator_id)
)
```

### 3.2 Phase 2 tables (create now, populate later)

```sql
comments(
  id uuid pk, workspace_id, post_id uuid, platform_comment_id text,
  author_handle text,                 -- keep raw; hash for audience skills if needed
  author_hash text,                   -- sha256(platform||handle) for graph work
  text text, posted_at timestamptz, likes int,
  sentiment text null check (sentiment in ('positive','neutral','negative')),
  topic_id text null, topic_confidence numeric null,
  classified_at timestamptz null,
  unique (workspace_id, platform_comment_id)
)
topics(id text pk, workspace_id, label text, parent_id text null, kind text)  -- kind: 'objection'|'question'|'claim'|'general'
```

### 3.3 Derived views (materialized, refreshed after each load)

- `mv_creator_brand_month` — per (platform, month, brand, creator): posts, views, median_views, engagements, er_pct, cart_pct, views_per_1k_followers, rank within brand-month. This is the same shape as the example xlsx, so anything Refal already computed in pandas can be validated against it.
- `mv_creator_brand_history` — per (creator, brand): first_post, last_post, total_posts, months_active, last_paid_post_at.
- `mv_brand_week` — per (brand, iso_week, platform, source): posts, creators, views, engagements, comments_count; plus share_of_voice within workspace-week.
- `mv_creator_cart_profile` — per (creator, month): posts, cart_posts, cart_pct (TikTok).

Indexes: `posts(workspace_id, brand_id, posted_at)`, `posts(creator_id, posted_at)`, `posts(month, platform)`, `creators(workspace_id, platform, handle)`, GIN on `posts.hashtags`.

### 3.4 Loader contract (`/etl`)

- `etl/schema/*.sql` — the DDL above, versioned.
- `etl/load.py --file <csv|xlsx> --kind posts|creators|creator_brand_month --platform tiktok|instagram --workspace beauty-id`
  - Validates columns against `etl/contracts/<kind>.json`, writes to `staging_<kind>`, upserts into the real table, then refreshes the materialized views.
  - Prints a load report: rows in, rows upserted, rows rejected (with reasons), months covered per platform, capture-coverage per month (days captured / days in month).
- Refal cleans upstream; **the loader does not guess**. Unknown brand slug → reject row and report. Unknown tier → recompute from followers.
- Tier thresholds (configurable in `config/thresholds.ts` and mirrored in `etl/config.py`):
  - nano 1,000–9,999 · micro 10,000–99,999 · mid 100,000–499,999 · macro 500,000–999,999 · mega 1,000,000+
  - below 1,000 → `sub` (tracked but excluded from /discovery by default).

Known caveats to carry into `meta.caveats` on any result (from the README of the sample export):
- TikTok capture was uneven in Q2 (Apr 16 days, May 27, Jun 29). Skills compare **within** a month by default; cross-month comparisons carry a caveat.
- No spend, contract, or contact data. `/spend-estimate` is an estimate and is labelled as such.

---

## 4. Skill engine

### 4.1 Contract

A skill is a pure function over the database:

```ts
type SkillRequest = {
  skill: SkillName;               // one of 23 registered names
  workspace_id: string;
  params: Record<string, unknown>; // validated against registry input_schema
  actor: { user_id: string; via: 'chat' | 'agent' | 'api' };
};

type SkillResult = {
  skill: SkillName;
  status: 'ok' | 'unavailable' | 'error';
  message?: string;               // human-readable reason when not ok
  params_resolved: Record<string, unknown>;   // after defaults + normalisation (this is what an agent freezes)
  summary: Record<string, unknown>;           // small, model-readable headline numbers
  rows: Row[];                    // the primary output (list, table)
  chart?: ChartSpec;              // optional; {type:'line'|'bar', series:[...], x:[...]}
  evidence: Evidence[];           // every row/number above must be traceable to one of these
  meta: {
    matched: number; returned: number;
    data_window: { from: string; to: string };
    freshness: string;            // ISO timestamp of latest data used
    caveats: string[];
    sql_hash: string;             // for debugging/reproducibility
    duration_ms: number;
  };
  diff_key: string;               // which field identifies a row for agent diffing, e.g. 'creator_id'
};

type Evidence = {
  id: string;                     // 'ev_01', stable within the result
  type: 'post' | 'creator' | 'aggregate' | 'comment';
  ref: string;                    // posts.id / creators.id / a view name + filter
  label: string;                  // "@skinbyalya · 27 Aug · TikTok"
  url?: string;
  metrics?: Record<string, number | string>;
  sample_text?: string;           // caption/comment excerpt, ≤ 200 chars
};
```

Rules:
1. **No answer without evidence.** A skill returning rows without evidence is a bug; the runner rejects it.
2. **The model never does arithmetic.** Sums, medians, deltas, rankings are computed in SQL/TypeScript and returned as numbers.
3. **Unavailable is a first-class status.** Comment-layer skills return `status:'unavailable'` with `message` naming the missing table, so the chat can say so plainly.
4. **Results are persisted** to `skill_runs` (params, result, evidence) so they can be re-opened, diffed, and promoted to agents.
5. **Deterministic defaults**: every skill has defaults for window, platform, limit, so `params: {}` runs.

### 4.2 Registry

`skills.registry.json` is the single source of truth (see companion file). Each entry:

```json
{
  "name": "discovery",
  "layer": "creators",
  "phase": 1,
  "title": "Creator discovery",
  "description": "...",           // shown in UI and in the tool description for the model
  "example": "...",               // 'Try:' line in UI
  "input_schema": { ... },        // JSON Schema; also used for tool strict validation
  "output": { "kind": "table", "diff_key": "creator_id" },
  "requires": ["posts", "creators"]   // tables that must be non-empty for status 'ok'
}
```

The app loads the registry at boot, builds: the Skills page, the slash menu, and the `run_skill` tool definition (skill enum + per-skill param docs in the description).

### 4.3 Skill specifications

Phase 1 = runnable on posts/creators now. Phase 1b = needs `post_snapshots` (day-by-day). Phase 2 = needs `comments`.

Common params (all skills): `platform` (`tiktok|instagram|all`, default `all`), `window` (`{from,to}` or `last_n_days`, default 90), `brands` (list of slugs; default = all tracked), `limit` (default 50, max 200).

#### Creators layer (104K creator database with brand history)

**/discovery** — Phase 1
Find creators by platform, tier, brand history, and exclusion.
- params: `tiers[]`, `used_by[]` (brands they posted for in window), `exclude_used_by[]` (default: client brand), `min_posts_for_brands` (default 1), `rank_by` (`views|avg_views|comment_rate|er_pct|views_per_1k|median_views`, default `views`), `min_followers`, `max_followers`, `location`.
- rows: creator, followers, tier, used_by [{brand, posts}], last_brand_post_at, avg_comment_rate, avg_views, top_topic (Phase 2; null now), for_you (`never|yes:<n>`).
- evidence: for each returned creator, up to 3 most recent brand posts.
- diff_key: `creator_id`.
- summary: `{matched, returned, of_total_creators}`.

**/mercenaries** — Phase 1
Creators who posted for ≥ N brands in the window.
- params: `min_brands` (default 4), `quarter` or window.
- rows: creator, brands [{brand, posts, last_post}], brand_count, cart_pct.
- diff_key: `creator_id`.

**/loyalists** — Phase 1
Creators a brand retained across consecutive months.
- params: `brand` (required), `min_months` (default 2).
- rows: creator, months_active[], consecutive_months, posts, trend (views last month vs first).
- summary: retention rate for the brand (creators appearing ≥2 months / all creators), category median for comparison.
- diff_key: `creator_id`. Agent diff should surface **churn** (creators who dropped out) as well as new loyalists.

**/affiliates** — Phase 1 (TikTok)
Separate affiliate/reseller accounts from creators.
- rule (configurable): `posts_in_month >= 30 AND cart_pct >= 50` → `affiliate`; `posts_in_month >= 15 AND cart_pct >= 80` → `affiliate`; else `creator`.
- params: `brand` (optional; default all), `month`.
- rows: brand, affiliate_accounts, affiliate_posts, affiliate_share_of_posts, affiliate_share_of_views, MoM change.
- evidence: top 5 affiliate accounts per brand with their post counts and cart_pct, plus 2 sample posts each.
- summary per brand; diff_key `brand_id` (agent mode watches network growth).

**/breakout** — Phase 1
Small accounts with views far beyond their follower base.
- params: `tiers[]` (default nano+sub), `min_views_per_1k` (default 5000), `min_views` (default 100000).
- rows: creator, followers, post (url), views, views_per_1k, brand, posted_at.
- diff_key: `post_id`.

**/funnel-mix** — Phase 1 (TikTok cart data; IG degrades to tier mix only)
Score a brand's creator mix by funnel stage.
- stage mapping: mega/macro → awareness; mid → consideration; micro/nano → conversion (validated by cart share: micro 47%, nano 42%, mid 36%, mega/macro ~20% in Q2 sample).
- params: `brand` (required), `compare_to[]` (default client brand), `month`.
- rows per brand: tier → posts, views, cart_pct, share_of_posts. summary: stage split %, one-line read ("buying awareness" vs "buying conversion").
- chart: stacked bar.

**/overlap** — Phase 1
Which brands hire from the same creator pool.
- params: `brand` (optional), `min_shared` (default 2).
- rows: brand_a, brand_b, shared_creators, shared_list (top 10 handles), jaccard.
- chart: matrix (optional).

**/spend-estimate** — Phase 1, always labelled estimate
- params: `brand`, `month`, `platform`.
- method: posts per tier × rate-card range per tier (config `config/ratecard.ts`, editable by Fair) → low/high. Exclude affiliate-classified accounts (they are commission, not fee).
- rows: tier, posts, rate_low, rate_high, est_low, est_high. summary: total range. caveat text mandatory.

#### Posts layer (7-day tracking)

**/velocity** — Phase 1b (needs `post_snapshots`; falls back to `unavailable` with message)
Posts still climbing on day N.
- params: `day` (default 3), `min_views`, `brands[]`.
- rows: post, brand, creator, views_day_n, growth_day_n_vs_n-1, projected_day_7.
- diff_key: `post_id`.

**/forecast** — Phase 1b
Project day-7 views from day-1, using tier-specific median curves computed from history.
- params: `post_id` or `url`.
- rows: day → observed/projected; summary: p50/p80 projection; caveat if fewer than 30 historical curves for the tier.

**/waves** — Phase 1 (works from `posts.posted_at`; better with snapshots)
Detect an unusual number of creators posting for one brand in a short window.
- rule: creators posting for brand in trailing 7 days ≥ max(8, 3× trailing-8-week weekly median).
- params: `brands[]`, `lookback_days` (default 7).
- rows: brand, creators_7d, baseline_weekly_median, multiple, first_post_at, top_posts.
- diff_key: `brand_id`. This is the canonical alert skill; `only_if_changed` fires when a brand enters "wave" state.

#### Caption and hashtag skills (added 3 Sep 2026; posts layer, no comments needed)

**/hashtags** — Phase 1
Hashtag leaderboard and rising hashtags. Reach tags and bare category words (`src/config/hashtags.ts`) are excluded by default.
- params: `rank_by` (`views|posts|creators|growth`, default `views`), `min_posts` (default 3), `exclude_generic` (default true), `tiers[]`.
- rows: hashtag, posts, creators, brands, views, share_of_posts_pct, top_brand, prev_posts, change_posts_pct (vs the previous window of the same length).
- evidence: aggregate per hashtag plus up to 2 top posts. chart: bar of the top 12.
- diff_key: `hashtag`; watch `change_posts_pct` ≥ 50.

**/campaigns** — Phase 1
Campaign detection from hashtags: a tag with ≥ `min_creators` distinct creators on one brand's earned posts where that brand holds ≥ `min_brand_share_pct` of the tag's posts. Tags that are the brand's own name (or part of it) are excluded unless `include_brand_tags`.
- params: `min_creators` (default 15), `min_brand_share_pct` (default 70), `include_brand_tags` (default false), `active_within_days` (default 14).
- rows: campaign_id (`brand|hashtag`), brand_id, hashtag, posts, creators, views, brand_share_pct, share_of_brand_posts_pct, share_of_brand_views_pct, first_seen, last_seen, active_days, peak_week, peak_week_posts, tier_mix, active.
- evidence: aggregate per campaign plus top posts. diff_key: `campaign_id` (new/gone surfaced); watch `creators` change ≥ 10.

**/themes** — Phase 1
Share of posts whose caption matches each theme of the lexicon in `src/config/themes.ts` (claims, ingredients, concerns, commerce), full-text on `posts.caption_tsv` ('simple' config, whole words, `:*` prefixes), brand scope against the category.
- params: `group` (`all|claims|ingredients|concerns|commerce`), `themes[]` (keys), `rank_by` (`index|share|posts|views`; default index with brands, else share), `tiers[]`.
- rows: theme, group, label, posts, creators, views, share_of_posts_pct, share_of_views_pct, category_posts, category_share_pct, index_vs_category, top_brand.
- evidence: aggregate per theme plus top posts. chart: bar brand vs category. diff_key: `theme`; watch `share_of_posts_pct` ± 5.

**/products** — Phase 1 (TikTok product tags; captions on all platforms for the keyword)
Product lines from `posts.product_name` per brand, with an optional `keyword` (prefix full-text on captions and product names) and caption-mention counts across all platforms.
- params: `keyword`, `rank_by` (`views|posts|creators|cart_posts`), `min_posts` (default 2), `tiers[]`.
- rows: brand_id, product_id (listing slug), product (label), posts, creators, views, avg_views, cart_posts, cart_share_pct, owned_posts, price_min, price_max, discount_max_pct, first_seen, last_seen, product_url.
- summary.caption_mentions when a keyword is given: posts, creators, brands, by_brand[]. diff_key: `product_id`.

**/hashtag-overlap** — Phase 1
Shared hashtag space between brands (tags on ≥ `min_tag_posts` of a brand's posts), Jaccard, and with `brand` the busiest tags each side uses alone.
- params: `brand` (focus), `min_shared` (default 3), `min_tag_posts` (default 2), `exclude_generic` (default true).
- rows: pair_id, brand_a, brand_b, shared_tags, tags_a, tags_b, jaccard, share_of_smaller_pct, shared_list, shared_posts, only_focus, only_other.
- diff_key: `pair_id`.

#### Brands layer (owned + earned)

**/compare** — Phase 1 (topics/sentiment columns null until Phase 2)
- params: `brands[]` (required, 2–6), `window`, `split_owned_earned` (default true).
- rows per brand: posts, creators, views, engagements, comments_count, share_of_voice, cart_share (TT), positive_pct/negative_pct (P2), top_topics (P2).
- chart: share_of_voice line by week.
- diff_key: `brand_id`; agent diff = share-of-voice delta > 1pt, creator posts delta > 50%, etc. (thresholds in registry).

**/launch** — Phase 1 partial
Week-by-week read of a launch.
- params: `brand`, `start_date`, `keywords[]` (product terms), `weeks` (default 4).
- rows per week: posts, creators, views, cart_share, new_creators_vs_prev, top_questions (P2), topics (P2).

#### Comments layer (Phase 2 — registered now, `unavailable` until `comments` is populated)

**/objections** — why people aren't buying: topic_kind='objection' share and trend per brand.
**/questions** — most common unanswered questions under a brand/product's posts (reply detection required).
**/dupes** — comments that name another brand → substitution map (brand pairs, count, direction).
**/claims** — creator claim vs comment trust: claim topics on posts vs negative/sceptical share in comments.
**/whitespace** — topics rising in category comments not present in any brand's owned captions.
**/seeding** — coordinated comment detection: near-duplicate text clusters (MinHash), timing bursts, new-account share. Output: incident, size, sample comments. Alert-type skill.

#### Audience layer (Phase 2 — commenter graph)

**/audience** — commenter overlap between brands (by `author_hash`).
**/switchers** — commenters active on brand A in period 1 and brand B in period 2.
**/superfans** — repeat commenters per brand, ranked.

#### Conversation layer (Phase 2 — Threads & X)

**/narrative** — text-first narratives by keyword: clusters, volume, first-seen, sample posts.

### 4.4 Implementation notes for skills
- One file per skill: `src/skills/<name>.ts` exporting `{ meta, run(request, db): Promise<SkillResult> }`.
- SQL lives in the skill file as tagged templates (Drizzle `sql`), parameterised. Never string-concatenate user input.
- Every skill has a test in `src/skills/__tests__/<name>.test.ts` against a seeded fixture DB (`etl/fixtures/seed.sql` with ~20 brands, ~500 creators, ~3,000 posts derived from the example export).
- A CLI: `pnpm skill run discovery --params '{"tiers":["nano"],"platform":"tiktok"}'` prints the JSON result. Claude Code should use this to verify each skill without the UI.

---

## 5. Ask (chat) — Claude API integration

### 5.1 Architecture

```
Browser ──SSE──> /api/chat (Next.js route, Node runtime)
                    │
                    ├─ builds messages[] from conversations/messages tables
                    ├─ calls Claude Messages API with tools, stream: true
                    ├─ on tool_use: runs the tool server-side (skill engine / query builder)
                    │      emits SSE events: tool_start, tool_result (summary + evidence)
                    │      appends tool_result block, continues the loop
                    ├─ on text deltas: forwards as SSE 'text'
                    └─ on end: persists assistant message + evidence map, emits 'done'
```

- Model: `ANTHROPIC_MODEL_CHAT` (`claude-sonnet-5`).
- Use `tool_choice: {type:"auto"}` and `strict: true` on tool definitions so tool inputs are schema-valid (some current models return 400 on forced tool use; `auto` + strict is the portable choice). Docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools and https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
- Put the system prompt and tool definitions first and mark them for prompt caching; they are identical across every request in a workspace. Docs: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Do not send `temperature`/`top_p` (unsupported on newer models; guide behaviour via the prompt).
- Cap the loop at 6 tool calls per turn; if exceeded, answer with what's available and say so.
- Handle stop reasons explicitly (`tool_use`, `end_turn`, `max_tokens`); on `max_tokens` continue once.

### 5.2 Tools exposed to the model (three, deliberately)

**1. `run_skill`** — the primary tool.
```json
{
  "name": "run_skill",
  "description": "Run one of Fair Intel's named analyses (skills) on the workspace's social listening database. Use this whenever the user's question maps to a skill, and always when they type a /slash command. Skills return real rows computed in the database plus an evidence list; you must cite evidence ids when you use their numbers. Available skills and their parameters:\n<generated from skills.registry.json: for each skill, 'name — description. params: ...'>\nIf a skill returns status 'unavailable', tell the user which data layer is not loaded yet and offer the nearest available skill.",
  "input_schema": {
    "type": "object",
    "properties": {
      "skill": { "type": "string", "enum": ["discovery","mercenaries", "...23 names"] },
      "params": { "type": "object" }
    },
    "required": ["skill","params"],
    "additionalProperties": false
  },
  "strict": true
}
```
(Registry-driven: the enum and the description are generated at boot. Per-skill `input_schema` is validated server-side after the call; on validation error return a `tool_result` with `is_error: true` and the Zod message so the model can correct itself.)

**2. `query_metrics`** — for questions no skill covers. Not raw SQL; a constrained query builder.
```json
{
  "name": "query_metrics",
  "description": "Query aggregated metrics from the social listening database when no skill fits. Choose an entity, filters, group_by dimensions, and metrics; the server builds and runs safe SQL and returns up to 200 rows with evidence refs. Use run_skill first when a skill exists. Entities: posts, creators, brand_weeks, creator_brand_months. Filters: brand_id, platform, source(owned|earned), tier, has_cart, date range, creator handle. Metrics: count_posts, count_creators, sum_views, median_views, sum_engagements, er_pct, cart_pct, share_of_voice. Group_by: brand_id, platform, source, tier, week, month, creator_id.",
  "input_schema": {
    "type": "object",
    "properties": {
      "entity": {"type":"string","enum":["posts","creators","brand_weeks","creator_brand_months"]},
      "filters": {"type":"object"},
      "group_by": {"type":"array","items":{"type":"string"}},
      "metrics": {"type":"array","items":{"type":"string"}},
      "order_by": {"type":"string"},
      "limit": {"type":"integer","maximum":200}
    },
    "required": ["entity","metrics"],
    "additionalProperties": false
  },
  "strict": true
}
```
Server: whitelist every field, dimension, and metric; reject anything else. Return `{rows, evidence, meta}` in the same shape as skills.

**3. `create_agent_draft`** — turns "every Monday…" into an editable agent card.
```json
{
  "name": "create_agent_draft",
  "description": "Propose a recurring agent when the user asks for something on a schedule ('every week', 'each Monday', 'alert me when'). Do not create it; return a draft the UI shows for editing. Base the draft on the most recent skill run in this conversation when there is one, carrying over all its parameters exactly.",
  "input_schema": {
    "type":"object",
    "properties":{
      "name":{"type":"string"},
      "skill":{"type":"string"},
      "params":{"type":"object"},
      "schedule":{"type":"object","properties":{"cron":{"type":"string"},"tz":{"type":"string"},"human":{"type":"string"}},"required":["cron","tz","human"]},
      "delivery":{"type":"object","properties":{"channels":{"type":"array","items":{"type":"string","enum":["email","whatsapp","in_app"]}}},"required":["channels"]},
      "only_if_changed":{"type":"boolean"},
      "from_skill_run_id":{"type":"string"}
    },
    "required":["name","skill","params","schedule","delivery","only_if_changed"],
    "additionalProperties": false
  },
  "strict": true
}
```

Optional 4th, `get_evidence` (`{ids[]}` → full evidence objects), if results get trimmed for context size. Start without it; add if needed.

### 5.3 System prompt (v1; keep in `src/chat/system.md`)

```
You are Fair Intel, an analyst for {workspace.name}. The client brand is {client_brand.name}; the other tracked brands are competitors.

You answer only from data returned by your tools in this conversation. Rules:
1. Any number, ranking, or named creator/post in your answer must come from a tool result in this turn or an earlier turn of this conversation. Cite it inline with the evidence id in square brackets, e.g. [ev_03]. Never invent a figure. If the tools don't return it, say what you couldn't find.
2. Prefer run_skill when a skill matches. Use query_metrics only when no skill fits. When the user types a /skill command, run that skill with parameters parsed from their text.
3. When a skill returns status 'unavailable', say which data isn't loaded yet in one sentence and offer the closest available analysis.
4. Lead with the answer in 2–4 sentences. Then, if useful, a short 'What changed' list. Keep evidence citations dense; keep prose short. No headers.
5. Compare within a month by default; when comparing across months, repeat the capture caveat from meta.caveats once.
6. When the user asks for something recurring ('every Monday', 'alert me'), call create_agent_draft with the parameters of the most recent relevant skill run carried over unchanged.
7. Language: mirror the user (Indonesian or English). Brand and creator handles stay verbatim.
8. Never mention SQL, tools, or internal ids other than evidence ids.
```

### 5.4 Evidence rendering contract (server → UI)

- The server rewrites `[ev_03]` tokens into `<ev id="ev_03">` before streaming to the client; the UI renders the blue chip and, on click, expands the evidence card (label, url, metrics, sample_text) — exactly as in the prototype.
- Evidence ids are namespaced per assistant message (`m<messageId>:ev_03`) when persisted, so re-opened conversations still resolve.
- If the model cites an id that doesn't exist in this turn's tool results, the server strips the citation and logs `evidence_miss` (count this; it's the hallucination metric).

### 5.5 Persistence

```sql
conversations(id, workspace_id, user_id, title, created_at, updated_at)
messages(id, conversation_id, role, content_json jsonb, evidence_json jsonb, skill_run_ids uuid[], tokens_in, tokens_out, created_at)
skill_runs(id, workspace_id, skill, params jsonb, params_resolved jsonb, result jsonb, status, actor jsonb, agent_run_id uuid null, created_at, duration_ms)
```

### 5.6 UI behaviour (matches prototype)
- Composer: `/` opens the slash menu populated from the registry, filtered as you type; selecting inserts `/skill ` and focuses.
- While a tool runs, show a small inline status line ("Running /discovery…") that becomes the result card.
- Skill results render as: table (rows with diff_key), chart (SVG from ChartSpec), or flag card (waves/seeding).
- Every assistant message ends with the action row: **Get this every Monday** (→ create_agent_draft with the last run), **Turn into a report**, **Copy**.
- `/discovery` opens its own screen (parsed filters as chips, "matched X of Y", table with For-you column) rather than an inline table.

---

## 6. Agents

### 6.1 Model

```sql
agents(
  id uuid pk, workspace_id, user_id, name text,
  skill text, params jsonb,                 -- FROZEN params_resolved from the source run
  from_skill_run_id uuid null,
  schedule_cron text, schedule_tz text default 'Asia/Jakarta', schedule_human text,
  delivery jsonb,                           -- {"channels":["email"],"email":"...","whatsapp":"+62..."}
  only_if_changed boolean default true,
  diff_config jsonb,                        -- thresholds per skill, from registry defaults
  status text check (status in ('active','paused','draft')),
  last_run_at, next_run_at, created_at
)
agent_runs(
  id uuid pk, agent_id, skill_run_id uuid, started_at, finished_at,
  diff jsonb,                               -- {"new":[...],"gone":[...],"changed":[...],"unchanged":n}
  should_deliver boolean, delivered_at timestamptz null, delivery_error text null,
  report_id uuid null
)
```

### 6.2 Promotion from a run ("Run this weekly")
- Takes `skill_runs.params_resolved` verbatim — every filter, ranking, exclusion, limit. **Never re-parse the user's original text.**
- Time windows are converted from absolute dates to relative (`last_n_days`) at promotion so the agent slides forward; the UI shows this conversion in the editable card.
- Default schedule when not stated: weekly, Monday 07:00 workspace TZ.

### 6.3 Execution (worker)
- pg-boss job `agent.run` scheduled from `schedule_cron`; worker runs the skill with the frozen params → new `skill_run`.
- Diff against the agent's previous successful run on `diff_key`:
  - `new` = keys in current not in previous (surfaced first in output)
  - `gone` = keys in previous not in current
  - `changed` = same key, any watched metric moved beyond `diff_config` thresholds (e.g. share_of_voice ±1pt, posts ±50%)
- `should_deliver = !only_if_changed || new.length || gone.length || changed.length` (for alert skills like /waves and /seeding, "changed" means state flips into alert).
- Generate the report (§7) from the run + diff; deliver via adapter.

### 6.4 Delivery adapters (`src/delivery/*`)
- `email` — implement now (Resend or SMTP). Subject `[Fair Intel] {agent.name} — {n} changes`; body = report HTML.
- `whatsapp` — interface only in v1 (`send(to, text, attachmentUrl?)`), stub logs to console. Real provider is a later swap.
- `in_app` — always on; the Agents page lists runs and links to reports.

### 6.5 Conversational setup
- On the Agents page and in chat: free text → `create_agent_draft` (model call) → editable card (Skill, Schedule, Brands/params, Deliver to, Only if changed) → Create. Same flow as the prototype.

---

## 7. Reports

- A report is a rendered `skill_run` (+ optional `agent_run.diff`) stored as Markdown + JSON blocks:
```sql
reports(id, workspace_id, title, source text check (source in ('agent','ask')), skill_run_id, agent_run_id null,
        body_md text, blocks jsonb, created_at)
```
- Renderer: `src/reports/render.ts` → sections: headline (model-written, 3–4 sentences, evidence-cited, generated with the same system rules), **What changed** (from diff), table/chart, "Worth acting on" (model-written, optional), caveats.
- The headline generation is one non-streaming Claude call with the result JSON in the user message and the same system prompt; cap at 300 output tokens.
- Export PDF: later (headless Chromium). v1 ships HTML view + email.

---

## 8. Screens (build against `fair-intel-prototype-v2.html`)

| Screen | Route | Notes |
|---|---|---|
| Ask | `/` | Hero + composer + suggested prompts; thread below; slash menu; evidence chips |
| Skills | `/skills` | Registry-driven grid grouped by layer; filter chips; "First release" tag for phase-1 priorities; click → inserts `/skill` in Ask (discovery → its screen) |
| /discovery | `/skills/discovery?run=<id>` | Parsed filter chips, run line, table, actions (Save shortlist, Export CSV, Run this weekly) |
| Agents | `/agents` | List with skill/schedule/delivery/last run; New agent panel with conversational parse |
| Reports | `/reports/[id]` | List + document view |
| Data | `/data` | Live counts from DB: brands, creators, posts, comments (0 until P2), months covered per platform, capture coverage per month, last load time |

Design tokens: use the `:root` block from the prototype verbatim (`--blue:#1E5EFF` placeholder until Fair Influence tokens are supplied — one-line swap). Plus Jakarta Sans. 1px borders, no shadows except popovers, blue only for actions/active/own-brand/evidence.

---

## 9. Non-functional

- **Latency**: skill SQL ≤ 2 s p95 on 5M posts (materialized views + indexes); chat first token ≤ 1.5 s.
- **Cost controls**: prompt caching on system+tools; trim tool results to ≤ 60 rows in the model context (persist the full result; the UI shows all). Log tokens per message.
- **Honesty metric**: `evidence_miss` count per 100 messages; target < 1.
- **Security**: no raw SQL from the model; query builder whitelist; API routes require session; workspace scoping on every query.
- **Observability**: log every tool call (skill, params, duration, rows, status); store `sql_hash`.
- **Data freshness**: `/data` shows last load; results carry `meta.freshness`.

---

## 10. Build order (milestones with acceptance)

**M0 — Foundations (repo, schema, loader)**
- Next.js + Drizzle + Postgres running locally and on Railway; migrations from §3.
- `etl/load.py` loads the example xlsx into `creator_brand_month_import` and a synthetic post-level fixture; materialized views refresh.
- Accept: `pnpm db:stats` prints brands/creators/posts/months; fixture tests pass.

**M1 — Skill engine + Phase-1 skills**
- Registry loader, runner, CLI, tests. Implement: discovery, mercenaries, loyalists, affiliates, breakout, funnel-mix, overlap, spend-estimate, waves, compare (P1 columns), launch (P1 columns). Register the rest as `unavailable`.
- Accept: `pnpm skill run <name>` returns valid `SkillResult` for all 11; evidence non-empty; runs persisted.

**M2 — Ask**
- `/api/chat` streaming with the three tools; system prompt; evidence rewrite; persistence; UI thread, slash menu, action row; /discovery screen.
- Accept: "What did competitors do last week?" → /compare via tool → answer with ≥3 evidence chips, all resolvable. "/discovery 50 nano creators competitors used on TikTok, never used by us" → discovery screen with parsed chips and 50 rows. `evidence_miss` = 0 on the 20-question smoke set (`tests/smoke/questions.json`).

**M3 — Agents**
- Promotion from a run, editable draft card, pg-boss worker, diff, email delivery, in-app runs list.
- Accept: promote a /discovery run → agent; force-run twice with a seeded change → second run reports exactly the new entrants; email received.

**M4 — Reports + Data page**
- Report renderer, headline generation, reports list/view, Data page from live stats.
- Accept: agent run produces a report identical in structure to the prototype's week-35 document.

**M5 — Phase 2 (when comment exports land)**
- Loader for comments; classification job (Haiku; batch; sentiment + topic against a workspace topic taxonomy in `topics`); enable objections, questions, dupes, claims, whitespace, seeding, audience, switchers, superfans, narrative.
- Accept: each flips from `unavailable` to `ok` with tests.

---

## 11. Repo layout

```
/app                    Next.js routes (App Router)
  /api/chat/route.ts    SSE chat loop
  /api/skills/[name]/run/route.ts
  /api/agents/...       CRUD + run-now
  /(screens)/...        ask, skills, agents, reports, data
/src
  /db        drizzle schema + client + materialized view SQL
  /skills    registry.ts (loads skills.registry.json), runner.ts, <name>.ts, __tests__/
  /chat      system.md, tools.ts (builds tool defs from registry), loop.ts, evidence.ts
  /query     builder.ts (whitelisted query_metrics)
  /agents    scheduler.ts (pg-boss), diff.ts, promote.ts
  /delivery  email.ts, whatsapp.ts (stub), inapp.ts
  /reports   render.ts, headline.ts
  /config    thresholds.ts, ratecard.ts
/etl         load.py, contracts/*.json, schema/*.sql, fixtures/seed.sql, config.py
/tests/smoke questions.json
/docs        PRD.md (this file), prototype html
skills.registry.json
CLAUDE.md
```

Suggested `CLAUDE.md` (drop into repo root):
```
Project: Fair Intel — AI marketing intelligence on Fair's social listening data. Read docs/PRD.md first.
Rules: (1) The model never computes numbers; skills/query builder do, in SQL. (2) Every skill result must include evidence; the runner rejects results without it. (3) skills.registry.json is the single source of truth for skills; UI, slash menu, and tool definitions are generated from it. (4) No raw SQL from model input; query builder whitelist only. (5) All tables carry workspace_id. (6) Tier and affiliate thresholds live in src/config; don't hardcode. (7) Use `pnpm skill run <name>` to verify skills before touching UI.
Verification: pnpm test (skills against fixtures), pnpm smoke (20 chat questions, expect evidence_miss=0), pnpm db:stats.
Do not integrate Fair Space or Fair Hub.
```

---

## 12. Open questions for Refal (answer before M1 where marked)

1. **[M0]** Does the TikTok Q2 export contain day-by-day snapshots (views on day 1…7) or only the final capture? Decides whether `/velocity` and `/forecast` are Phase 1b or later.
2. **[M0]** For Instagram Q1/Q2: post-level rows, or creator-month aggregates? If aggregates, they load into `creator_brand_month_import` and IG skills run with reduced confidence.
3. **[M1]** Rate-card ranges per tier for `/spend-estimate` (IDR, TikTok and IG). Fair has this; put it in `config/ratecard.ts`.
4. **[M1]** Confirm tier thresholds (nano 1K–10K, micro 10K–100K, mid 100K–500K, macro 500K–1M, mega 1M+).
5. **[M3]** WhatsApp provider for delivery, or email-only for v1?
6. **[M5]** Topic taxonomy: start from Fair Listening's existing topic labels, or define a beauty-specific one (objection / question / claim / dupe kinds) for this product?
7. Which brand is the client in the first workspace, and the list of ~50 tracked brand slugs with owned handles (goes into `brands` seed).

---

## Appendix A — Evidence-first answer example (target behaviour)

User: *What were competitors doing last week?*
Tool: `run_skill{skill:"compare", params:{brands:["skintific","somethinc","emina","wardah"], window:{last_n_days:7}, compare_prev:true}}`
Answer: "Three things moved 25–31 Aug. Skintific ran a creator burst on TikTok, 41 posts across 27 creators [ev_01]. Somethinc's share of voice fell 2.1 pts for a second week while sentiment held [ev_04]. Emina's price complaints tripled after a repackaging post [ev_07]. Your brand was flat on volume, up 1.8 pts on positive share [ev_09]." → chips resolve to posts/aggregates returned by the tool.

## Appendix B — Diff example (agent output)

Agent "Weekly nano discovery" (from a /discovery run). Week 2 result: 50 rows, 7 new entrants. Report leads with the 7 (handle, used_by, why they entered), then "3 dropped out", then the full table collapsed. `should_deliver=true`. If 0 new / 0 gone / 0 changed → no email, run logged.
