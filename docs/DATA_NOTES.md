# Data notes (from profiling the three raw files, 2 Sep 2026)

Companion to `docs/PRD.md` §3. These findings override the PRD where they conflict. Raw files are listed in `data/raw/MANIFEST.json` and kept in private Vercel Blob (`pnpm raw pull <workspace>` fetches them; DECISIONS, 10 Oct 2026); brand mapping in `data/seed/brand_mapping_master.csv`. Since 10 Oct every source loads through the one loader (`src/loader/`, `pnpm load`); the per-source rules below are what its adapters do.

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
- **More posts** (`posts_structured.csv`, 7 Oct; `kahf/contents_threads_1007e.csv`):
  - 122 posts, 2 Oct to 7 Oct 13:27 WIB. Times are Jakarta time: the 17 posts already loaded match to the second when read so (the apology DeKWiFpE_9K at 00:45:49 WIB).
  - 105 are new (687 posts in all). The 17 already loaded keep their stance and relevance and take the newer likes, replies and reposts (the apology: 2,297 → 4,524 likes, 10,349 → 16,480 replies).
  - The file has no views or followers: the loader now keeps what a post already has when a later export lacks a column (`coalesce` on update), and reads `reshare`/`repost` (the first posts file's reposts were not read; they are now).
  - Some are off the case (Watsons on dry skin, forest fires, a Quran question): the labeller sets them aside (`relevant = false`).
- **Posts batch 3** (`Kahf New - posts batch3_structured.csv`, 7 Oct; `kahf/contents_threads_1007f.csv`):
  - 72 posts, 5 Oct 17:51 to 7 Oct 15:47 WIB, none loaded before (759 posts in all). Comments on them are still being scraped.
  - Jakarta time. No overlap to line up, so checked from the text: @rul.zmi (14:02) writes that Kahf Indonesia apologised "13 jam lepas (2am)"; the apology is 00:45 WIB (01:45 in Malaysia), 13 hours before 14:00 WIB.
  - Hours without a leading zero ("5:25:01") read as 05:25.
- **Comments batch 3** (`comments_batch3_structured.xlsx`, comments sheet, 7 Oct; `kahf/comments_threads_1007g.csv`):
  - 6,296 in → 5,998 loaded, on 54 posts already loaded (Kahf's Malay apology DeLYd4ZCb0u 906, @dirvandha 795, @farahanani33 314, @hafezmy 293), 4 Oct 19:50 to 7 Oct 16:22 WIB. None loaded before. Dropped: 226 empty, 72 emoji or symbols only. 17,858 comments in all.
  - Jakarta time: read so, no post's first comment comes before it, and the median first comment lands 8 minutes after the post.
- **Recent posts at 21:38** (`Kahf_717_contnt_7_oct_21_38 - kahf_threads_recent.csv`, 7 Oct; `kahf/contents_threads_1007h.csv`):
  - A different export: Threads' own columns (code, username, followers, verified, epoch `timestamp`, like/reply/repost/quote counts). Epoch times need no zone; the 35 posts already loaded carry exactly the times we had read as Jakarta time (716 of 716 agree to the second).
  - 717 posts: the 35 already loaded were left out of the file, as Refal asked, and keep their numbers; 682 written in the usual columns (quote_count as reshare, repost_count as repost); one July Watsons post (fraud warning) dropped as before the case. 681 loaded, 1,440 posts in all, nearly all on 7 Oct.
- **Recent posts, second pull** (`kahf_threads_recent - kahf_threads_recent.csv`, 7 Oct; `kahf/contents_threads_1007i.csv`): the same export. 1,085 posts; the 723 already loaded left out of the file, as asked; 362 written, the July Watsons post dropped again; 361 loaded, 1,801 posts in all. Comments for them come later as one batch.
- **Posts, not replies.** Both recent pulls are posts: post-level columns (reply, repost and quote counts, followers), and only 2 of their 1,042 rows are already in the database as a comment. Those two are replies (@kamuandri under @syed_event_supplier, @hanyasekilasnaluri under @noralanarosli0111); they were removed as posts and are in `drop_urls`, so they count once, as comments. 1,799 posts in all.
- **Recent posts, 8 Oct pull** (`kahf_threads_recent.csv`; `kahf/contents_threads_1008a.csv`): the same export, now with a `search_keyword` column (all "kahf"). 1,555 posts: 1,084 already loaded as posts and the 2 replies already loaded as comments were left out of the file; 469 written, two dropped as before the case (the July Watsons post again, and an April @kahfcommunities call for collaborations); 467 loaded, 7 Oct to 8 Oct 06:00 WIB. 2,266 posts in all.
- **Comments batch 4** (`comments_batch4_structured.xlsx`, 8 Oct; `kahf/comments_threads_1008b.csv`):
  - 1,367 in → 1,240 loaded, on 57 posts, 7 Oct 20:16 to 8 Oct 06:16 WIB. Dropped: 87 empty, 20 emoji or symbols only, 20 under the July Watsons post (dropped as before the case). 19,098 comments in all.
  - Jakarta time: no post's first comment comes before it; the median first comment lands 16 minutes after the post.
  - **54 of these comments had been loaded as posts** by the recent-posts exports (`1007h` 23, `1007i` 15, `1008a` 16): the keyword search returns replies that name Kahf as if they were posts. Each was removed as a post and listed in `drop_urls` with its `parent`, so it counts once, as a comment; the loader now moves anything said under such a reply to its parent post (the 5 replies under @kamuandri went to @syed_event_supplier). 2,212 posts in all. More of the recent-posts rows may be replies; they are caught the same way when a comments file lists them.
  - Jakarta time: the post went up at 02:03 WIB and the first comment came at 02:23.
- **Recent posts naming @kahfeveryday** (`kahfeveryday_threads_recent.csv`, 8 Oct; `kahf/contents_threads_1008c.csv`):
  - The same epoch export, now searched for "kahfeveryday": 1,000 rows, 29 Jul to 8 Oct 09:57 WIB.
  - Left out of the file, as asked: 113 already loaded as posts (they keep their numbers), 11 already loaded as comments, and 56 Meta AI answers. Also left out: the July Watsons post, which was dropped before as being before the case. 819 written and loaded, 3,019 posts in all.
  - **Meta AI only replies.** It answers when someone tags it under a post, so its rows in a posts export are comments. 12 of its answers had come in as posts from the 7 Oct pulls (8 in the first posts file, 3 in `1007h`, 1 in `1008a`). They were deleted as posts; none had anything said under them. The contract's new `reply_handles` (`threads: ["meta.ai"]`) keeps them out of every posts file, while its replies in a comments export still load as comments.
  - Text alone does not tell a reply from a post here. 197 of the 819 start with "@kahfeveryday" or "@meta.ai", but none of the 56 replies confirmed on 8 Oct started with "@", and 18 kept posts did. Any reply among them is caught the usual way, when a comments file lists it (`drop_urls` with `parent`).
  - Labelled by 10:37 WIB. 52 are off the case and 7 have no text. Of the 760 with a stance, 515 are against Kahf (68%), 137 neutral and 108 defend it. By side: Malaysian 429 (373 against), Indonesian 186 (55 against, 82 defending), unclear 145 (87 against). Across all 2,757 posts by other accounts with a stance, 1,839 are against (67%).
- **Comments batch 5** (`comments_batch5_structured.xlsx`, 8 Oct; `kahf/comments_threads_1008d.csv`):
  - 29,385 in → 27,545 loaded, on 117 posts, 6 Oct 09:49 to 8 Oct 10:36 WIB, none loaded before. 46,643 comments in all. The busiest threads: @dihah_zainal DeMlqA1Goxt 1,018, @diyanah.amran DeLE0C3k3xf 953, @kamaladli 919, @athirrushdan 912, @johanghazali_ 908.
  - Dropped: 1,151 empty, 363 emoji or symbols only, and 326 under the April @kahfcommunities post. That post stays dropped as before the case: its comments run from 30 April and are nearly all sponsorship requests.
  - **Numeric ids.** This export gives Threads' numeric comment id (4002354018088759275), not the short code the other files carry (DeLN8Ypia_r). The code is the same number written in base 64 (`A–Z a–z 0–9 - _`); checked on the 1,000 rows of the 8 Oct posts export, which carry both (1,000 of 1,000 agree). The file was written with codes, so comments match the ones already loaded. The xlsx stores the ids as text, so no digits were lost.
  - Jakarta time: no post's first comment comes before it, and the median first comment lands 9 minutes after (read as UTC, every first comment would come 7 hours late).
  - **336 replies loaded as posts** by the recent-posts exports (`1007h` 107, `1008a` 88, `1008c` 84, `1007i` 55, the first posts file 2). They were removed as posts and listed in `drop_urls` with their parent, so they count once, as comments. None had comments of their own in the database. The 467 rows in this file under one of them moved to its parent post (9 of the replies sit under another reply; the loader follows the chain). 2,683 posts in all.
- **All comments labelled by 12:30 WIB on 7 Oct**: 8,965 on posts about the case (off-topic left out). Labelling moved to every 5 minutes the same day.


## The one loader (DECISIONS, 10 Oct 2026)

Every source goes through the same steps:

1. Its raw files are read: the local copy when its hash matches the manifest, else the private store.
2. The source's adapter turns them into rows, mapped to our columns:
   - Beauty exports (`src/loader/adapters/beauty.ts`, from `etl/load.py`);
   - Fair Listening dumps (`listening.ts`, from the CMS's listening loader);
   - profile and case exports with their contract in `etl/profiles/` (`profile.ts`, from `etl/load_profile.py`).
3. The rows land in staging.
4. The checks run (`src/loader/checks.ts`, thresholds in `src/config/loads.ts`).
5. The load is held with a report, or promoted to the core, writing only what changed.

**Proving the ports.** Each port was run on every raw file the core was built from and compared column by column with the core (`pnpm load stage`, `src/loader/compare.ts`):

| Workspace | What matched | Differences |
|---|---|---|
| Beauty | 278,322 posts and 86,521 creators | none |
| Fintech | 13,275 posts, 114,633 readings, 116,366 comments and 9,087 creators | none |
| Kahf | 2,683 posts, 46,643 comments and 2,217 creators | none |
| Maudy | 3,559 posts, 53,846 comments and 2,867 creators | 261 posts |

- **Maudy's 261 posts.** On 7 Oct the profile rules changed: `reshare` and `repost` count as shares, and a later export no longer blanks a value an earlier one gave. Maudy was last loaded on 18 Sep, before that change. Re-loading through the one loader filled 258 follower counts (and tiers), 260 share counts and 3 like counts. For example, the 15 Sep evening file gives a post 82 followers and the 16 Sep file leaves the field empty.
- **Kahf's three comments.** Three comments our labeller tried and gave up on (`model_failed_final`) keep that mark when a file brings no label. The old rule reset them, so a reload paid to try them again.

Promoting the four loads changed nothing else: 0 rows in Kahf, Fintech and Beauty, and 261 posts in Maudy.

**Warnings.**
- A reported 0 followers (about 6,700 Beauty rows; the Q3 converter had already turned those zeros blank) and a video or reel with 0 views are flagged on the post (`posts.flags`). The four loads promoted on 10 Oct were staged before the adapters flagged, so the flags reached the core only with the Fintech and Beauty loads of step 3 (below); Kahf and Maudy have none to give.
- Images and text posts often report no views, so they are never flagged for it.

## One row per real post (DECISIONS, 10 Oct 2026, step 3)

A post is one `post_items` row; `posts` rows are its links to brands, each with a copy of the post's fields, kept in step by triggers (migration 0036). `pnpm load check-items` shows each workspace's links, posts, and anything out of step.

| Workspace | Links (`posts`) | Posts (`post_items`) | Links whose numbers moved |
|---|---|---|---|
| Beauty | 278,322 | 265,365 | 6,624 (views on 4,533) |
| Fintech | 13,275 | 13,167 | 21 views, a few followers |
| Kahf | 2,683 | 2,683 | none |
| Maudy | 3,563 | 3,563 | none |

**Why Beauty's brand rows disagreed.** The Instagram exports list a collab post once per brand it tags. The scraper read each brand's list at a different time, so one post shows different views, likes and follower counts under each brand: 6,593 posts sit under more than one brand, on 19,550 rows. When it folded them, the post took the numbers of the reading with the most views, the creator and followers of the row with the most followers, the earliest time and the longest caption (`src/loader/fold.ts`). Fields that differ because the brand differs stay on the link: universe (399 posts), category (1,620), product category (58).

**Views by brand, summed over links, before and after.** 43 brands moved; these ten by 0.1% or more, every other by less:

| Brand | Before | After | Change |
|---|---|---|---|
| somethincofficial | 34,471,946 | 36,624,785 | +6.25% |
| mopbeauty | 60,786,975 | 61,420,502 | +1.04% |
| whitelabid | 6,240,072 | 6,304,567 | +1.03% |
| itsomgbeauty | 208,449,096 | 210,372,980 | +0.92% |
| gouteid | 4,806,788 | 4,842,324 | +0.74% |
| makeoverid | 195,583,166 | 196,675,923 | +0.56% |
| luxcrime_id | 33,643,282 | 33,798,771 | +0.46% |
| judydollindonesia | 56,972,278 | 57,149,675 | +0.31% |
| wardahofficial | 468,536,540 | 469,526,012 | +0.21% |
| blpbeauty | 17,787,083 | 17,818,901 | +0.18% |

Summed over links, Beauty's views went from 8,360,865,832 to 8,370,110,691 and Fintech's from 338,433,509 to 338,434,264. Counted once per post, they are 8,273,330,457 and 335,968,707.

## Definitions and daily totals (DECISIONS, 10 Oct 2026, step 4)

Every number is counted by a definition in `src/definitions/catalog.ts`, from rows `refreshServing` rebuilds per workspace (`src/definitions/totals.ts`):

| Table | One row per | Rows today |
|---|---|---|
| `post_d7` | post: its reading nearest day 7, or its latest reading so far while it is under 7 days old | 284,774 |
| `daily_totals` | workspace, local day, brand (`*` = each post once), platform, owned or earned | Beauty 20,201 · Fintech 1,314 · Kahf 16 · Maudy 44 |
| `daily_creators` | workspace, local day, brand, platform, creator | Beauty 249,329 · Fintech 8,302 · Kahf 2,082 · Maudy 3,038 |

**Which reading "day 7" is, per workspace.** Fintech is read every day from day 0 to 30, so its day-7 number is the reading at day 7. Beauty's exports give one reading per post, at a median of day 103, so its day-7 number is that reading; the scraper team's day-7 stop and the Fintech shape will change that. Kahf and Maudy were read within days of their posts, so most of their posts count their latest reading so far.

**Decks and the weekly report** count the same way: views and engagement from the post's day-7 reading (`d7Join`), and a period holding posts under 7 days old is labelled "(so far)", with a data note saying how many. Fintech's September on Instagram shows why it matters: ShopeePay's own posts kept growing long after day 7 (one went from 1.35M views at day 8 to 21.8M at day 23), so at the latest reading ShopeePay held 88.0% of the panel's Instagram views, and 45.4% at day 7.

**Profile read times.** A profile contract carries one `export_time`, written for its first batch; later batches were added without one, and until 10 Oct read as exported at that first time. A file is now read no earlier than its latest post. Maudy's readings moved from 14 Sep 12:15 WIB to each file's latest post (15 to 18 Sep, 3,146 readings), Kahf's from 7 Oct 10:00 WIB (2,128 readings).

