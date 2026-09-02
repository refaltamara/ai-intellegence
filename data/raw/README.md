# Raw data files

Source: Paragon Q1/Q2 2026 exports from Fair Listening, cleaned by Refal. Converted from the original xlsx data sheets to gzipped CSV with no row or column changes. The README and Exclusions sheets from each workbook are reproduced below.

| file | posts | brands | window |
|---|---|---|---|
| tiktok_q2_2026.csv.gz | 60,211 | 54 | 5 Apr to 30 Jun 2026 (April has 23 captured days) |
| instagram_q2_2026.csv.gz | 67,965 | 91 | 1 Apr to 30 Jun 2026 |
| instagram_q1_2026.csv.gz | 76,819 | 53 | 1 Jan to 31 Mar 2026 (Beauty universe only) |

Load with pandas: `pd.read_csv(path, compression='gzip')`. `date_posted` is a string in the Q2 files and an ISO datetime in the Q1 file; parse with `pd.to_datetime`.


## TikTok Q2 2026

### README sheet

- **Scope**: TikTok, 11 Apr - 30 Jun 2026 (TikTok)
- **Rows**: 60,211 posts, one row per post.
- **Structure**: Native schema for this platform. Columns that only exist on the other platform are not included here - see the Combined Clean Data workbook for the harmonised cross-platform version.

**CLEANING APPLIED (this export)**

- **1. Structural exclusions**: Multi-brand compiled bucket, 'Product-Lip' bucket, 3 mis-mapped Head & Shoulders posts, 506 non-Indonesian market accounts - removed at source before this export. See Combined Clean Data workbook's Exclusions Summary tab for the full breakdown and counts.
- **2. Brand-name collision (NEW this pass)**: Posts whose caption names a different, unrelated beauty brand and never the tracked brand itself were removed - 605 posts on TikTok. This catches cases like TikTok's keyword capture pulling in Spanish-language 'Viva' football content, or Neutrogena/Garnier posts mis-filed under Luxcrime/MS Glow because of overlapping search terms. Instagram's tagging-based capture is far less exposed to this (only 48 posts, 0.07%), consistent with it matching an explicit brand tag rather than a keyword.
- **3. Handle consolidation**: Brands tracked under two handles this quarter (TikTok: Emina; Instagram: Esqa) are merged into one brand value. See 'brand' vs 'account_name_raw' if provided.

**KEY COLUMN NOTES**

- **tier**: Nano / Micro / Mid-Tier / Macro / Mega & Celebrities, from follower count. Validated against followers_numeric.
- **engagement_platform_native**: TikTok: likes+comments+shares+saves. Instagram: likes+comments only (API exposes no shares/saves).
- **engagement_likes_comments_only**: Likes+comments only, on both platforms - use this one for any cross-platform comparison.
- **yc_flag**: True = shoppable/affiliate link on the post. Blank (not False) = no product tagged at all - a third state.
- **category_derived_from_product_title**: Parsed from the product title text. ~82% agreement with the platform's own category tag - directional.
- **url**: Unique post identifier on this platform.
- **WHAT THIS FILE DOES NOT COVER**: Q1 Instagram raw data was never provided to us - only a pre-aggregated month x brand x tier summary (Q1_IG_Summary_Performance.csv), which is a different, much coarser file. This export is Q2 only, both platforms.

### Exclusions sheet

| Check | Rows removed | Note |
|---|---|---|
| Multi-brand compiled bucket | 1606 | Removed before this export |
| 'Product-Lip' bucket | 2124 | Removed before this export |
| 3 mis-mapped Head & Shoulders posts | 3 | Removed before this export |
| Non-Indonesian market accounts | 506 | Removed before this export |
| Brand-name collision (this pass) | 605 | NEW - see README |

## Instagram Q2 2026

### README sheet

- **Scope**: Instagram, 11 Apr - 30 Jun 2026
- **Rows**: 67,965 posts, one row per post.
- **Structure**: Native schema for this platform. Columns that only exist on the other platform are not included here - see the Combined Clean Data workbook for the harmonised cross-platform version.

**CLEANING APPLIED (this export)**

- **1. Structural exclusions**: Multi-brand compiled bucket, 'Product-Lip' bucket, 3 mis-mapped Head & Shoulders posts, 506 non-Indonesian market accounts - removed at source before this export. See Combined Clean Data workbook's Exclusions Summary tab for the full breakdown and counts.
- **2. Brand-name collision (NEW this pass)**: Posts whose caption names a different, unrelated beauty brand and never the tracked brand itself were removed - 48 posts on Instagram. This catches cases like TikTok's keyword capture pulling in Spanish-language 'Viva' football content, or Neutrogena/Garnier posts mis-filed under Luxcrime/MS Glow because of overlapping search terms. Instagram's tagging-based capture is far less exposed to this (only 605 posts, 0.07%), consistent with it matching an explicit brand tag rather than a keyword.
- **3. Handle consolidation**: Brands tracked under two handles this quarter (TikTok: Emina; Instagram: Esqa) are merged into one brand value. See 'brand' vs 'account_name_raw' if provided.

**KEY COLUMN NOTES**

- **tier**: Nano / Micro / Mid-Tier / Macro / Mega & Celebrities, from follower count. Validated against followers_numeric.
- **engagement_platform_native**: TikTok: likes+comments+shares+saves. Instagram: likes+comments only (API exposes no shares/saves).
- **engagement_likes_comments_only**: Likes+comments only, on both platforms - use this one for any cross-platform comparison.
- **account_type / is_owned_account**: Not present here. Instagram's tagging-based capture structurally excludes a brand's own posts, so this concept doesn't apply.
- **url**: Unique post identifier on this platform.
- **WHAT THIS FILE DOES NOT COVER**: Q1 Instagram raw data was never provided to us - only a pre-aggregated month x brand x tier summary (Q1_IG_Summary_Performance.csv), which is a different, much coarser file. This export is Q2 only, both platforms.

### Exclusions sheet

| Check | Rows removed | Note |
|---|---|---|
| Brand-name collision (this pass) | 48 | NEW - see README. Much lower than TikTok because tagging-based capture is more precise. |

## Instagram Q1 2026

### README sheet

- **Scope**: Instagram, 1 Jan - 31 Mar 2026. 53 brands, 76,819 posts, one row per post.
- **Source files**: beauty-januari-2-categorized, beauty-februari-categorized-v6, beauty-maret-categorized (as supplied). Combined into one table here.

**IMPORTANT SCOPE DIFFERENCE FROM Q2**

- **Beauty only**: This file's 'industry' field is 'Beauty' on every single row - there is no Male or Personal Care universe in it, unlike the Q2 Instagram file (91 brands across 3 universes). Either Male/PC weren't pulled for Q1, or they live in a separate export we were not given. Treat any Q1-vs-Q2 comparison as General Beauty only, or restrict the Q2 side to its Beauty rows first.
- **53 vs 91 brands**: The brand roster is narrower in Q1 - partly the Beauty-only scope above, partly genuine tracking expansion between quarters (see the main Combined Clean Data workbook's methodology notes).

**CLEANING APPLIED**

- **Handle merge**: 'esqacosmetics' (this file's spelling) merged into 'esqaddict' to match the canonical brand name used in the Q2 export and in the QBR deck. Original handle kept in account_name_raw.
- **Duplicate check**: 0 true duplicate rows (same url + same account_name). 7,987 rows share a url with 1+ other brands - this is expected: Instagram is captured by brand tagging, so a single post that tags several brands (a collab or giveaway) legitimately appears once per brand. Not removed. A handful of these show slightly different likes/comments per brand row - that's the capture running at slightly different times for each brand's pipeline, not an error.
- **Brand-name collision**: Spot-checked using the same method that found contamination in the TikTok Q2 data. Negligible here (as expected - tagging-based capture, not keyword-based), consistent with the near-zero rate found on the Q2 Instagram file. No rows removed on this basis.
- **Tier validation**: tier_category vs followers band: 96.8% match (Q2 Instagram was 99.7%). The tier field is carried as supplied either way - this is a QC note, not a correction.

**COLUMNS DROPPED FROM THE SOURCE FILE, AND WHY**

- **tagged_user**: Identical to account_name on every row (100% match) - pure duplicate column.
- **posts_count**: Did not match actual row counts per account and its exact meaning is not documented by the source tool - dropping rather than risk it being misread as a real metric.
- **location**: 87% null, present in the January file only - not usable.
- **engagement_score_view**: Present in the March file only, not documented, inconsistent across months - dropped for consistency. Recompute engagement_rate_comparable_pct from likes+comments+views if you specifically need a pre-built engagement score.

**KEY COLUMN NOTES**

- **category_new**: This is the SOURCE FILE'S 'Category' column - a fine product category (lip, cushion, moisturizer, serum...), not a broad Skincare/Makeup split. There is no broad-category field in this file at all, unlike Q2's category_broad. Fill rate ~86%, far better than Q2's ~25%.
- **content_type**: Reel / Video / Carousel / Image. Q2's Instagram file only ever contains Reel/Video - this Q1 pull has a wider content-type scope.

**views**

- **shares / saves**: Present as columns but are 0 on every single row in the source file - Instagram's API does not expose these, same limitation as Q2. Kept for schema consistency with the TikTok file; treat as non-functional here.
- **engagement_platform_native / _comparable**: Both equal likes+comments, since shares/saves are always 0. Rate is engagement / views - will be blank for Carousel/Image rows where views is 0.
- **tier**: 'Mid Tier' and 'Mega' recoded to 'Mid-Tier' and 'Mega & Celebrities' to match Q2's labelling. No other changes.
- **WHAT THIS FILE DOES NOT COVER**: TikTok Q1 raw data was not provided and is not part of this file. Male and Personal Care universes are not in this file - see scope note above.

### Exclusions sheet

| Check | Rows removed | Note |
|---|---|---|
| True duplicate rows (url + account_name) | 0 | None found |
| Multi-brand-tagged posts (same url, different brands) | 0 | 11,785 rows across 3,798 urls - kept, see README |
| Brand-name collision spot-check | 0 | Negligible on sample tested - see README |
| Handle merge: esqacosmetics -> esqaddict | 0 | Renamed, not removed - 1,847 rows affected |
