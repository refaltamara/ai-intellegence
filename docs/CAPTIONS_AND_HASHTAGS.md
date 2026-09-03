# Caption and hashtag skills (brainstorm, not yet built)

What the posts table already holds, per post: `caption` (99% of rows), `hashtags[]` (86% of rows, 3.9 tags per post on average, 696k tag mentions), `content_format` (81%), `product_category` (37%), `product_name` (11%). Comments are not loaded, so everything below is caption-side only: what creators and brands *say*, not how audiences react.

Top hashtags today: makeup, fyp, skincare, omgbeauty, wardah, glad2glow, skincareroutine, msglowbeauty, hanasui, cushionviral, cushion, kahf, lightplusbywardah, emina, makeuptutorial, sunscreen, glamazing, timephoria, reels, barenbliss, skintific, beauty, wardahbeauty, moisturizer, pixycosmetics. Three families are visible at once: category tags (skincare, cushion, sunscreen), brand and campaign tags (lightplusbywardah, glamazing, timephoria) and affiliate tags (pondsaffiliate, wardahaffiliate, cuanbst).

## Candidate skills, in suggested build order

1. **/hashtags** (hashtag leaderboard and rising hashtags). Top hashtags for a brand, a platform or the whole category in a window, with posts, creators, views and the week-on-week change. Answers "what is Wardah pushing this month" and "which hashtags are rising across the category". Pure SQL on `unnest(hashtags)`, GIN index already exists. Evidence: the top posts per hashtag. Ranking by views, not by count, so a tag used in ten viral posts beats one spammed in a hundred small ones.

2. **/campaigns** (campaign detection). A campaign is a hashtag that (a) appears mostly on one brand's posts, (b) is used by many distinct creators, and (c) spikes within a few weeks. Output per campaign: brand, hashtag, first and last seen, creators, posts, views, share of the brand's views in that period, tier mix of the creators used. This is the most differentiated skill: it shows competitor campaign scale and timing without any manual tagging. Watch-worthy for an agent ("tell me when a competitor starts a campaign with 20+ creators").

3. **/themes** (caption keyword and claim share). A curated Indonesian beauty lexicon in `src/config` (barrier, glowing, cerah, jerawat, acne, oily, kulit sensitif, SPF, retinol, niacinamide, ceramide, hyaluronic, glass skin, viral, racun, worth it, murah, diskon, promo, checkout, keranjang) grouped into claims, ingredients, skin concerns and commerce cues. Per brand and window: share of posts mentioning each theme and views behind them, compared with the category. Answers "Skintific talks barrier, Somethinc talks ingredients; nobody owns SPF on TikTok". Deterministic (ILIKE or full-text on caption), no model in the loop, so it fits rule 1. The lexicon is the decision to make: start small and let Refal extend it.

4. **/affiliate-tags** (affiliate program footprint). Tags ending in *aff*, *affiliate*, plus brand-specific affiliate tags (pondsaffiliatesociety, wardahaffiliate, cuanbst) mark creators posting under an affiliate scheme. Per brand: affiliate posts and creators, their views versus non-affiliate posts, and which tier they sit in. Complements the existing affiliate heuristics in `src/config/thresholds` with an explicit signal.

5. **/products** (product mentions). `product_name` covers only 11% of rows, but captions and hashtags carry product names (lightplusbywardah, refilltwcwardahaff, babycollagen). A product dictionary per brand, derived from the seeded `product_name` values plus hashtags that co-occur with one brand more than 90% of the time, would let /top-content and /discovery filter by product line. Bigger lift; do it after 1 and 2 show what the dictionary should contain.

6. **/hashtag-overlap** (shared hashtag space between brands). Jaccard overlap of hashtag sets between two brands, and the hashtags one uses that the other does not. Useful for positioning discussions, cheap to build on top of /hashtags.

7. **/format-mix** extension. `content_format` is already loaded; the strategy skill could show format mix per brand, and /hashtags could break down by format (tutorial vs review). Small addition rather than a new skill.

## Things to decide before building

- Hashtags are stored lowercase without the `#`; captions are mixed language (Indonesian, English, slang, leetspeak such as "b00ster" to dodge platform filters). Keyword matching will miss some spellings; the theme lexicon should list variants.
- Instagram posts can belong to several brands, so hashtag counts by brand must dedupe on (platform, url) when reporting category totals.
- `fyp`, `reels`, `viral`, `foryou` are noise tags; keep a stoplist in `src/config` and exclude them from leaderboards but not from evidence.
- No comments layer, so none of these skills measure sentiment. That stays with the comment-layer skills marked unavailable in v1.
