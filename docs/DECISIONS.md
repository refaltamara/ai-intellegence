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
- **Update (same day):** `query_metrics` also failed strict ("Schema is too complex"), so **no tool is strict** any more. Every tool input is validated server-side (per-skill JSON Schema, the query builder whitelist, the agent draft validator) and errors go back to the model. Chat runs at `ANTHROPIC_EFFORT_CHAT` (default medium) to keep adaptive thinking short; the system prompt and data-layer checks are cached for five minutes; each answer shows its timing split.

## Accounts and chat ownership (3 Sep 2026)

- Accounts: refal (owner), arneta, audia, wega, rafli, shahrukh (members), all `<firstname>@fair-indonesia.com`. Created with `pnpm user add`; passwords shown once in chat. There is no self-signup; the owner asks for new accounts.
- A conversation belongs to the user who started it. The sidebar, the Ask page, `/api/conversations` and the chat loop only return conversations whose `user_id` is the signed-in user. Conversations created before login existed were assigned to Refal.
- /discovery `rank_by` gained `views` (total views in the window, the default) and `avg_views`. The form selects tiers and months as toggles, brands from a searchable dropdown, and a followers min/max range. Selecting non-adjacent months yields one continuous window from the first to the last month, and the form says so.
- Email delivery is verified from the Agents page ("Send me a test email"), which posts to `/api/diag/email` and sends to the signed-in user's address through the same Resend adapter agents use.
- Caption and hashtag skill ideas are collected in `docs/CAPTIONS_AND_HASHTAGS.md`; none is built yet.

## Caption and hashtag skills (3 Sep 2026, Refal: build hashtags, campaigns, themes, products, hashtag-overlap; not affiliate-tags)

- Five new Phase 1 skills on the posts layer: `/hashtags`, `/campaigns`, `/themes`, `/products`, `/hashtag-overlap` (specs in PRD §4.3). 29 skills in the registry, 17 runnable.
- Reach tags and bare category words are a stoplist in `src/config/hashtags.ts`; excluded from leaderboards, campaigns and overlap by default, never from evidence.
- The theme lexicon is `src/config/themes.ts` (37 themes in four groups, Indonesian and English variants). Matching is whole-word full text over a generated `posts.caption_tsv` column (migration 0003, GIN index) so a 37-theme pass over a month runs in about 2 s. Extend the lexicon there; the query builder never takes free theme text.
- A campaign = hashtag with ≥ 15 distinct creators on one brand's earned posts and ≥ 70% of the tag's posts on that brand (defaults, both params). Tags contained in the brand's own name or handles are not campaigns.
- Products come from TikTok product tags only (`product_name`, 11% of posts, TikTok only); Instagram has no product tag, so keyword mode reports caption mentions across platforms separately.
- `/affiliate-tags` is not built (Refal).

## Answer formatting (4 Sep 2026, Refal: answers read as a wall of text)

- Every Ask answer and report headline now follows one shape: the answer in one or two sentences, then three to six one-line bullets each led by a bold label and an em dash, then an optional closing "so what" line. The old rules said "No headers" and "no bullet points", which is what produced the wall of prose; both prompts were rewritten.
- `RichText` groups consecutive bullet lines into a list wherever they appear, so a lead sentence followed straight by bullets with no blank line still renders correctly. `-`, `*`, `•` and numbered markers are all accepted. Covered by `src/ui/__tests__/richtext.test.ts`.
- Evidence chips keep any punctuation that follows them on the same line, so a comma never wraps alone.

## Ask layout and document attachments (4 Sep 2026, Refal)

- **Composer docked at the bottom.** The Ask screen is now a chat layout: the thread scrolls in its own region and the composer is pinned below it, so a new answer appears above the box you typed in and scrolling up keeps the box in view. The slash menu opens upward. The empty state uses the class `feed.start`, not `empty` — `.empty` is the muted placeholder utility and collided with it.
- **PDF attachments are context, never data.** A brief or competitor deck can be attached to a conversation; the model reads it for intent (brands, competitors, window, tiers, themes, budget) and still answers from the panel. System prompt rule 9: a figure in a document never gets an `[ev_]` citation, it is attributed ("the brief targets 4%") and compared with a cited figure where the panel can check it.
- Storage: `attachments` table (migration 0004), base64 in Neon, no new infrastructure. PDF only, 8 MB and 3 documents per message, magic-bytes checked server-side so a mislabelled file is rejected. Attachments belong to the uploading user and are bound to the conversation when the message is sent, so they inherit the per-user privacy rule.
- Documents ride on the current user turn with a cache breakpoint on the last one, so follow-up questions about the same brief are not re-charged for it.
- Not supported: .pptx/.docx (export to PDF), and image-only scans are read as page images rather than text.

## CeMO and the partner experience, step 1 (9 Sep 2026, Refal)

- The product is now **CeMO** ("Your CMO", Creator Intelligence for Market Monitoring). Fair Intel remains the internal codename; repo, package and schema comments keep it.
- PRD-v2 (docs/PRD_V2_PARTNER.md) is adopted with the v2.1 amendments listed at its top: client brand settable now on the workspace and later on the decision; brief keyed to loads; sounds deferred; no pg-boss; no strict tools; follow-ups as a trailing block; leak filter strips slashed names only; server computes pane deltas; lead-plus-bullets answer shape kept; no decision prompt before the first reply; /discovery folded into the pane in step 3.
- Step 1 is live: the model never sees or says a skill name; the slash menu is gone; activity lines come from `activity` in skills.registry.json (`{creator_count}`, `{post_count}`, `{matched}`, `{n}`); result cards use the registry `title`; the analyst asks at most one clarifying question per turn via `ask_user` (the turn ends on the question, the next user message is its tool_result); it may push back once per answer in a `<counter>` block rendered amber; it ends substantive answers with 2–3 follow-up chips carrying skill and params; `mechanism_leak` is logged per message.
- Client brand: `workspaces.client_brand_id`, default none; the owner sets it on the Data page (`PATCH /api/workspace`), which also flips `brands.is_client` and drops the cached prompt. The sidebar shows "On the side of {brand}". With no client, the prompt asks once which brand "us" means.
- Typography tightened: 14px answers and bullets, 22px hero, quiet grey user bubbles (from the v3 prototype), 28px avatar.

## Partner experience, step 2: Decisions, the brief, Today (9 Sep 2026)

- **Decisions** are the unit work attaches to (`decisions`, `pins`, and `decision_id` on conversations, agents and reports; migration 0005). Every existing conversation was backfilled into its own decision named from its title. A new thread from Today opens a new decision named from the first message; inside a decision, new threads join it. Threads stay private to their author; the decision, its pins and its watchers are shared.
- **Client on the decision.** `decisions.client_brand_id` overrides the workspace client for that decision's threads; the model is told in an uncached system block appended per turn, together with the decision name, status and pinned summaries.
- **The brief is keyed to the data**, not the calendar: `briefs.data_key` = newest post + last finished load. `ensureBrief` writes a new one when the key moves, on demand (at most once an hour), or from the daily cron at 06:00 WIB (`/api/cron/brief`). It runs compare (client first, then the week's busiest brands, vs the prior week), waves and breakout over the last seven days of data, gathers what the watchers found, and asks the model for headline, body, one offer and up to two follow-ups through `write_brief`. Deterministic fallback without the model. A brief never carries a number without an evidence chip unless it is quiet.
- **Today** replaces Ask at `/`: brief hero, "Or ask me something", open decisions, what the watchers noticed this week. Old `/?c=` links redirect into the thread's decision. The thread lives at `/d/[id]?c=`; `?send=` starts a thread with its first message already sent (how the offer and follow-up chips work).
- Sidebar: Today, Decisions, Watching (formerly Agents), Reports, Data, with open decisions listed below. "Skills" left the navigation; `/skills` and `/skills/discovery` stay reachable from result cards until step 3 folds discovery into the pane.
- "Pin to decision" sits in the answer's action row; pins are persisted skill runs and appear in the decision header.

## Chats first; Decisions is the proactive side (9 Sep 2026, Refal's feedback on step 2)

- **Chats is the default screen** at `/`: free-form, unattached to a decision. Decisions and chats have different jobs — a chat is whatever you want to ask; a decision is where CeMO brings you analysis to kick off your thinking. Today is gone; the brief, what the watchers noticed, and the decisions list live at `/decisions`. A thread started inside a decision belongs to it; a chat started from Chats does not, and no decision is created on its behalf.
- The 49 decisions auto-created from old chats during the step-2 backfill were folded back into plain chats (decisions with one thread, nothing pinned, nothing watching, whose thread predates them).
- **Skills stays in the sidebar** as the library of what CeMO can do. The rule is narrower than PRD-v2 §3: no analysis names inside a conversation, not no analysis names anywhere.
- **The answer comes first.** In the thread the text renders above result cards; cards collapse to a one-line strip (title, window, matched) that expands on click; charts render only with three or more points; caveats sit behind "About this data" instead of repeating under every card.
- Prompt rules 4, 4b, 4c: never narrate defaults or "the system"; when returning a list, one line states the route (platform, window, tiers, exclusions) before the findings; limitations only when one changes the answer.


- **Step 3 (evidence pane) shipped:** thread left, object right. The server decides what opens the pane (`paneOf`: rows, a chart with three or more points, an agent draft; a `query_metrics` result of three rows or fewer stays inline) and emits `pane_open`. Tabs are titled from the registry title plus tiers, platform and window, never the skill name. Sort and filter are cosmetic and stored in `skill_runs.pane_state`; exclusions and filter changes are pane actions: hidden user turns whose numbers (rows before/after, what was removed, overlap after a re-run, the top three) the server computes in `src/chat/pane.ts`; the model only phrases them in one or two sentences. Changing filters re-runs the skill server-side and the new object replaces the tab. `/discovery`'s filter form is the pane's "Refine" drawer for discovery runs; other skills get window and platform. The Skills page and `/skills/discovery` stay as the library.
- **Export:** `GET /api/runs/[id]/export?format=csv|xlsx` writes the full result with the pane state applied, human column labels, numbers as numbers, an `Evidence url` column, and an "About this list" sheet (CSV: a commented header block). The `.xlsx` is written by a small in-repo writer (`src/export/xlsx.ts`, zip + inline strings) rather than the npm `xlsx` package, which carries known parser CVEs. Exports are logged in `exports`; a download from a thread leaves a hidden note the model sees in front of the next message. `export_run` is the fifth tool: one sentence and a download chip, never a pasted link. No email path for large exports in v1 (no pg-boss): discovery caps at 200 rows.
- **Step 4 (brand pages) shipped:** `/data/[brand]` is a coverage page, not a dashboard: coverage (posts, creators, owned/earned, capture days per month with amber "partial" under 15 days), creator tiers (share of creators next to share of views; under 5 creators reads "too few to compare"), posts over time (13 weekly bars, owned stacked on creator posts, hatched gaps where the workspace captured nothing, growth against the prior period of the same length or "no comparison"), top creators (worked for, last post for the client), hashtags (brand-name tags hidden by default, generic reach tags left out, "new" / "no comparison" / "—" for single posts). Periods 30 d / 90 d / all, anchored on the newest post. "Ask about this" opens Chats with a prefilled question that names the brand and period; no `context_json` column, the prompt carries the context. Sounds stay out (no sound field in the data). No brand_coverage view: the queries run on `posts` and `mv_brand_week` in well under a second per page.
