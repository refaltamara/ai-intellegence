# Fair Intel — product brief

A self-contained summary of what has been built, what the data holds, and what is deliberately out of scope. Written to be pasted into a fresh conversation as context for brainstorming. Figures verified against the live database on 3 September 2026.

---

## 1. What it is, in one paragraph

Fair Intel is an AI marketing-intelligence product built on Fair's social listening data for Indonesian beauty. It holds a cross-brand panel of creator posts for 91 brands on TikTok and Instagram, and answers questions about that panel through a set of named analyses ("skills") that compute entirely in SQL. A chat interface lets a marketer ask in plain language; the model never calculates anything itself — it chooses a skill, the database computes, and every number in the answer links to the posts behind it. Analyses can be put on a schedule as agents that email you only when something changes.

The core insight: every brand already knows its own numbers. Nobody can see the category. Fair Intel sees the category.

---

## 2. The data asset

| | |
|---|---|
| Brands tracked | 91 (Indonesian beauty, men's grooming, personal care) |
| Posts | 204,995 rows / 197,008 unique posts |
| Creators | 71,163 (40,411 Instagram, 30,752 TikTok) |
| Platforms | TikTok and Instagram |
| Period | Instagram 1 Jan – 30 Jun 2026; TikTok 5 Apr – 30 Jun 2026 |
| Posts with a shop cart (TikTok) | 27,586 |

**Per post:** brand, creator handle, platform, date, views, likes, comments, shares, saves, engagement rate, follower count at time of posting, tier, caption, hashtags, content format, product category, and on TikTok the tagged shop product, price, discount and cart flag.

**Creator tiers** (followers): nano ≤10K (55,512 creators), micro 10K–50K (9,118), mid 50K–500K (4,551), macro 500K–1M (469), mega 1M+ (523). The long tail is overwhelmingly nano — that is the shape of Indonesian beauty creator marketing.

**Caption and hashtag layer:** 203,216 posts carry a caption, 176,904 carry hashtags, 695,738 hashtag mentions across 60,719 distinct hashtags, averaging about four tags per post. Three families are visible: category tags (skincare, cushion, sunscreen), brand and campaign tags (lightplusbywardah, glamazing, timephoria), and affiliate tags (wardahaffiliate, pondsaffiliatesociety).

### Known limitations, stated honestly

- **No comments.** Comment text was not loaded, so there is no sentiment, no audience analysis, no "what consumers say". Twelve of the 29 registered skills are unavailable for this reason.
- **Six months only**, and TikTok only from April. Year-on-year comparison is impossible.
- **Instagram views are zero** for carousel and image posts; shares and saves never exist there.
- **Instagram Q1 covers 53 brands** (Beauty universe only); Q2 adds men's and personal care to reach 91. Cross-quarter comparisons must restrict to Beauty.
- **Some Instagram creators have no follower count**, so they fall out of tier-based and per-follower analyses.
- **Owned accounts exist on TikTok only.** Instagram is entirely earned (creator) posts.
- One category, one country. Depth, not breadth.

---

## 3. What it does

### Seventeen working analyses

**Creator-side**
- `/discovery` — find creators by platform, tier, follower range, months, who they have posted for and who they have not. Ranked by views, average views, comment rate, engagement rate, views per 1k followers or median views.
- `/mercenaries` — creators who posted for many different brands in a window.
- `/loyalists` — creators a brand retained across consecutive months, with churn.
- `/breakout` — small accounts whose views far exceed their follower base.
- `/affiliates` — separating affiliate and reseller accounts from genuine creators.
- `/overlap` — which brands hire from the same creator pool.

**Brand and content-side**
- `/compare` — head-to-head brand comparison over a window.
- `/brand-strategy` — one brand, one month: volume, tier mix, owned vs earned, cart share, format mix.
- `/top-content` — best posts by views, comment rate or engagement, with content filters.
- `/waves` — an unusual number of creators posting for one brand in a short window.
- `/launch` — week-by-week view of a product launch.
- `/funnel-mix` — funnel stage mix per brand.

**Caption and hashtag layer (newest)**
- `/hashtags` — leaderboard and rising hashtags, ranked by views, with change against the previous period.
- `/campaigns` — detects competitor campaigns automatically: a hashtag concentrated on one brand, used by many distinct creators. Returns timing, peak week, creators, views, share of the brand's output and the tier mix used.
- `/themes` — share of captions mentioning each of 37 themes across four groups (claims, ingredients, skin concerns, commerce cues), brand versus category with an index.
- `/products` — product lines behind the posts, with cart share and price; keyword mode counts caption mentions across both platforms.
- `/hashtag-overlap` — which brands share hashtag space, and what each uses that the other never does.

Twelve further skills are registered but return "unavailable" until the comment layer is loaded: velocity, forecast, objections, questions, dupes, claims, whitespace, seeding, audience, switchers, superfans, narrative.

### The three surfaces

1. **Ask** — chat. Type a question or a slash command. The model picks a skill, the database computes, the answer arrives with evidence chips; clicking one shows the actual posts, handles and dates behind the number.
2. **Agents** — any analysis put on a schedule. Runs on a cron, compares against the previous run, and delivers by email or in-app only when something changed. Turns the product from something you remember to open into something that tells you.
3. **Reports** — a run rendered as a document with a written headline, exportable.

### Design rules that shape everything

- The model never computes a number. Skills and a whitelisted query builder do, in SQL. A result without evidence is rejected by the runner.
- No raw SQL from model input, ever.
- The skill registry is the single source of truth: the UI, the slash menu and the model's tool definitions are all generated from one JSON file.

---

## 4. Architecture, briefly

Next.js App Router with TypeScript, Drizzle ORM over Neon Postgres, deployed on Vercel with Vercel Cron for agents, Resend for email, and a Python/pandas ETL for loading. Login is required; seven internal accounts exist, and chat history is private per user. Nothing about the stack blocks new analyses — a new skill is a registry entry plus one SQL file.

---

## 5. What it deliberately does not do

- No campaign execution: it does not book, contract, brief or pay creators.
- No sentiment or audience understanding (no comments loaded).
- No content generation.
- No cross-category or cross-country coverage.
- No public sign-up; internal accounts only at present.

---

## 6. Positioning thinking so far

The working conclusion is that **the AI is not the product — the cross-brand panel is.** Positioning on "AI creator marketing platform" invites comparison with a hundred influencer databases that have bolted on a chatbot, and loses on price. Positioning on competitive visibility means the only real alternative is a manual research team, and the comparison is won on speed by orders of magnitude.

Candidate positioning: *know what every beauty brand in Indonesia is doing with creators — before they announce it.*

The two sharpest demo moments identified:
1. **The mercenaries hook** — "the creator you are about to book posted for four of your competitors last month." Specific, visceral, checkable on the spot.
2. **Campaign detection** — showing a brand a rival's campaign it had not noticed, with the exact week it started and the creators used.

What is genuinely durable, in order: the cross-brand data nobody else holds; the encoded domain questions (mercenaries, loyalists, waves, campaigns are not generic BI); the evidence discipline, which is a trust feature in a market about to fill with confidently wrong AI tools; and the shift from pull to push via agents.

A proposed marketing motion: publish a free monthly Indonesian Beauty Creator Report — top campaigns, rising hashtags, shared creator pools, tier benchmarks — generated by the product itself. It demonstrates the tool, builds category authority, and every brand named in it becomes a warm lead.

---

## 7. Open questions worth brainstorming

- **Who is the buyer?** Brand marketing leads, agencies serving those brands, or is this primarily a sales and delivery tool for Fair itself? The answer changes pricing, packaging and roadmap.
- **Pricing shape.** Per seat, per brand tracked, or bundled into an existing service relationship?
- **The internal roster idea.** Fair holds an internal database of roughly 13,000 influencers with contact details, rates and collaboration history. Matching it to the panel by handle would make discovery operational rather than observational: filter for "in my roster" or "never contacted", and let the "for you" column mean something. Not built yet.
- **Is the comment layer worth the cost?** It unlocks twelve more skills and the entire sentiment story, but it is the largest remaining data investment.
- **Category expansion versus depth.** More Indonesian categories, more countries, or go deeper on beauty?
- **Where does defensibility actually sit** once competitors can also point a model at social data?
