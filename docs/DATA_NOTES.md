# Data notes (from profiling the three raw files, 2 Sep 2026)

Companion to `docs/PRD.md` §3. These findings override the PRD where they conflict. Raw files live in `data/raw/`, brand mapping in `data/seed/brand_mapping_master.csv`.

## What the data is

Three post-level exports, one row per post. No aggregates, no day-by-day snapshots, no comment text.

| File | Posts | Brands | Creators | Window | Notes |
|---|---|---|---|---|---|
| TikTok Q2 2026 | 60,211 | 54 | 31,112 | 5 Apr to 30 Jun | April has 23 captured days; 9,074 owned-account posts; cart flag present |
| Instagram Q2 2026 | 67,965 | 91 | 24,097 | 1 Apr to 30 Jun | Tag-based capture, no owned posts; 3 universes |
| Instagram Q1 2026 | 76,819 | 53 | 24,642 | 1 Jan to 31 Mar | Beauty universe only; Carousel/Image rows have views 0 |

Consequences for the registry:
- `velocity` and `forecast` (need `post_snapshots`): unavailable. No snapshots exist.
- All Phase 2 skills (need `comments`): unavailable. Only per-post `comments` counts exist.
- `narrative` (Threads/X): unavailable, no such platforms in the data.
- `spend-estimate`: removed from scope (Refal, 2 Sep).

## Column inventory

Common to all files: `brand`, `account_name_raw`, `universe`, `content_format`, `content_type`, `tier`, `followers_raw`, `followers_numeric`, `creator_username`, `date_posted`, `month_name`, `views`, `likes`, `comments`, `engagement_platform_native`, `engagement_rate_platform_native_pct`, `engagement_likes_comments_only`, `engagement_rate_comparable_pct`, `description`, `url`.

TikTok Q2 only: `category`, `category_new`, `category_derived_from_product_title`, `shares`, `saves`, `account_type` (influencer / owned_main / owned_sub / reseller), `is_owned_account`, `owned`, `yc_status_raw`, `yc_flag`, `product_name`, `product_url`, `price`, `price_original`, `discount_percent`, `content_id`, `cap`, `brand_s`, `suspect`.

Instagram Q2 only: `category`, `category_new`, `category_derived` (all null), `owned` (all False), `cap`, `brand_s`, `suspect`.

Instagram Q1 only: `shares`, `saves` (both always 0), `category_new` (86% filled). No `category`, no `universe` variety.

`content_format` values (all files): other, product_showcase, review, tutorial, tips_educational, grwm, pov_storytelling, trend_challenge, before_after, comparison. Null in 20 to 30% of Q2 rows.

`category_new` values: lip, eyeshadow, moisturizer, sunscreen, serum, two-way cake, blush, cushion, face wash, lotion, perfume, mascara, skintint, foundation, deodorant, micellar water, shampoo, mask, toner, body wash.

## Schema changes vs the PRD

1. **Brand identity.** Slugs differ per platform (`skintific_official` on TikTok, `skintificid` on Instagram). `brands.id` = the `brand` column of `brand_mapping_master.csv` (91 rows). Per-platform handles come from `tiktok_handle` / `instagram_handle`. The loader maps raw `brand` to canonical via that file and rejects unknown slugs.
2. **Post-to-brand is many-to-many on Instagram.** A collab post tagging several brands appears once per brand (7,987 such rows in Q1). Uniqueness must be `(workspace_id, platform, url, brand_id)`, not `(platform, platform_post_id)`. Recommended: `posts` unique on `(platform, url)` plus a `post_brands(post_id, brand_id, is_primary)` table, or simply keep one row per (post, brand) and accept duplicated metrics. Either way, brand-level counts must count rows, and platform-level unique post counts must dedupe on url.
3. **Extra columns to keep on `posts`.** `universe`, `category_broad` (normalised from `category`), `product_category` (`category_new`), `content_format`, `content_type`, `account_type`, `product_name`, `product_url`, `price`, `price_original`, `discount_percent`. These drive the brand-strategy and top-content skills.
4. **Owned vs earned** exists only on TikTok (`is_owned_account`). Instagram is all earned. `compare` reports owned/earned split for TikTok only.
5. **Cart / affiliate.** TikTok `yc_flag` has three states: 1 = shoppable link, 0 = product tagged without link, blank = no product tagged. Store as `has_cart boolean null`. Affiliate rule (Refal, 2 Sep): a post with `yc_flag = 1` is an affiliate post; a creator with at least one affiliate post is an affiliator. 46% of TikTok posts carry the flag, roughly flat across tiers (44 to 50%), so affiliator lists are large. Keep `account_type = reseller` as a separate flag (603 posts).
6. **Tiers.** Recompute from `followers_numeric` on load with Refal's bands (see DECISIONS). Source tiers are inconsistent: Q2 files use Micro to 50K, Q1 uses Micro to 100K. Instagram Q1 has 4,465 rows with followers = 0 and `inf` engagement rates: treat followers as unknown, tier null, exclude from per-1k metrics.
7. **Unknown creators.** 1,093 TikTok rows have a `vt.tiktok.com` short url and null `creator_username`. Load with `creator_id = null`.

## Loader normalisation
- `category`: "PArfume", "Parfume", "Fragrance/perfume" → "Fragrance"; "Scalp/haircare", "Haircare" → "Haircare"; "Deo" → "Deodorant".
- `content_type`: TikTok "video"/"content"/"images"; Instagram "Reel"/"Video"/"Carousel"/"Image". Lowercase, keep as-is otherwise.
- `date_posted`: string in Q2 files, datetime in Q1. Parse to UTC. Source is presumably Asia/Jakarta local; confirm with Refal before shifting.
- `engagement_rate_*` with `inf` → null.
- `month` = first day of month from `date_posted`.

## Caveats to carry on results (`meta.caveats`)
- TikTok April 2026 has 23 of 30 days captured, starting 5 Apr. Within-month comparisons involving April are lower-volume, cross-month deltas need the caveat.
- Instagram Q1 is Beauty universe only; Q2 adds Men's and Personal Care. Q1 vs Q2 comparisons must restrict Q2 to Beauty.
- Instagram brand roster grew from 53 to 91 between quarters.
- Instagram views are 0 for Carousel/Image (Q1) and shares/saves are never available.
- No snapshots, so `waves` runs on `posted_at` only; the 8-week baseline is thin in April.

## Demo questions (Refal, 2 Sep) and how they map
1. "Tell me Skintific's strategy in a given month or week" → new skill `brand-strategy` (see DECISIONS).
2. "Most performing content with affiliate tags" → new skill `top-content` with `has_cart` filter.
3. "List of nano influencers for Skintific" → `discovery` with `used_by=[skintific_official]`, `tiers=[nano]`.

## Loader findings (M0, 2 Sep 2026)

All three files load with zero rejects: 204,995 post rows, 197,008 unique (platform, url) posts, 91 brands, 71,163 creators (30,752 TikTok, 40,411 Instagram). Cross-checks against the figures above all hold: Instagram Q1 has 11,785 rows across 3,798 shared urls; TikTok has 9,074 owned posts, 1,093 rows with no creator handle, 27,586 cart posts (28,916 tagged without link, 3,709 untagged), 603 reseller posts; TikTok April has 23 of 30 days.

Additional things the load surfaced:
- Instagram Q2 has 2,338 rows with unknown followers (207 null plus 2,131 rows with followers = 0), not just the 207 nulls. Together with Q1's 4,465 and TikTok's 83, 6,886 rows carry `tier = null`.
- `views_per_1k_followers` explodes for accounts with a handful of followers (one creator shows 645k views per 1k followers). Skills that rank on it must apply `min_followers`.
- Instagram brand count per month: 53 in Q1, 90 in April, 76 in May and June. The roster is not stable within Q2 either.
- Owned-account posts have `creator_id = null` (handle kept in `creator_handle`), so creator-level views never mix a brand's own account into its creator pool.
- Instagram `shares`/`saves` are stored as null (the source columns are always 0 and the API does not expose them).


## Maudy Ayunda export (profile workspace `maudy-ayunda`, Fair Listening, 14 Sep 2026 12:15 WIB)

Ten CSVs in `data/raw/maudy/`: one contents file and one comments file per platform (YouTube, TikTok, Instagram, Threads, X). Contract and drop rules: `etl/profiles/maudy-ayunda.json`; loader: `etl/load_profile.py`.

| platform | contents in → loaded | comments in → loaded | notes |
|---|---|---|---|
| YouTube | 1 → 1 (owned) | 2,445 → 2,418 | the root video (`r1DSH9AQXLU`, 21 Aug 2026); comment dates are relative ("21 hours ago"), anchored to the export time; `like` empty, the `reply` column carries the count |
| TikTok | 16 → 6 | 683 → 165 | 10 captured-wrong videos dropped (Vietnamese singer, sinetron, mask prices, no caption); 469 comments went with them |
| Instagram | 5 → 5 (all owned) | 1,597 → 1,362 | comments on two old posts (Oct 2023 From This Island launch, Jul 2025 mentorship); `post_url` is the comment permalink (`/p/<code>/c/<id>`); 19 ids rounded to `1.80E+16` by Sheets → hashed |
| Threads | 243 → 240 (1 owned) | 2,792 → 1,761 | `date_posted` has a time but no zone and is UTC (first replies land minutes after the post once read that way; seven hours after when read as WIB); no comment ids; 3 unrelated threads dropped with 850 comments; 5 posts exist only as comment targets → stubs; 394 comments landed on her 2023 post |
| X | 200 → 167 | 204 → 110 | 32 link-farm tweets dropped (3+ links); 93 of the dropped comments were "asupan lokal" spam replies; per-comment `views`; epoch-ms dates |

Totals after load: 419 posts (7 owned), 5,816 comments, 3 subject replies (YouTube). Comment windows: YouTube 24 Aug to 14 Sep; TikTok, Threads, X 12 to 14 Sep; Instagram Oct 2023 to 14 Sep 2026.

Column shapes: contents `url, platform, account_name, followers, date_posted, description, content_type, views, likes, replies/comments | replies, retweet/repost, share`; comments `post_url, comment_id, platform, author, comment_text, date, Views | views, sentiment (empty), like, reply`. Instagram and YouTube contents are date-only (read as WIB midnight); comments on every platform carry full UTC timestamps. Numbers come with thousands separators ("174,000"); `followers` on the YouTube row is the handle ("modmedia"), read as unknown. Instagram urls carry `?hl=en&img_index=1`, stray invisible characters and one `Https`; the loader canonicalises before matching.

Sentiment: not in the export. `/api/cron/label` fills `comments.sentiment` (`sentiment_source = 'model'`) and `posts.stance` on earned posts after deploy; until then counts read as unlabelled, not neutral.
