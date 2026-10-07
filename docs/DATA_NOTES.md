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

## Fintech dump (category workspace `fintech-id`, Fair Listening "FinTech Listening", 1 Oct 2026 17:30 WIB)

Thirteen CSVs, one per table of the listening database (`<table>_202610011730.csv`). Contract: `etl/listening/fintech-id.json`; loader: `etl/load_listening.py <contract> <dir>`.

| table | rows in → loaded | notes |
|---|---|---|
| `_content_` | 13,790 → 13,275 posts | 515 duplicate captures merged (one post found by several Threads queries for one brand; the capture tracked last wins); 133 posts mention two or three brands and stay one row per brand; 467 owned |
| `creator` | 9,087 → 9,087 | tiers recomputed from followers (same bands as the source) |
| `content_metric_snapshot` | 120,240 → 114,633 | day 0 to 30, median 9 days per post; snapshots of merged duplicates dropped |
| `_comment_` + `comment_sentiment` | 126,300 → 116,366 | the latest label per comment; 9,934 repeats of a comment under a merged or second-brand capture; 237 brand replies; 1,006 without text (stickers) |
| `topic` | 8 | Transaction Issue, Promo & Cashback, QRIS & Fees, Merchant/UMKM, Comparison, Saving & Interest, Paylater, Others (catch-all) |

Posts by platform: Threads 4,746, Instagram 3,794, X 3,253, TikTok 1,482. By month (WIB): June 1,244, July 715, August 2,041, September 9,275, to 24 Sep. **Coverage is uneven:** Threads and X were switched on in September (Threads 425 → 4,598 captures, X 12 → 3,267), Instagram dips in July (207 captures against about 1,150 in June and August), TikTok starts small in June (118). Week-on-week reads must be per platform or guarded, or they report collection as movement.

Views: the larger of `video_view_count` and `video_play_count` (Threads and X play counts are video plays only). Comments cover 2,495 posts, about 37% of the comment counts the posts report (Threads 64,557, TikTok 28,630, Instagram 19,415, X 3,764). Sentiment (three-class, brand replies left out): neutral 58,195, positive 36,125, negative 20,537, unknown 1,272. `category`, `product_type` and `format_content` hold stray beauty values (201 "deodorant", 57 "mascara") and are not loaded.

## Indonesian Beauty Q3 2026 (Fair's scraper, from 6 Oct 2026; in progress)

Templates for the dump: `Indonesian_Beauty_Q3_2026_{TikTok,Instagram}_template.xlsx` (sent to Refal on 6 Oct). The headers follow `etl/contracts/posts_*.json`; tier, the engagement totals and month are worked out at load.

**Instagram, first file (loaded 6 Oct).** The export goes through `etl/quarterly/convert_instagram.py`, then `etl/load.py --platform instagram`.
- Loaded: 73,327 rows, 68,358 posts, 71 brands, every day of July to September, nothing rejected.
- Corrections the converter makes:
  - 693 TikTok links in the file are left out; they belong to the TikTok batch.
  - A blank post type with views is a Reel, without views a Carousel (Refal).
  - Followers of 0 are read as unknown.
- **A post that tags several brands counts for each brand** (Refal, 6 Oct): it is earned content for every brand it names.
  - Every row of the same post carries one set of numbers: the highest views, likes and comments seen for it, the highest followers, the earliest date.
  - Platform totals count the post once.
  - 3,765 posts tag several brands; 291 tag five or more, many from shops such as `mutiaracosmetics_id`.
- **Still to come from Refal:**
  - the 20 Q2 brands with no Q3 posts yet;
  - followers for 4,896 rows (3,596 creators);
  - the product category column (Q2 had it on only 26% of posts);
  - TikTok, in batches.
- Loading again upserts on (platform, url, brand), so a corrected file replaces the rows.
- Caveats:
  - Dates have no time of day (daily and monthly views are fine).
  - Q3 has far fewer zero-like posts than Q2 (4% against 34%; median likes 25 against 5). That points to a change in collection, so Q2 against Q3 comparisons on likes need that said.

## Kahf on Threads (profile workspace `kahf-threads`, Fair's scraper, 7 Oct 2026 ~10:00 WIB)

One contents file, `data/raw/kahf/contents_threads.csv` (posts only; comments to follow). Contract: `etl/profiles/kahf-threads.json`; loader: `etl/load_profile.py`.

- **In → loaded:** 584 → 582 posts, from 525 accounts.
  - 5 are Kahf's own: the two apology posts on @kahfeveryday at 00:45 WIB on 7 Oct, and three September posts on @kahfeveryday.my.
  - 577 are earned.
  - Two were dropped as captured by mistake: a June cake festival and a September 2025 post.
- **Not in the data:** the original post (the AFF meme). It was deleted; Refal sent a screenshot. Its content is in `settings.label.context`.
- **Times:** 12-hour, no zone, and **UTC**. Refal first said Jakarta time (7 Oct, posts reloaded that way), but the comments settled it the same day:
  - the 96 posts that the scraper also listed as their own first reply sit exactly 7.00 hours apart from them when the posts are read as Jakarta time, and line up to the second as UTC;
  - read as Jakarta time, no comment would arrive within 7 hours of its post, and the first boycott reply would come before the deleted post went up.
  - Read as UTC: first boycott reply 08:02 UTC (15:02 WIB) on 6 Oct; "Kenapa delete @kahfeveryday" 14:16 UTC (21:16 WIB); the apology 17:45 UTC (00:45 WIB on 7 Oct); the surge 00:00 to 01:59 UTC on 7 Oct (497 posts; 07:00 to 09:00 WIB, 08:00 to 10:00 in Malaysia).
- **Threads gives no views.** Reach is likes; `comments` is the reply count on each post.
- **What the posts are about (by eye, before labelling):**
  - Mostly Malaysians calling to boycott Kahf, and sometimes every Indonesian brand.
  - "Support local", with Bad Lab named as the Malaysian alternative.
  - Spill-over to ParagonCorp's other brands, matched on text in Pulse: Wardah 22 posts, ParagonCorp 12, Emina 8, Make Over 5.
  - Some Indonesians answer back.
  - A few early posts in the file are not about the case (a fun run, Watsons, Cosmoderm). The labeller sets these aside as `relevant = false`.
- **Labelling:** sentiment, stance, topic and voice come from `/api/cron/label` once deployed. Until then the 577 earned posts carry `stance_source = 'awaiting_context'`.
- **Comments, first batch** (`kahf/comments_threads_1007a.csv`, 7 Oct):
  - **Replaced.** Refal's first file had its text column out of line: 787 of 1,079 comments carried another row's text, and 10 sat under the wrong post. Those rows were deleted before labelling and the corrected file loaded in their place.
  - The corrected file's text column had no header; the stored copy names it `comment_text`.
  - 1,079 in → 927 loaded, on 91 posts. Every comment's post is already loaded; none needed a stub.
  - Dropped: 96 that are the post itself (Threads scrapers list a post as its own first reply; the loader now drops a comment by the post's author that repeats its caption), 39 with no text (stickers and images), the rest emoji only.
  - Kahf has no replies of its own in this batch (the one first counted was its apology post repeated).
  - Times carry a `Z` and are read as UTC, unlike the posts file.
  - The column is `source_post_url` (the loader now accepts it). There are no comment ids, so ids are hashed. 33 rows have a blank platform; the contract says Threads.
  - More batches to come; loading again upserts.
- **Comments, big batch** (`comments_structured.xlsx`, 7 Oct; the comments sheet is `kahf/comments_threads_1007b.csv`, the posts sheet `kahf/post_stats_1007b.csv`):
  - 10,509 in → 9,408 loaded, on 40 posts, none of them in the first batch. Real Threads comment ids.
  - Dropped: 749 under the two posts the contract drops (the June cake festival, the 2025 "which Kahf scent" post). Both have been pulled into the case, but only one comment on each is from the case; the rest predate it. Also dropped: 269 with no text, 83 emoji only.
  - One is Kahf's own reply.
  - **Times are Jakarta time**, without a zone, unlike the posts file (UTC) and the first comments file (Z). Read that way, each post's first comment lands 0 to 9 minutes after it. As UTC every post would wait 7 hours for its first comment, and as Malaysian time 35 of 40 posts would get comments before they went up. The contract now takes a zone per file (`naive_tz`).
  - **Copy-paste accounts:** 22 accounts posted the same text under three posts or more. The most active is one account pasting "Korang support brand badlab ni…" under 15 posts. Pulse's coordinated-pattern card reads these.
  - The posts sheet carries views, likes, comments and shares for these 40 posts (Threads views are not in the posts export). Not loaded, by Refal's call (7 Oct): reach is hidden for this case (`settings.pr.hide`), and views on 40 of 577 posts would make reach look complete when it is not.
- **Comments on Kahf's apology post** (`kahf_comments_structured.xlsx`, 7 Oct; `kahf/comments_threads_1007c.csv`):
  - 654 in → 604 loaded, all under `@kahfeveryday/post/DeKWiFpE_9K`. Refal says the scrape is incomplete; more is coming.
  - Jakarta time: the first row is at 00:45:50 WIB, the minute the post went up.
  - One row is Kahf's own (not labelled). Dropped: 41 empty, 9 emoji only.
- **Comments on @_zrhjkt_'s post** (`new_post_zrhjkt_structured.xlsx`, 7 Oct; `kahf/comments_threads_1007d.csv`):
  - 975 in → 921 loaded, all under `@_zrhjkt_/post/DeKfbrwk9No` ("Jangan main dengan boikot orang Malaysia", 2,837 replies). Dropped: 44 empty, the rest emoji only.
  - Jakarta time: the post went up at 02:03 WIB and the first comment came at 02:23.
- **All comments labelled by 12:30 WIB on 7 Oct**: 8,965 on posts about the case (off-topic left out). Labelling moved to every 5 minutes the same day.

