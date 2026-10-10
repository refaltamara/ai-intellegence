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

## Workspaces as subjects (Refal, 14 Sep 2026)
- A workspace is a subject: a category panel of brands (`kind = category`, the beauty panel), or one profile (`kind = profile`: an artist, an executive). The tables are the same; the data is always contents, comments, sentiment. Nothing is ever shared across workspaces: every query is scoped by the session's workspace, users belong to one workspace, and only owners (Fair staff) can switch, through a cookie checked against their role.
- Product name, tagline, the label under it, the persona sentence in the prompt, the empty-screen question and suggested prompts come from `workspaces.kind` and `workspaces.settings` (`src/workspace/config.ts`), with defaults per kind: CeMO / "Your CMO" for a category, "Fair Intelligence" for a profile ("Your CMO" reads wrong on a sentiment brief). `pnpm workspace add|set|list` manages them; `pnpm user add --workspace` binds an account.
- Login looks the email up across workspaces (owners first); the session carries the workspace. The brief cron runs for every workspace. The first profile workspace is `maudy-ayunda` (Fair Listening export of contents and comments across Instagram, TikTok, X and Threads, sentiment in three classes, emoji-only comments dropped at source). Its team gets accounts bound to that workspace only.
- Next for profile workspaces: the comments loader (contract written from the export's headers), then the comment-layer skills, starting with sentiment over time with a spike threshold, negative themes with evidence, and seeding detection.

## Profile loader and sentiment labels (14 Sep 2026, from Refal's Maudy Ayunda export)
- **One contract per profile** (`etl/profiles/<workspace>.json`): the subject's brand id and owned handles per platform, the export time (YouTube exports relative times like "21 hours ago"; they are anchored to it), the subject keywords, the platforms the keyword rule applies to, the link-spam rule, an explicit drop list with reasons, and the files. `python3 etl/load_profile.py etl/profiles/maudy-ayunda.json` (`pnpm etl:profile`) loads it; `--dry-run` prints the report without writing.
- **Five platforms.** `youtube` joins the platform checks on posts and creators. The YouTube video is the root of the Maudy crisis; its comments are the largest single source.
- **Off-topic contents are removed at load, not flagged**, and every drop is listed with its reason in the load report (`data_loads.report`): the explicit list (a Vietnamese singer, "Selvi Ayunda", a mask-price video, two unrelated Threads threads), X link-farm accounts (three or more links in the caption; X only), and on YouTube, TikTok, Instagram and X, captions with no subject keyword. Threads is exempt from the keyword rule: replies inside a thread about her rarely repeat her name. Comments on a dropped post are dropped with it.
- **Comments only carry sentiment**, three classes: positive, neutral, negative. Empty and emoji-or-symbol-only comments are dropped at load. The subject's own replies are kept (they are evidence: "she replied here, 429 likes") with `sentiment_source = 'subject'` and never labelled. Labels that arrive with an export keep `sentiment_source = 'listening'`; the model's are `'model'` with a confidence.
- **Earned posts carry a stance**, same three classes, in `posts.stance` (`stance_source`). X and Threads are conversation platforms: the post itself is the opinion. Owned posts never get a stance. The headline number is always comment sentiment; stance is a second lens over who is driving it.
- **Labelling runs on Vercel**, not in the loader: `/api/cron/label` every five minutes (ten until 7 Oct 2026; a run stops inside its 240 s budget, so runs do not overlap), under `CRON_SECRET`, in batches of 40 with the post caption as context, within a 240 s budget, and it does nothing when nothing is unlabelled. A comment the model fails to label twice is marked `model_failed` and reported rather than retried forever. Reloading a file never overwrites a model label with a blank.
- **Stub posts.** A comment whose post is missing from the contents export gets a stub post (url, handle from the url, first comment as posted_at, `content_type = 'stub'`), so no comment is orphaned; stubs are never stance-labelled and are listed in the report.
- Comment ids are stored as `platform:id`; Threads exports carry no ids and Google Sheets rounded nineteen Instagram ids to scientific notation, so those get `platform:h:<hash of post, author, time, text>`. Dates with no zone marker are read per platform from the contract (`naive_dates_tz`): Threads contents carry a time in UTC (checked: read as WIB, every first reply landed exactly seven hours after its post); Instagram and YouTube contents are date-only and are read as WIB midnight. ISO, epoch-milliseconds (X) and `+0000` dates are taken as given; comments on every platform carry full UTC timestamps.

## Comment-layer skills (14 Sep 2026, first four; built on the Maudy data)
- **Four skills run on comments**, wherever comments are loaded (the beauty panel has none, so they are unavailable there): `sentiment` (split over time with the spike), `comment-themes` (recurring words and phrases of one sentiment, with the comments that carry them), `drivers` (posts ranked by the comments they drew, the accounts behind them with reach and stance, the commenters who show up most), `seeding` (same wording across accounts, one account repeating across posts, bursts of first-time commenters). The topic-based comment skills (objections, questions, dupes, claims, whitespace) stay unavailable until a taxonomy exists.
- **Windows are over comment time** and count back from the newest comment, not the newest post (`src/skills/comments-common.ts`); the subject's own replies are excluded from every count.
- **Unlabelled is never neutral.** Every result carries the count of comments without a label yet; `comment-themes` on one sentiment returns unavailable while nothing in the window is labelled.
- **The spike rule**: a bucket (hour for windows of three days or less, day otherwise) is a spike when its negative comments reach max(20, 3 × the median bucket). Both thresholds are parameters.
- **Themes are counted, not modelled**: words and adjacent word pairs per comment, stopwords and the subject's name removed, a word folded into a phrase that carries at least 80% of its comments ("deaf" into "tone deaf"). The model reads the examples and names the theme; it never counts.
- **Seeding reports patterns, not verdicts**: identical text (15+ characters) from three or more accounts, five or more comments by one account across two or more posts, fifteen or more accounts whose only comment lands on one post within ten minutes. Memes ("tone deaf final boss") trip the wording rule on purpose; the caveat says to read each pattern. YouTube's rounded comment times are excluded from burst detection.
- The profile system prompt names these four as the place to start and tells the model the creator analyses are not meaningful for a subject.

## Weekly competitor report (Refal, 29 Sep 2026; first client: Paragon)
- The product sold is the **dashboard and the weekly report**, both inside Fair Intel, on the same numbers. Chat stays in the platform with a monthly message cap per client; a logged-in connector (never open) is the option for clients who want to bring their own Claude.
- The report watches a contract (`data/weekly/<client>.json`, later `workspaces.settings.weekly`): the client's brands (reported as a portfolio, in the appendix only) and a watchlist split into core and "when relevant" brands. A watchlist entry can group brands ("Maybelline / L'Oréal") and name ones the panel does not collect yet.
- **Highlight rule** (`src/competitor/flags.ts`, defaults in `src/config/weekly.ts`, overridable per workspace and recorded in every report): a brand-platform move is highlighted only when this week is outside the brand's own 8-week range and ≥2 SD from its 8-week average, moved ≥20% against last week (≥0.5 pt for engagement rate), and clears ≥30 posts or ≥1M views. Posts and views are judged as **share of the panel (SOV)**, so a panel-wide swing (TikTok's panel tripled in the week of 8 Jun) is not read as brands moving; basis "count" is available. Engagement rate is platform-native and never compared across platforms; posts where engagement exceeds views are left out of it.
- At most three brands get a "what's driving it" slide, the most unusual first. The lenses are fixed and in order: who (creators, first-time creators, tier mix), what (top posts, format), campaign (hashtags ≥3 creators, share of the tag that is the brand's), owned vs earned (TikTok until the new collector covers brand accounts elsewhere), action (yellow cart, TikTok only). Persona is out. High views at under 0.3% engagement read as paid distribution. A week with no highlight is a valid report: the deck says "quiet week" and shows what came closest and why it is not news.
- Deck (PPTX, then PDF through LibreOffice): summary (New / Working / Worth testing) · scoreboard · movers · one driver slide per mover · what the client should do · appendix: client portfolio · appendix: evidence posts and how to read. English only. The narrative is the model's phrasing of the facts; `checkNarrative` rejects any number not in the facts and any text over its word limit.
- Views are one capture per post in the current panel, not a fixed age; the live collector measures every post at day 7 and runs daily, so that note falls away. The June 2026 sample decks are labelled "Example report".

## Teams at sign-in, and the connector (Refal, 29 Sep 2026)
- **People pick a team, not a workspace.** Every sign-in asks "What do you do?" (`/persona`) and the answer opens that team's data: **PR team** (a profile workspace, today Maudy Ayunda; opens on Pulse) or **Brand & KOL team** (the beauty category panel; opens on Chats). A team is a workspace seen from the job it serves (`settings.team`, defaults by kind), so data never mixes. Switching later is the toggle at the top of the sidebar; the workspace dropdown is gone. People with one team skip the question. Owners reach every team; members their own (today Arneta, Fajar, Laily and Setyaratu: Brand & KOL only). Rika and Shahrukh were removed; their chats stay in the workspace, detached.
- **Removing someone takes effect at once.** The request gate checks the users table (cached 30 s), not just the cookie's signature, so a removed account is signed out on its next request and role changes apply without a new sign-in.
- **The connector (MCP).** `/api/mcp` serves Fair Intelligence to Claude, ChatGPT or any MCP client over Streamable HTTP (stateless, JSON responses, tools only). Sign-in is OAuth 2.1 over the normal login: dynamic client registration, PKCE S256, one-time codes, 1-hour access tokens and 30-day rotating refresh tokens, all stored as SHA-256 hashes. On the consent screen the person picks the team; the token is bound to that one workspace and is re-checked against the account on every use. The tools are the analyses that can run in that workspace (a PR team gets the comment and post analyses, not the creator-market ones), `query_metrics`, and `workspace_overview`; numbers are computed in SQL as in the app, with evidence.
- **Connector limits** (`src/config/mcp.ts`, every call logged in `mcp_calls`): 20 analyses a minute and 300 a day per person, 2,000 a day per workspace, 50 rows and 60 evidence items per answer, 60,000 characters per result. The client's AI plan pays for the model; Fair pays only for the queries. People see their connected apps, today's usage and a Disconnect button at `/connect`.

## A simpler app: three places, and CeMO as the assistant's name (Refal, 30 Sep 2026)
- **Names.** The platform is **Fair Intelligence** on every team. **CeMO** is the assistant you talk to in Chats, on every team (like Dot or Meta AI inside their apps). `workspaces.settings.assistant_name` can rename it; the default is CeMO.
- **The sidebar has three places**: Pulse (the numbers), Chats, Reports. Plus Recent chats, "Connect Claude / ChatGPT", and the account row. The box naming the subject ("Beauty · Indonesia / On the side of Wardah", "About Maudy Ayunda") is gone; the team toggle says which data you are in.
- **Decisions are retired.** `/decisions` and `/d/<id>` redirect to Chats (a decision thread opens as a normal chat). The tables and rows stay; nothing is deleted.
- **Skills leave the sidebar.** Type "/" at the start of the chat box, or press "+", for the team's analyses in plain names (`teamSkills`, the same list the connector serves; a PR team gets comment analyses first, and not the panel-only post analyses: campaigns, products, caption themes). Picking one fills the box with its example question to edit; no skill name reaches the thread. The library stays at `/skills` ("What CeMO can do"), linked from the bottom of the menu.
- **Watching is the Scheduled half of Reports.** `/reports` has Library (everything produced) and Scheduled (what runs on a schedule, formerly `/agents`, which now redirects). The weekly competitor report becomes a scheduled report here (PPTX and PDF to email), next.
- **Data leaves the sidebar**: the inventory and the client-brand setting open from the database icon in the account row. Brand pages stay at `/data/[brand]`, and will open from the dashboard.
- **Chat text is 13px** (was 14px): messages, answers, counter blocks and the composer.

## Dashboard and Pulse, and "Ask why" (Refal, 30 Sep 2026)
- **Dashboard is fixed, Pulse is yours.** Every team has one Dashboard (`/dashboard`), built by us: the numbers everyone quotes, with filters only. Pulses (`/pulse`, step 4) are boards people build per situation from the same cards, from templates, by drag and drop or by adding a chat answer; a Pulse can be scheduled into Reports as PPTX/PDF. Until then `/pulse` redirects to the Dashboard. Both teams open on their Dashboard after sign-in.
- **The PR team's old Pulse page is its Dashboard**, unchanged, with "Ask why" on its three panels.
- **Brand & KOL Dashboard** (`src/dashboard/data.ts`, every number in SQL): filters platform (all / TikTok / Instagram), brands, and a period (a calendar month or an ISO week, workspace time zone), always compared with the period before. Sections: headline tiles (content, views, engagement, engagement rate); brand rankings (search, sort, pages of 12; growth is views against the previous period; a blue mark when a brand-platform move is unusual by the weekly report's rule, judged per platform against the brand's own previous periods); creator tiers (brand accounts excluded; unknown followers are in no tier); mentions over time (weekly, the twelve full weeks up to the period's end, the eight brands with most content or the brands picked); top creators by views and by comments (brand accounts excluded by handle); trending content as text cards with a link (thumbnails wait for the new collector), sorted by views, engagement or engagement rate, with keyword or @username search.
- **Counting**: brand rows count rows (a collab post counts for each brand); totals, tiers, creators and content count each post once. With both platforms, engagement is likes + comments (the only measure the two share); on one platform it is platform-native. Engagement rate ranks only brands with 30+ posts and posts with 50K+ views. No brand is highlighted as "yours" (Refal, 30 Sep).
- **Caveats print above the tiles** when the period is partly covered, the previous period is partly captured (TikTok April: 23 of 30 days), or the brand roster changed by 10% or 5 brands.
- **"Ask why"** is on every tile, ranking row, tier card, chart point, creator and post. The link carries only what was clicked and the filters (`src/dashboard/askref.ts`, base64url JSON, shape-checked); the server re-reads the figures (`src/dashboard/ask.ts`), and Chats opens with a card showing them, a suggested question to edit, and "Back to dashboard" to the same filters. On send the card is stored with the message (`content_json.context`) and the figures go to CeMO in front of the question, in the turn and whenever the history is replayed. A reference that points at nothing starts a plain chat.

## Scheduled reports: the Weekly Competitor Pulse (Refal, 30 Sep 2026)
- **A weekly report is a schedule under Reports → Scheduled** ("Weekly Competitor Pulse" beside "Any analysis"): who it is for (client name and brands), the watchlist (rows of brands, core or when relevant), the files (PowerPoint, PDF or both), recipients (a comma-separated list; empty = Library only) and a day and hour (WIB). It is stored as an agent with `kind = 'weekly_report'`, the contract in `params` (the same shape as `data/weekly/<client>.json`), checked on save: every brand id must exist in the workspace. A new form starts from the workspace's first client (Paragon for the beauty panel).
- **Each run reports the latest week the data fully covers** (the week of the last post if that is a Sunday, else the week before). A scheduled run remembers the week it sent (`params.last_week`) and skips when there is no new week, so a static panel does not resend June every Monday; "Run now" always produces the report, for the latest week or any week picked.
- **The words**: the model writes them through one tool from a fact sheet in which every number is already printed as the deck prints it; `checkNarrative` rejects any other number and any field over its word limit, the problems go back, twice at most. After that, or without a model, the report ships with a plain narrative built from the facts (marked "plain wording" in the Library). A report never fails for words.
- **The files**: the .pptx (PptxGenJS) and the .pdf are drawn from one layout: `buildDeck` lays the slides out, and the PDF replays the same calls with pdfkit, set in Liberation Sans (metric-compatible with Arial, SIL OFL, in `assets/fonts`). No LibreOffice, so it runs on Vercel. Files are stored in `report_files` (base64, cascade with the report), downloaded at `/api/reports/files/<id>` within the workspace, and attached to the email with the three-line summary, the movers and the actions.
- **The three schedules from Watching** (MOP vs ESQA, ESQA products, Ramadan launch) are to be paused by an owner from Reports → Scheduled.

## Pulse: boards people build (Refal, 30 Sep 2026)
- **Pulse (`/pulse`) is the team's own boards**, next to the fixed Dashboard. A Pulse belongs to a workspace and everyone on the team sees and edits it. The sidebar is Dashboard, Pulse, Chats, Reports.
- **Start from a point of view**: Competitor weekly (latest week: headline numbers, rankings, mentions, trending content), Campaign tracker (latest month: volume, views, engagement, mentions, who carried it, who got people talking, content), Creator scouting (tiers, top creators by views and comments, posts that over-perform), or Blank. Brands and platform picked at creation apply to every card. A PR team (one subject, no brand panel) gets Blank and pins answers from Chats.
- **Cards** are the Dashboard's views with their own filters: headline number, brand rankings, mentions over time, creator tiers, top creators, trending content. Their numbers come from the Dashboard's data layer, in SQL. A card's period is "latest month", "latest full week" (both move as data arrives) or a fixed month or week. A card can also be an **analysis pinned from Chats** ("+ Add to a Pulse" in the evidence pane): it shows the stored result (chart, first rows) and "Refresh" re-runs it with the same parameters.
- **Building**: "Edit layout" turns on drag to reorder (and ← → to move without dragging), S/M/L width (a third, half, full on a 12-column grid), Edit (the card's filters and settings), remove, rename and delete the Pulse. "+ Add card" picks a kind and its filters. Every Dashboard section has "+ Add to a Pulse", which saves that view with the filters on screen (the newest month or week is saved as "latest", so it keeps moving).
- "Ask why" works on Pulse cards as on the Dashboard. Sending a Pulse as a scheduled deck is not built yet; the Weekly Competitor Pulse is the scheduled report today.

## Deeper reports, one Reports list, Pulse with the report's points of view, quieter chat (Refal, 1 Oct 2026)
- **The weekly deck goes to 10–12 slides plus two appendix pages**, combining what worked in the Paragon W23 deck (scoreboard, movers, driver slides, appendix) with the MOP Beauty Competitive Pulse's points of view. After the drivers come the landscape slides (`src/competitor/landscape.ts` facts, `src/competitor/landscapeDeck.ts` layout): **creator tiers** per brand (share of content and of views by tier, biggest tier by views, median views per tier), **what creators put in front of the camera** (categories named in captions, `src/config/categories.ts`, and TikTok cart products), **posting pattern** (posts per day for this week and last, each brand's peak day and concentration, promo / double-date / payday captions, time of day), **competitor close-ups** (watched brands that did not move, two per slide: pushing, own channel, creators, offers, and "next"; one slide on a busy week, two on a quiet one) and **patterns worth knowing** (clippers, one creator carrying a brand, affiliate bursts, templated captions, seeding tags; floors in `landscape.ts`, a pattern under 1% of a brand's views is left out).
- **The recommendations are three to five moves**, each with a priority (High = this week, Medium = this month, Test = a pilot), the number that justifies it, and exactly what to do; "look closely", "monitor" and "check" are not recommendations. The title says how many and what timing ("five moves, three before 7.7").
- The model writes the new words (titles, the takeaway under each, close-up labels and next lines, the moves) under the same rule: only numbers the facts print; `checkNarrative` also requires every landscape field and a priority on every move. Double dates ("6.6") and clock times are not numbers to check. Reports stored before today have no landscape and keep their old shape.
- **Reports is one list.** Each schedule (with Run now, Pause, Edit, Delete) and the reports it produced, then reports from Chats, then reports from schedules since deleted. Every report and every schedule can be deleted from the list (a deleted report takes its files; the run that made it forgets it). "+ New schedule" opens the setup; `/reports?schedule=<id>` opens one schedule (settings, a run for any past week, every run). The Library / Scheduled tabs are gone.
- **"Turn into a report" takes the whole conversation** (`src/reports/conversation.ts`): every question, CeMO's answer, the tables and charts behind it and the evidence it cited, under key findings and next steps. The summary is written by the model from the answers and may only use numbers the conversation showed (`checkSummary`, one retry); otherwise it is the lead sentence of each answer.
- **Pulse cards gain the report's points of view**: tier mix by brand, what creators push, posting pattern, brand close-up and patterns, read from the same landscape facts for the card's brands (up to 8; the most-posted when none are picked), platform and period. New template "Competitor deep-dive". A Pulse can be deleted from the Pulse list. Migration 0013 widens the card kinds.
- **Chats is a conversation, not a menu**: no suggested follow-up questions, no suggested questions on the empty screen, and no amber pushback block (a pushback is one plain sentence in the answer). The evidence pane opens only when asked ("Open the list"), and a chart shows only when asked ("Show chart") unless the result is only a chart.

## Weekly Reports: the deck, slide by slide, with Ask AI (Refal, 2 Oct 2026)
- **Weekly Reports** (`/weekly`, sidebar, Brand & KOL team only) shows the client's weekly competitor decks as the actual slides: the stored PDF drawn in the browser with pdf.js, a week switcher (newest report per client and week), thumbnails, arrow keys, PDF and PowerPoint downloads, and **Present** (full screen, dark, Ask AI still beside the slide). It stays separate from the decks people will build later (step 2): the Weekly Competitor Pulse is the pre-built one.
- **Ask AI on a slide**: a side panel; each question carries only which report and which slide (`src/reports/slideAsk.ts`). The server reads the slide's text and the report's whole fact sheet from the stored report (`blocks.slides`, `blocks.sheet`, written by `storeWeekly` from the same layout as the files) and hands them to CeMO in front of the question; the answer is written to be said out loud, quotes the report's numbers, and runs the analyses for that week when the question needs more (which creators, which posts, a brand's tier mix). History keeps the slide, not the sheet. The thread is a normal conversation (it shows in Chats).
- The five June weeks for Paragon (W22–W26) were published with `pnpm weekly:publish` from the checked samples in `data/weekly/paragon/`, as runs of the Paragon schedule. Scheduled runs from now on store the slides and the sheet themselves; the email links to the report in Weekly Reports.

## Decks: from a template, from scratch or from Chats; Pulse and Reports folded in (Refal, 2 Oct 2026)
- **Decks** (`/decks`) are slide decks as deep as the weekly report, which a Brand & KOL team builds itself. The sidebar is Dashboard · Weekly Reports · Decks · Chats; Reports leaves it (Weekly Reports → Schedule opens it). **The Weekly Competitor Pulse · Paragon stays separate**, pinned at the top of Decks and opened in Weekly Reports, because it is presented.
- **Start from a template** (Weekly Competitor Pulse, Monthly review, Campaign tracker, Creator scouting, Competitor deep-dive, Blank): pick the brands to watch (or the one or two a deep-dive is about; the Paragon watchlist is one click), a client if the deck is prepared for one (optional: without one the moves are for the team and there is no portfolio appendix), week on week or month on month, TikTok and/or Instagram, and the slides from the library. Creating makes the first version (about a minute: the numbers, the words, both files). Edit changes the next version; versions already made stay as they were.
- **The slide library** (`src/competitor/slides.ts`): summary (always first), findings from Chats, scoreboard, **trend** (each brand's views over the last periods with SOV, one slide per platform), movers, what's driving it, **top creators** (ranked on each platform, never across platforms; first-timers and very low engagement marked), **top content** (three per platform, cited as evidence), creator tiers, products, posting pattern, close-ups (a deck's close-ups take its biggest brands, movers included), patterns, the moves (three to five, prioritised), the client's brands, evidence. Slides print in library order. The words follow the same rule as the weekly report: only numbers from the facts, checked; a deck's prompt and tool ask only for the slides it carries.
- **Month on month** runs the weekly report's facts by calendar month: each brand judged against its own last three months (TikTok in the panel starts in April 2026), two of them with posts, size floors of 100 posts or 4M views. Every period word on a slide comes from one place ("this month", "3-month range", "MoM").
- **From Chats**: "Turn into a deck" under an answer keeps every analysis CeMO ran in the conversation as a **finding** (the skill and its settings, and the question that led to it), next to a scoreboard, the trend and the moves for the brands the conversation named (else the panel's biggest). In the evidence pane, "+ Add to a deck" pins one analysis into a deck or starts one. Each version runs the findings again over its period; the slide prints the skill's rows (names, then views, posts, creators, ER), and the model writes its title and takeaway from those rows.
- **From the Dashboard**: "+ Add to a deck" on a section adds the matching slide (rankings → scoreboard, mentions → trend, tiers, creators, content) to a deck, or opens a new deck with that slide, the brands and the grain on screen.
- **Versions and recurring**: a deck holds one version per period (making one again replaces it). "New version" picks any week or month the data fully covers. "Make every week / month" makes the next version when a new period of data lands (`/api/cron/decks` every 15 minutes, two decks per call; a deck that already has the latest period looks again the next day at 07:00 WIB). No email for decks.
- **Viewing**: a deck opens in the same viewer as Weekly Reports (actual slides, Ask AI per slide, PDF, PowerPoint, Present), with its versions as the switcher. Ask AI on a deck's slide is told the deck's period (week or month).
- **Pulse is folded into Decks for teams with a brand panel**: `/pulse` redirects to Decks, which lists the boards made before (they still open). Creator Scouting (Skintific, TikTok, by month) and Hanasui Deepdive (Hanasui, both platforms, by week) were converted into recurring decks with the slides that show the same views (`scripts/pulses-to-decks.ts`). A PR team keeps Pulse and Reports as they were (a deck needs a brand panel).
- Storage: `decks` (workspace, spec, recurring, next run, last period, last error) and `reports.deck_id` (migration 0014); a deck's versions are reports with `source = 'deck'`, kept out of the Reports list. Deleting a deck deletes its versions and their files.

## Caption reading (Refal, 2 Oct 2026)
- **The model reads captions** in category workspaces so decks can say what brands are running, not only how much: for each post, the **product** it is about (the line's name without the brand), the **campaign or event** (launch, relaunch, sale event, collab, giveaway, offline event, seasonal, challenge, or none, with a short shared name such as "Colorfit Skintint launch" or "9.9 sale"), the **offer** (discount, bundle, free gift, voucher, flash sale, live shopping, cashback, giveaway, none), the **hook** (review, tutorial, routine, before/after, comparison, problem → solution, haul, trend, reply, hard sell, lifestyle, other) and the **angle** (the specific idea in at most six words: "blush blindness look", "PDRN Korean skincare trend"). Prompt and answer check in `src/captions/prompt.ts`.
- **The model names; SQL counts.** The tags sit on `posts` (`cap_*`, migration 0015). Every number on a slide built from them is a count of posts, creators and views over the tags, with the same check on the words.
- **Which posts:** those that matter to a deck: views at or over the workspace's floor (10K by default) or posted by a brand account, newest first, one read per url (an Instagram post tagging two brands is read once). About 30K posts in the beauty panel today. Same retry rule as sentiment: a post a batch came back without is tried once more, then left alone.
- **Cost and switch:** `/api/cron/captions` every 10 minutes, about 1,000 posts a tick, on the chat model unless `ANTHROPIC_MODEL_CAPTIONS` names another. Reading the beauty backlog is estimated at about USD 30 at the chat model's price, then a little each week as data arrives. It runs only where the workspace switched it on (`settings.captions.enabled`; the owner's switch is on the Data page, which also shows how far it got). On for the beauty panel. **June onwards only (Refal, 1 Oct 2026):** `settings.captions.since` (a date, WIB) limits reading to posts from that day; the owner sets it on the Data page, empty means all. The beauty panel reads from 1 Jun 2026: about 6,700 posts left after the first 2,240, about USD 9. After each run, every spelling of an event or product name (ignoring case and spaces) takes the workspace's most common one (`tidyNames`), so Chats groups "Payday Sale" and "payday sale" as one.
- **Two slides read from captions** join the deck library (`src/competitor/captions.ts` facts, `libraryDeck.ts` layout): **Campaigns and launches** (each brand's launches, sale events, collabs and events by name, with posts, creators, views, when it was first seen and whether it is new this period, the top post, and the share of each brand's posts that carry an offer) and **Products and angles** (the products named in two or more posts, the hook that brought most of their views, the angle of the best post, the offer share). Each slide prints how much of the period was read. They are in the Weekly Competitor Pulse (decks), Monthly review, Campaign tracker, Creator scouting (angles) and Competitor deep-dive templates. **Since 2 Oct 2026 (Refal) the Weekly Competitor Pulse · Paragon carries them too**, after the drivers (`WEEKLY_V3` in `slides.ts`), each only when the captions read name something, so a week with none keeps the old set; the classic writer gets their fact-sheet section, fields and plain words.
- **CeMO can use the tags in Chats**: the query builder groups and filters by caption product, event type, event name, offer and hook (`caption_*`, posts not read yet show as "not read", with a caveat).

## Claude Sonnet 5.5 (Refal, 2 Oct 2026)
- **Chats, the writers, labelling and caption reading run on `claude-sonnet-5-5`** (`ANTHROPIC_MODEL_CHAT`, default `claude-sonnet-5-5`; same price as Sonnet 5). Set the variable on Vercel to `claude-sonnet-5-5`, or delete it to take the default.
- **No forced tool choice.** Sonnet 5.5 rejects `tool_choice` `tool`/`any`, so the four calls that forced one (comment and stance labelling, caption reading, "Turn into a report") ask on `auto`: `toolAnswer` (`src/chat/client.ts`) names the tool in the last user message and nudges once when a reply skips it, keeping the history append-only. Answers are still checked by the same parsers.
- **Room for thinking.** Sonnet 5.5 always thinks a little and thinking counts toward `max_tokens`: chat 16,000, the deck writer 16,000, captions 10,000, labelling 8,000, the other writers 4,000–6,000. Effort stays as it was (chat medium, background jobs low).
- **Refusals** (`stop_reason: "refusal"`) already end a chat turn with a plain sentence; a background batch that is refused is retried once and then marked failed, like any batch without an answer. No server-side fallback: it only retries cyber and frontier-LLM declines, which this product does not meet.


## Fintech, the first listening workspace (Refal, 3 Oct 2026)
- **The complete listening schema is the template for every workspace.** Fair Listening's full product fetches keyword contents and the brands' own accounts every day, tracks each content for up to 30 days, fetches its comments and labels each one (five-point sentiment with CSAT, theme, purchase intent, the workspace's own topics). Topics are set per workspace at onboarding. Beauty keeps its extra columns (product category, content format, cart) because affiliates matter there; other workspaces do without them. Beauty moves onto the same comment and topic layer later.
- **Fintech Indonesia** (`fintech-id`, category, client GoPay) is loaded from a database dump (`etl/load_listening.py`, contract `etl/listening/fintech-id.json`); a daily read-only sync replaces the dump later. Seven brands: the listening "brands" are per-platform handles and group into GoPay (with GoPay Merchant and GoPay Games), ShopeePay, Shopee, DANA, OVO, SeaBank and BCA (with goodlifebca and blu by BCA).
- **Owned vs earned on every platform** in listening workspaces: a post is owned when its author is one of its brand's handles. A comment by one of the post's brand handles is the brand's reply and is never counted (`sentiment_source = 'subject'`).
- **Sentiment arrives labelled** (`sentiment_source = 'listening'`; `/api/cron/label` leaves it alone). The five-point label and CSAT are kept (`comments.sentiment_detail`, `csat`); the three-class view counts excellent and good as positive, neutral as neutral, average (CSAT 2) and negative as negative; unknown is unlabelled. Themes, purchase intent and translations ride along; topics land in `topics` (`<workspace>:<slug>`).
- **Not loaded:** the daily sentiment roll-up (recomputed from comments), media, audio and tagged users, and the beauty columns, which hold stray beauty values in this dump.

## Roles on workspaces; PR first (Refal, 3 Oct 2026)
- **A workspace is the data; a role is how the product behaves on it.** Role models (`src/roles/model.ts`) are owned by the product team and versioned: each decides the sidebar, the first screen, the deck templates, how CeMO thinks and what it drafts, the order of the composer's menu, and the alert rule. Every role has the same three features (Dashboard, Decks, Chats). A workspace offers one or more roles (`settings.roles`; default by kind: a profile is PR, a panel is Brand & KOL); Fintech offers PR and Brand & KOL. Teams are workspace × role: chosen at sign-in, switched in the sidebar (a workspace picker, then role tabs; the role lives in the `fi_role` cookie, checked against what the workspace offers). Later the CMS edits the workspace side, and what people do inside a role (decks kept, questions asked, alerts tuned) feeds the next version of the role model. Order: PR, then Brand & KOL, then Social Media (own accounts, tracked daily).
- **Posts that do not name their brand never count** (`posts.relevant`, migration 0017). Listening workspaces judge it at load: the brand posted it, tags one of its accounts, or the caption names it (contract `terms` per brand, at the start of a word; a term in capitals matches only in capitals, as "DANA", because lowercase dana is the word for funds). Fintech: 3,548 of 13,275 posts (half of Threads), 43,597 comments. They stay stored; comment analyses, the metrics builder and every reputation number leave them out. Null (beauty, profiles) counts.
- **The PR dashboard** (`src/reputation/dashboard.ts`, `src/ui/reputation/`), standard for every PR team: the status ladder (calm, watch, issue, crisis, recovering: a day's negative share of comments about the brand against its 28-day norm; issue at 2×, crisis at 3× with 50+ negative, watch at 1.5×, 50 comments minimum; recovering within 7 days of an issue), the headline numbers against the window before, issues building by topic with "only us" (our negative share on it 1.5× the other brands') or "whole category" (theirs the same or worse, or rising), rising posts with likely final views from the tracking curve, amplifiers, narratives, own channels against the other brands' own posts, a customer-service list (negative comments whose theme is a payment, refund, account, transfer or the app), competitive reputation, and data health. Windows end on the last settled day (a day with at least half the usual comments): comments keep arriving for a day or two. "Ask CeMO" and "Draft holding statement" open Chats with a question, never numbers. A one-person profile keeps its crisis view.
- **PR decks** (`src/reputation/deck.ts`, `store.ts`): Weekly Reputation Report, Monthly Reputation Review, Issue Post-mortem, from their own slide library (summary, status day by day, issues, issue deep-dives, narratives, competitive, amplifiers and own channels, customer service), for one brand with every other brand as the benchmark. Same machinery as the competitor decks (the PDF recorder, versions, Ask AI per slide); the model writes the words from a fact sheet and every number must be one the slides print, else the plain words. Each role's Decks list shows its own decks.
- **CeMO on PR** works as the comms advisor: reputation first, us or the category, drafts holding statements, Q&A and replies on request with anything to confirm in [brackets], sends service complaints to customer service, never advises engaging trolls. The first screen of Chats asks about reputation.

## Brand & KOL on listening workspaces (Refal, 3 Oct 2026)
- **Every platform the workspace holds.** The Brand & KOL dashboard, the competitor decks, Pulse cards and the ask links cover Threads and X (and YouTube) wherever a workspace holds them; "all platforms" means every platform the workspace holds, so the beauty panel stays TikTok and Instagram. A deck with no platforms picked covers all of them (decks from Chats too). The scoreboard takes two platforms a slide.
- **Owned vs earned where it is captured.** Own-account shares are read on the platforms where the workspace captures own accounts at all (TikTok in the beauty panel, every platform in listening workspaces); the close-ups and footnotes name those platforms.
- **The product lexicon is beauty's.** The "pushing" line of a close-up and the products slide read the beauty product categories (`src/config/categories.ts`) only in a beauty workspace (`workspaces.category` beauty or unset).
- **Posts that do not name their brand never count, everywhere**: the skills' shared filter (`Where.workspace`), the dashboard's scope, the competitor facts, landscape and caption slides, the brand page, Pulse cards and the materialized views all leave out `posts.relevant = false`.
- **The beauty export's caveats** (TikTok April gap, Instagram Q1 universe, carousel views, no snapshots, content_format gaps) describe that export; the skill runner drops them in listening workspaces.

## Social Media, the third role (Refal, 3 Oct 2026)
- **A role on the brand's own accounts** (`SOCIAL` in `src/roles/model.ts`): Dashboard, Decks, Chats like every role; CeMO works as the content lead (judges a post against its own account's usual, drafts captions, calendars and replies on request, hands complaints to customer service or PR). Fintech offers PR, Brand & KOL and Social Media.
- **The Social Media dashboard** (`src/social/dashboard.ts`, `src/ui/social/`), standard for every social team: posts, engagement, the typical post, typical video views, negative comments and reply rate against the window before (no deltas when the window before has fewer than five own posts); needs attention (a post of the last week under half of its account's usual for its age, read from the daily tracking curve, or 20+ negative comments); each account; formats (share of posts against share of engagement); when to post (day × time of day, WIB, cells with 3+ posts); best and weakest posts against their account's usual (accounts with 5+ measured posts); the competitors' own channels; the community under the posts (topics, purchase intent, the comments liked most); data health. Windows of 7, 30 or 90 days ending on the last settled day.
- **Engagement is the measure; views only where reported.** Instagram reports no views on photos and carousels. A post captured with no engagement and no views counts as published but stays out of every median and ranking (10 of GoPay's 227 in September).
- **Social decks** (`src/social/deck.ts`, `store.ts`): Monthly Content Review and Competitor Content Teardown (the same deck with a competitor in focus), same machinery and number check as the PR decks. Each role's Decks list shows its own decks (`spec.rep` PR, `spec.social` Social Media, the rest Brand & KOL).
- **Open data questions for the listening team:** follower counts are one capture per account, so audience growth waits for daily follower history; @gopayindonesia shows 57 to 65 Instagram "own" posts a day on 7 to 9 Sep (likely collaboration posts or a capture artefact; the dashboard flags any day with 20+), and no own Instagram posts are captured after 9 Sep.

## Roles as Fair's products; the CMS plan (Refal, 4 Oct 2026)
- **The CMS is Fair's brain and only Fair uses it** (plan: "Fair Intelligence CMS & Role Modelling Plan", v2, and `docs/CMS_Role_Modelling_Plan.pdf`). Refal and Rafli are the super admins and the only ones who release a role version, deploy, switch a workspace live or pin a client to a version. Audia, Wega and Arneta own all three roles together for now; Audia and Arneta may also change design. Data ops sets up workspaces and watches their health. Clients never open the CMS: their Builder shapes the company's version of each role inside the product, mostly through CeMO, and approves what Members make (`src/config/staff.ts`).
- **Each role is a versioned product with a codename:** PR is **Chorus**, Brand & KOL is **Atlas**, Social Media is **Spark**, versioned major.minor (a minor adds or fixes skills, templates, tiles or words; a major changes how the role behaves). CeMO stays the assistant's name on every role.
- **Three layers, resolved on every request** (`src/roles/policy.ts`, `store.ts`): Fair's release, the company's changes (only what the company changed, as dotted paths), the person's own settings. A field is locked unless the policy lists it; listed fields carry guard rails (an issue multiple from 1.5× to 4×, at least 20 comments a day). The resolver drops anything locked, out of range or naming an id the code no longer knows (`src/roles/registry.ts`). With the tables empty or `FI_ROLE_TABLES=off`, the constants in `src/roles/model.ts` are each role's 1.0.
- **Every client follows the latest release, and a release never touches what a client built:** their own deck templates (versioned by them), skills, reports, house rules and extensions stay as they are and their setting changes are re-applied on top. A role owner may roll a release back without approval; the first release cannot be. Pinning a client to a version stays possible, by Refal or Rafli.
- **A Member can create and use their own creation; it joins the company version only after the Builder approves.** Clients extend their data (custom fields, tables, metrics such as a Persona table) on top of the core tables, never by changing them; extensions and model work are paid in credits. Credit prices are placeholders; pricing is discussed once the build is done.
- **Phase 1 (this change):** `role_versions` (Fair's, no workspace: the product, like `mcp_clients`), `company_versions`, `personal_settings`, `audit_log` (workspace null for Fair's own roles), `model_events`, `model_calls` (migration 0018); Chorus, Atlas and Spark 1.0 seeded (`pnpm role seed`); every page, CeMO turn and deck run reads the resolved role; a company's house rules sit last in CeMO's prompt, under every fixed rule; the team picker shows the codename and version; every model call records its tokens by workspace and purpose (`anthropicClient(meter)`, the chat loop per turn). Until the CMS has screens, releases go through `pnpm role draft | release | rollback | pin | company`.

## People and the CMS shell (Refal, 4 Oct 2026; CMS plan phase 2)
- **One account per person, a membership per workspace.** `accounts` holds the email, the password and Fair duties (`staff`: owner, role_owner, designer, data_ops); a `users` row is now a membership (account × workspace) with a level per role (`levels`: builder or member). Everything a person makes still points at the membership, so nothing moved. Sign-in is by account and starts in its first membership; `pnpm db:migrate` turned the old per-workspace sign-ins into accounts (`migrateAccounts`, idempotent).
- **Who may do what is one function, `can()`** (`src/auth/can.ts`), used by pages, routes, the CMS and the connector. Fair staff reach every workspace and act as Builders there; a client reaches the workspaces it belongs to and, there, the roles its levels name. Only owners release, pin, set prices and change staff duties; role owners draft and roll back; designers change design; owners and data ops change a workspace's data settings (client brand, caption reading) and make or remove Builders; a Builder invites, changes and removes Members on the teams they are on; a Member uses the product.
- **Seeded duties:** Refal and Rafli owners; Audia (and design), Wega, Arneta (and design) role owners; Raissa and Yunni data ops (they were owners and reached every workspace). Fajar, Laily and Setyaratu stay Members of Indonesian beauty. Refal or Rafli change any of it in the CMS (People).
- **Invitations** (`src/auth/invites.ts`, `/invite/<token>`): a workspace and a level per role (or Fair duties), seven days, used once, the token stored hashed. Emailed through Resend when it is configured; the inviter can always copy the link. Someone who already has an account only gains the membership and signs in with their own password; the link never signs anyone into an existing account.
- **The Team page** (`/team`, the people icon in the account row) is where a client's Builder sees their people, invites Members and changes or removes them; Fair sees the same view per workspace in the CMS.
- **The CMS** (`/admin`, the grid icon in the account row) is Fair staff only, a plain 404 for anyone else, with its own sidebar: Home (each role's current version, what needs attention, the latest changes), Roles (versions, release and roll back), Workspaces (data, people, invitations), People (Fair staff and their duties, staff invitations, each workspace's Builders and Members), Audit (every change). Every change to a role, a company version or a person is written to `audit_log`.

## The Role Lab: recipes, test sets, proposals and staged releases (Refal, 4 Oct 2026; CMS plan phase 3)
- **Recipes are analyses written as data** (`src/recipes/`): a fixed query over the whitelisted builder plus the inputs a person may give (brand, window, platform, topic). The builder counts and returns evidence, so a recipe keeps every rule a skill keeps; it can never carry SQL. Fair's library lives in `recipes` (scope `fair`, one row per version; a released role's recipe is never edited in place: a change is a new key). A role version offers recipes through `recipes` in its spec (Fair only); CeMO sees them as one more tool, `run_recipe`, listing just the team's recipes; skills stay in skills.registry.json. First four: complaints by topic, sentiment by brand, negative share by day, own posts by week (`pnpm recipe seed | list | run`).
- **query_metrics counts comments too** (entity `comments`): by brand, platform, post source, topic, sentiment, day, week, month; counts, commenters, posts, negative and positive share, net sentiment, purchase intent. The brands' own replies and comments under posts that do not name their brand never count; shares are over labelled comments.
- **Every role has a test set** (`test_cases`, `src/roles/tests.ts`): guards on the spec (it resolves, its recipes exist and suit it, its deck templates exist, its thresholds keep their guard rails, its voice never asks CeMO to compute or name its tools), screens on test workspaces (the role's dashboard and every recipe run with something to show), and golden questions through the real chat loop with the draft spec (the expected analysis is used, nothing of the machinery leaks, every number is cited, at most one question back). Golden questions are skipped, not failed, where the model is not configured. Seeded: Chorus 18, Atlas 14, Spark 12, drafted from each role's suggested questions; role owners add more (and the Lab adds them as it works). Results land in `test_runs`; guards and screens of every current release run nightly (`/api/cron/tests`, 03:30 WIB).
- **A version goes draft → proposed → released**, all in the CMS (Roles → a version): a role owner starts the next minor version from the current release, edits it (the form, or the Role Lab's AI), runs its tests; a draft can be proposed only when every test ran since its last edit and none failed, with a release note. Only a proposed version can be released, by Refal or Rafli: to chosen workspaces first (`stage_workspaces`: they run it, every other client keeps the release before it) or to everyone; a staged release goes to everyone with one click. Role owners roll back.
- **The Role Lab's AI** (`src/roles/lab.ts`, on a draft's page) reads the draft, the role's signals (counts only) and Fair's recipes; edits the draft within the guard rails, writes new recipes (validated and tried on a test workspace before they are saved), adds golden questions, runs tests and writes the release note. It never proposes or releases, and says when something needs code. Its tokens are recorded under `role_lab`. Not verified against the live model yet (no key in the build sandbox).
- **Chorus 1.1 is proposed** (by the build, 4 Oct): it adds the three PR recipes and one suggested question; guards and screens pass on Fintech and Maudy, golden questions wait for the model. Refal or Rafli release it from CMS → Roles.

## Builders and Members: the team's own version (Refal, 4 Oct 2026; CMS plan phase 4)
- **What a client makes lives in one table, `creations`** (`src/company/creations.ts`): company skills (recipes over the query builder, the same rules as Fair's), deck templates, house rules, memory facts and vocabulary, each with its maker, approver and status (draft, waiting, approved, sent back, rejected, removed). A Builder's creation goes live when they add it; a Member's works for its maker straight away and reaches everyone only after a Builder approves it (sending back needs a note). Limits per team are in `src/config/company.ts`. The plan's `workspace_memory` table is folded into `creations` (kinds `rule`, `fact`, `term`), so every item has one history and one badge. A release never touches these rows.
- **CeMO makes things for the team when asked** (`src/company/tools.ts`): `make_skill` (drafted, checked and tried on the team's data, with evidence), `make_deck_template` (from one of Fair's templates, slides from the role's own library) and `remember_for_team` (rule, fact or word). Each shows as a card in the thread; the person adds it (a Builder) or sends it to the Builder (a Member). A correction about the data itself is not for these: CeMO says Fair's data team handles it.
- **Builder mode** is a switch in Chats that only a team's Builders see (and Fair's owners and data ops). With it on, CeMO knows what the team may change, its guard rails and its values now, and can propose a change with `change_team`; the card shows each field from → to and what was refused and why; the Builder presses Apply. CeMO never applies anything: every button goes through `/api/builder/*`, which checks the person's level and the guard rails again (`src/company/changes.ts`).
- **House rules, facts and vocabulary sit last in CeMO's prompt**, under every fixed rule, and never change a number. A rule that asks CeMO to compute or estimate, drop evidence, override the product's rules, decide what the data says, set a figure or speak as a real person is refused at save with the reason (`src/company/rules.ts`). Facts are context, never a source for a number.
- **New company settings:** the crisis level and the negative comments it needs (`alert.crisis_multiple`, 2× to 6× and at least 1.25× the issue level; `alert.crisis_min_negative`, 20 to 2000; unset keeps 1.5× the issue level with the comment floor), and the Dashboard's sections (`tiles.hidden` and `tiles.names` for the company, `tiles.order` for the company or each person). Section ids per role are in `src/dashboard/sections.ts`; the status and headline tiles stay on top; at least two sections stay shown; a hidden section is named in small text with Show.
- **Where Builders change things directly:** Customise on every Dashboard (hide, rename and move sections for everyone, or reorder just for yourself); "Why this level?" on the PR status (the rule in words, sliders, and the last 90 settled days replayed under the team's rule and the one tried, counted in SQL by `src/reputation/replay.ts`; a Builder applies it); "Save as template" on any deck (⋯ menu); the rules and memory panel on Our Chorus. Company deck templates follow Fair's under Decks → New deck, badged; a role's `deck_templates` now orders Fair's.
- **Our Chorus / Atlas / Spark** (`/company`, in the sidebar, with a count of what waits for a Builder): the Fair version the team sits on and what Fair's next version would change; what waits for approval (a skill tried on the team's data); every setting the team changed beside Fair's, with Back to Fair's; the team's skills, deck templates, rules and memory; your own not yet shared; the history with Undo (an undo reverts only the fields that change set touched) and Bring back; what was sent to Fair and Fair's answer.
- **Badges:** Fair for what came with the role, the client's name (maker on hover) for what the team made, in the composer's menu (which now lists the team's analyses first), Decks → New deck and Our Chorus.
- **Suggest to Fair and Client creations:** a Builder sends a live creation or a changed setting to Fair with a line of why (`fair_suggestions`). The CMS's Client creations page lists every client's creations and the suggestions; a role owner marks one seen, adopted or not now with a note the Builder sees. Bringing a pattern into Fair's role is a Role Lab draft, never an edit of the client's item.
- **Checked on fintech-id with a test Builder and Member (removed afterwards):** every GoPay example change except the Persona table (phase 5) went through the same tools CeMO calls and the same buttons: crisis at 4× with 100 negative, Amplifiers hidden and customer service first, the OJK and "GoPay, never Gojek" rules, "isu" for issue, the Board monthly template, a Member's complaints-by-topic skill approved by the Builder and listed under Client creations. Members could not apply, approve, undo or suggest. Not checked with the live model (no key in the build sandbox): CeMO choosing these tools from a typed request.

## Extensions and credits (Refal, 5 Oct 2026; CMS plan phase 5)
- **A client adds its own data on top of the core, never into it** (`src/extensions/`). An extension is a field on creators, posts or comments with the values it may take, each with what it means and how to recognise it (a Persona table: Mom, Student, Office worker…). Definitions live in `ext_defs`, values in `ext_values` (one per extension and core row, by id; value null = read and nothing fits), one workspace only, deleted with the extension. The core tables never change; the model never writes SQL: rule words reach the database as escaped whole-word patterns, and the query builder joins values by id from the definition.
- **Three sources:** keyword rules counted in SQL over every row in scope (free; recomputed daily), a file a Builder uploads (creator handle or post link, and a value), or CeMO reading each row and naming one value or none (`extension` in `model_calls`; 0.5 credits a row). An extension rides on a creation (`kind = 'extension'`), so it has a maker, an approver, a badge and the same approval as any creation; the definition is kept on the creation so a removed one can be brought back.
- **Sample, then estimate, then approve:** CeMO drafts the definition when asked (`make_extension`, any team member), tries it (a rule over every row for free; CeMO on 50 random rows, which are kept and not read again) and shows a card with counts, examples and the cost: credits to fill now, and a day after for new rows. A Builder's "Approve and fill" queues the fill (a Member's goes to the Builder first); approval is refused when the month cannot cover the estimate, where billing is on.
- **Jobs without pg-boss:** `cms_jobs` and `/api/cron/jobs` (every 5 minutes): one job slice at a time with `locked_until`, 200 rows a slice for CeMO, progress saved between slices; at the cap a fill waits and retries hourly. Live extensions stay current there: rules once a day, CeMO reading the rows that arrived since.
- **Extensions everywhere a dimension goes:** the query builder takes `ext_<key>` as a group-by and a filter on posts and comments (creator and post extensions on both, comment extensions on comments); a row not read yet is "not tagged", read with nothing fitting is "none"; every result says the data is the team's own and how much of it is read. CeMO's tools list the workspace's live extensions; company skills (recipes) may group by them; decks run the team's skills as findings (`recipe:<key>`, picked under "Your team's analyses" in the deck form or carried over by Turn into a deck).
- **Credits** (`src/credits/ledger.ts`, prices in `src/config/credits.ts`, all placeholders until a month of measured cost): a question 1, a Builder-mode turn 3, something CeMO makes for the team 3, a deck version written by the model 5, an extension read by CeMO 0.5 a row; dashboards, filters, settings, approvals and exports 0. Every credit lands in `credit_ledger` with who and what; Fair staff working in a client's workspace are recorded at 0.
- **Pools, caps and alerts:** each workspace has a monthly pool (3,000 by default) plus that month's top-ups; a Builder may set a lower monthly cap; the client's own Builders get one email a month past 80% (Fair staff are not emailed). **Nothing stops until Fair turns billing on for a workspace** (`settings.credits.enforce`, CMS → Credits, Refal or Rafli): the CMS records cost without charging until pricing is decided. With billing on, at the limit CeMO, CeMO's drafts, deck versions and extension fills stop with a plain sentence; dashboards and everything without the model keep working.
- **Who sees what:** Builders see Credits (`/credits`, from Our Atlas/Chorus/Spark): this month against the pool and cap, use by person, kind and day, the price list, and their cap. The CMS's Credits page shows every workspace's pool, use, top-ups and billing; Refal and Rafli also see Fair's real model cost from `model_calls` against the credits' value (placeholder $0.02 a credit), set pools, top up and turn billing on (`can(…, "billing.manage")`).
- **Checked on beauty-id with a test Builder and Member (removed afterwards):** the Builder drafted a rule Persona through the same tool CeMO calls (sampled over all 71,163 creators in about 5 seconds), approved it, the job filled it; a Member's "Views by persona" skill grouped by it, was approved and ran as a finding in a deck version (June 2026, five persona rows). The CeMO-reading path ran with a stand-in tagger (no model in the build sandbox): the 50-row sample, an estimate of 735 credits that matched the fill to the credit, eight slices, the ledger, and with billing on a cap that stopped a deck version while the dashboard still loaded. Not checked with the live model: CeMO choosing the tool from a typed request, and its reading of real rows.

## Workspace onboarding (Refal, 5 Oct 2026; CMS plan phase 6)
- **A workspace has a lifecycle** (`workspaces.status`): draft → loading → review → live, then paused or archived. Clients reach only live workspaces: a client whose every workspace is paused or not yet live cannot sign in ("Your workspace is not open right now"), is signed out within 30 seconds of a pause (`src/auth/live.ts`), and never falls back to another workspace; the MCP connector follows the same rule. Paused workspaces get no scheduled agents or recurring decks; their data is kept. Fair's data ops do every step up to review; **only Refal or Rafli switch a workspace live**, from review or paused (`role.release`).
- **Data ops onboard a listening client from the CMS without an engineer** (`/admin/workspaces/new`, then the workspace's data page): create (id, name, roles), upload the dump (private Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, straight from the browser; otherwise a local folder, `ONBOARD_DIR`, one file per request), inspect (rows, columns not read or missing, platforms, span, the last days, every account with its posts, suggested brands grouped by family name, the dump's sentiment labels), map accounts to brands with their terms and never-phrases and pick the client brand, map labels to the three classes, load, read the load report and health, then ask Refal or Rafli to switch it live. The load refuses to start while a needed file, brand or label is missing.
- **The contract lives in the database, not a JSON file:** `brand_handles` (which account belongs to which brand, per platform or all), `brand_terms` (terms that name the brand; `never` phrases taken out first), `data_sources` (files, sentiment map, inspect report, last load), topic definitions and tags on `topics`. `pnpm onboard export <ws>` writes the old contract shape; `pnpm onboard import` reads one. `etl/listening/*.json` is now an export, and the Python listening loader (`etl/load_listening.py`) is superseded by `src/onboard/` (the profile loader and the beauty ETL are unchanged).
- **The loader is TypeScript and runs in slices** (`src/onboard/listening.ts`, `load.ts`; jobs `dump_inspect`, `dump_load`, `relevance_apply` in `cms_jobs`, picked up by `/api/cron/jobs` or by the page's Run button): prepare (topics, brands, creators) → posts → snapshots → comments → finish (views refreshed, report, health), each slice inside a function's time limit with its progress saved. Same rules as the Python loader: posts keyed by platform and url, duplicate captures merged, naive timestamps read as UTC, brand replies kept and never counted, comments labelled from the dump, `posts.tagged_handles` kept for relevance.
- **Relevance is edited, previewed and applied per brand** (`src/onboard/terms.ts`, the data page's Relevance tab): as terms change the page shows, by platform, how many of the brand's posts count now and would count, and the posts that would flip each way with their views; apply rewrites only the posts that change, refreshes the views and keeps the before and after in the audit log. The rule is `src/onboard/relevance.ts` (owned, tags a brand account, or the caption names the brand; a term at the start of a word, any case; a term in capitals only in capitals as a whole word).
- **Health** (`src/onboard/health.ts`; nightly `/api/cron/health` and Check now): freshness per platform (information for a dump, a warning or failure when a sync stops), posts a day over the last 35 days (bursts and gaps), the share not about its brand, topics (a catch-all over 30%, a topic under 30 comments in the last month), unlabelled comments, follower history, metrics coverage, own accounts that stop or burst, failed jobs. A check that fails twice in a row suggests a note; **notes are what CeMO reads about the data** (`settings.notes`, put in the system prompt) and are added or edited only by data ops on the Health tab.
- **Checked:** Fintech was rebuilt from its CMS state with the same counts (13,275 posts, 3,548 not about their brand, 467 own, 114,633 snapshots, 116,366 comments, 237 brand replies, 9,087 creators, 8 topics; no post differs), then reloaded in place by the TypeScript loader in 49 seconds with every count unchanged. A second client, a test copy of the same dump (`listening-demo`, removed afterwards), was onboarded as data ops through the API the pages call: inspect in 8 seconds, two suggested brands corrected by hand (Shopee and ShopeePay, BCA's accounts), the load refused until brands and labels were mapped, then loaded in 47 seconds with every count equal to Fintech's; a relevance edit for GoPay previewed 4,271 → 4,294 posts and applied and reverted cleanly. Data ops' "switch live" was refused, Refal's went through; a test client could not sign in while it was in review, could once live (seeing only its own workspace, even with a forged workspace cookie), and was signed out when it was paused. Not checked here: uploads to Vercel Blob (no token in the sandbox; the local folder path was used).

## Learning: signals, insights and before-and-after (Refal, 5 Oct 2026; CMS plan phase 7)
- **Signals are whitelisted events** (`src/learning/kinds.ts`, written by `signal()` in `src/learning/signals.ts` to `model_events`). Each kind has a surface, a family (shaping or use) and the payload fields it may carry: ids, choices from a fixed list, small whole numbers, yes/no, and setting values that are numbers, flags or ids. Anything else is dropped before it is stored. A signal never carries the text of a question or answer, a comment, a post, a house rule's wording, a tile's custom name or a number from the data. A question travels as its coarse intent; a creation travels as its shape (`src/learning/vocab.ts`: a skill's entity, grouping and metric, with a client's own field shown only as `ext`; a template by the Fair template it came from; a house rule by its category; an extension by target and source); a team's own skill travels as its creation id. Each signal is stamped with the role version and company version the resolver gives, and Fair staff acting in a workspace are marked `by_staff` and left out of every roll-up.
- **Where they are recorded:**
  - **Shaping:** creations (made, sent, approved, sent back, rejected, removed, brought back), company setting changes and undos, Suggest to Fair.
  - **Chats:** each turn (where it started), each analysis with its layer and intent, clarifying questions, pane actions, exports, and "Turn into a report or deck".
  - **Dashboards:** visits and filter names, Ask why, and each section seen for 2 seconds or more (`SeenTile`).
  - **Decks:** how a deck was started, versions made by cron or by a person, versions opened, downloads, and Ask AI on a slide.
  - **Alerts:** alerts sent.
  - **From the browser:** only five kinds come through `/api/signal` (tile viewed, Show chart, answer copied, evidence pane opened, deck version opened), and the session decides the workspace and role.
- **Insights** (`src/learning/insights.ts`, nightly `/api/cron/insights`, or Roll up now on a role's learning page) are counts in SQL turned into template sentences in `model_insights`, never the model. They read only live workspaces that have not switched learning off, and only what clients did. **An insight is written only with at least three workspaces behind it** (`INSIGHT_FLOOR`, `src/config/learning.ts`). Five families:
  - **Settings:** a setting changed from Fair's value (with the median chosen), a tile hidden, a change undone.
  - **Analyses:** an analysis's share of all analyses and its place in the composer, teams' own skills, analyses by intent.
  - **Use:** Show chart, the evidence pane, clarifying questions, copies, Ask why, one-question conversations, tiles seen, scheduled decks opened, how decks start.
  - **What clients make:** by shape, plus Builders' approval rates.
  - **After a release:** before-and-after readings (next point).
- **`model_insights` has no `workspace_id`** (global like `role_versions`): it holds only counts across three or more workspaces and never names one.
- **A version records where it came from and what should move.** On the version page, role owners pick its origins (insights, client creations, Builders' suggestions) and its measures (`src/learning/measures.ts`: fixed rates, an analysis's share of analyses, a tile's views per Dashboard visit; suggested from what the version changes). They are stored as `role_versions.origins` and `measures`. Role owners can edit them on a draft or proposal; Refal or Rafli at any time. The release then says "Started from creations in three fintech workspaces": counts and a category, never a client's name.
- **Before and after** (`src/learning/outcomes.ts`) compares each workspace's 28 days before the version reached it (its first signal on the version, so staged releases are handled) with the 28 days after. Workspaces that took the version are compared with those that stayed on another one (pinned, or outside the stage). The reading is interim from day 14 and measured at day 28; a measured reading with three or more workspaces that took the version becomes an outcome insight.
- **`settings.learning = false`** is switched on a workspace's Signals tab by data ops, Refal or Rafli. It keeps the workspace's signals and creations out of every roll-up; they stay on that workspace's own page. The CMS role page (`/admin/roles/[role]`) shows Fair staff the insights, each release's before and after, what clients make by shape (with workspace names, one by one, for Fair only), signals by kind, and use by workspace. The Role Lab's AI reads the same insights.
- **Not built yet:**
  - **Draft signals:** a draft kept, edited or discarded.
  - **Alert follow-through:** an alert opened, "not an issue" pressed.
  - **Archive anonymising:** the plan's archive step should give a deleted workspace's signals an anonymous id, but there is no delete yet, so it is noted, not built.
- **Checked:** five test workspaces, all removed afterwards:
  - **Setup:**
    - Three teams made the same skill through the real creation flow.
    - A test release, Chorus 1.9, started from those three creations, was staged to them 35 days back.
    - A fourth team stayed on 1.0.
    - A fifth team had learning switched off and heavy use.
    - Fair staff added 40 analyses a day in one team.
  - **Results:**
    - The roll-up wrote 18 Chorus insights, each with three or more workspaces behind it, and left out the learning-off team and the staff events.
    - The reading was measured at day 35. In the three teams that took 1.9, the share of analyses running a team's own skill rose from 0% to 25% and analyses per workspace a week from 28 to 56; the team that stayed held at 0% and 28. Every count matched the synthetic data by hand.
    - The outcome insight read "…Started from creations in three fintech workspaces."
    - The browser endpoint dropped a copied answer's text, a kind the browser may not send and an extra field, and refused calls without a session.
    - Dashboards record each section seen, with their layout unchanged.

## Early-access listening pricing (Refal, 6 Oct 2026; to revisit)
Offered only to selected early clients, not yet a public product. Licences are yearly; prices in rupiah, PPN included.

| | Growth | Premium |
|---|---|---|
| Brands | 3 | 10 |
| Price per year | Rp 21M (Rp 7M a brand) | Rp 56M (10 × Rp 7M, less 20%) |
| Extra brand | Rp 6M a year | Rp 5M a year |

Both packages carry the same benefits:
- **Platforms:** Instagram, TikTok, Threads and X.
- **Own accounts:** each brand's own accounts on all four platforms.
- **Keywords:** Instagram all tagged posts, plus 3 keywords or hashtags per platform on TikTok, Threads and X.
- **Tracking:** content fetched daily and each post tracked for 7 days.
- **Comments and sentiment:** all comments, with sentiment on each.
- **Topics:** set up by Fair's team.
- **Brand swaps:** one per brand per quarter, as written.
- **Roles:** PR, Social Media, and Brand & KOL.
- **Users:** no seat limit.
- **CeMO credits:** included, with no number stated.
- **Connector:** the Claude/ChatGPT MCP connector, free.

Internal only, not in the offer:
- A volume cap on comments exists for later; early clients are not capped.
- Swaps are written as one per quarter but not enforced for early clients.
- How CeMO credits are sold is still open (the credit system supports pools and caps per workspace; nothing is enforced until `settings.credits.enforce`).
- Fair's cost per brand is not measured yet; read it in CMS → Credits once a month of model calls is recorded.

Market check, 6 Oct 2026, at Rp 17,900 per USD:
- **Local:** Netray Rp 24M a year for all channels with 4 keywords each.
- **Brand24:** from about Rp 43M a year.
- **YouScan:** about Rp 107M a year for 3 topics.
- **Talkwalker:** Rp 161M a year and up.
- **Brandwatch, Meltwater, Sprinklr:** Rp 170M to 900M a year and up.

Claude's recommendation was Rp 42M for Growth. Rp 21M is kept as early-access pricing and revisited before the product goes public.

## Kahf on Threads: case context, topics, voice and restricted workspaces (Refal, 7 Oct 2026)

A crisis workspace for one case: `kahf-threads` (profile, PR role, Threads only), set up while the case was live.

**Who sees it.** Only Refal and Raissa (Refal's call).
- `settings.restricted_to` lists the emails allowed in. A workspace with that list is hidden from every other account, Fair staff included. It is left out of their teams, the workspace switcher and the CMS lists, and `can()` refuses it.
- `loadActor` builds the list of hidden workspaces once per request (`actor.hidden`).
- No list (or an empty one) means the usual rules apply.

**What the labeller is told** (`settings.label`, read by `labelContext` in `src/label/run.ts`):
- `subject`, `about`, `context`: the case in plain words. Here that is the AFF meme, its deletion and the apology about eight hours later, as Refal described them from a screenshot.
- `languages`.
- Without `about`, the prompts are the same as before, so Maudy's labels do not move.

**Topics.** These are the workspace's `topics` rows, labelled per post and per comment (`topic_id`, `topic_confidence`):
- Boycott calls
- The original post
- The apology
- ParagonCorp and sister brands
- Others (the catch-all)

They come from reading the 582 posts. Refal agreed to four topics plus Others.

**Voice.** `settings.label.voices` (Malaysian, Indonesian; the model may also answer "unclear") goes into `posts.voice` and `comments.voice`.
- In this case, which side someone writes from matters as much as how they feel.
- The hint is the everyday words that differ between Malay and Indonesian.
- Query it with the `voice` dimension and filter (posts and comments).

**Off-topic posts.** With `post_off_topic`, the labeller may set a post aside as not about the subject or the case (`relevant = false`), as listening workspaces do at load.
- Threads replies rarely repeat the brand's name, so nothing is dropped by keyword at load.
- Pulse now keeps `relevant is not false` on every earned-post query.

**Sentiment** stays three classes (negative, neutral, positive) on comments and stance on earned posts. Kahf's own posts are never labelled.

**Holding posts until deploy.** Posts loaded before this labeller was deployed carry `stance_source = 'awaiting_context'`, so the old labeller leaves them alone and the new one picks them up.

**Pulse with posts only.** The dashboard now works before comments arrive:
- The headline follows posts.
- No root is claimed without comments.
- Kahf's own posts during the wave (the apology) are on the timeline.
- The copy names the subject instead of "her".

## Kahf on the Chorus dashboard; posts as voices; Pulse kept (Refal, 7 Oct 2026)

Refal asked for the Chorus (PR) dashboard and PR decks on `kahf-threads`, because its topics fit the case. Pulse stays.

**Moving a profile onto the reputation dashboard.** `settings.dashboard = "reputation"` on a profile workspace (`WorkspaceConfig.reputation`):
- `/dashboard` becomes the Chorus dashboard.
- The crisis view (Pulse, hour by hour) moves to `/pulse`.
- Decks open.
- The sidebar reads Dashboard, Pulse, Decks, Chats.
- Other profiles (Maudy) are unchanged until the setting is made.

**Posts count as voices.** In `src/reputation/dashboard.ts`, `VOICES` adds earned posts that the labeller gave a stance to the comments:
- A post stands in as its own comment: its stance is the sentiment, its topic the topic, its caption the quote.
- Around one subject the posts are the conversation, and the comments come later.
- Panels carry no stance on posts, so Fintech and Beauty read exactly as before. Fintech's fact sheet was checked word for word.
- Where posts count, the words say "posts and comments" (`voice_posts`).

**What a one-brand case changes:**
- **Status.** A norm needs seven earlier days that carried talk. A capture that starts with the crisis shows "No norm yet" instead of judging the crisis against itself and calling it calm. Days with no norm are grey on the strip.
- **Reach.** "Not reported" where no post has views (Threads).
- **Ranking.** Rising now and the amplifiers rank by likes when views are missing, and show each post's own stance.
- **CSAT and purchase intent.** Blank where nothing is scored, not 0.
- **Hidden sections.** The scope chips and the competitive section are hidden with one brand. The customer-service section is hidden where comments carry no themes.
- **Decks.** The competitor and service slides are dropped the same way.
- **Issue stage.** It is read only on days the data has reached, so a week that runs past today is not "fading".

**Pulse, improved and kept:**
- Posts and comments per hour stay.
- New **Who is talking** card: voice by stance, with the comments' negative share once comments are loaded.
- New **What it is about** card: the workspace's topics by stance.
- Daily charts cut days in the workspace's time zone, not UTC.
- Copy left over from the Maudy case is now generic (the YouTube caveat only where there is YouTube).
- The busiest-hour line only appears when comments exist.

## Kahf dashboard and decks for the case (Refal, 7 Oct 2026)

**What a workspace can leave out.** `settings.pr.hide` lists what the PR dashboard and its decks leave out for one workspace: `status` (the norm and the ladder), `reach`, `csat`, `intent`. Fair sets it per workspace. Kahf hides all four:
- The norm needs weeks of ordinary days before a story, which a case capture never has.
- Threads gives no views.
- CSAT and purchase intent do not apply to a boycott.

**Posts and comments apart.** Where posts carry a stance (`voice_posts > 0`), the dashboard and its decks never merge posts and comments into one number:
- **Tiles:** Posts about the subject, Posts against, Comments, Comments negative.
- **Conversation bar:** in place of the status card when status is hidden, two stacked bars, posts by stance and comments by sentiment, with what is still unread.
- **Issues:** each one shows a small table, posts and comments, each with its total, negative and positive (`Issue.split`).
- **Narratives:** posts, against, comments, negative per topic.
- Panels have no stanced posts and read as before; Fintech's deck fact sheet is unchanged word for word.

**Who is talking.** A new PR dashboard section (`voices`): voice by stance and sentiment, posts and comments apart. It shows only where the labeller reads a voice. In decks it sits under the narratives.

**Off-topic comments** are left out of the reputation facts (`not c.off_topic`), as Pulse already did. Listening comments carry no such flag.

**Decks on chosen dates.** PR decks can be made for days picked by hand (`YYYY-MM-DD..YYYY-MM-DD`, at most 92 days, `rangePeriod` in `src/competitor/period.ts`):
- The comparison is the same number of days right before (`previousPeriod`).
- "Choose dates…" sits in the period picker of a PR deck (`PeriodPick`).
- A range never moves a recurring deck's schedule.
- Brand & KOL and Social decks keep weeks and months.
- With no status, the summary slide shows how posts and comments lean instead, and the status slide is dropped.

**Daily PR decks (Refal, 7 Oct 2026).**
- "Day on day" is a third comparison for PR decks: one day against the day before (`DeckGrain = Grain | "day"`, `dayPeriod`, key `YYYY-MM-DD`). Brand & KOL and Social decks keep weeks and months; the dashboard's periods are untouched.
- Picking a day: the list runs newest first, the newest marked "(so far)" while the data may still be filling it. Below the last 14 days, "Pick a day…" opens a calendar for any one day the data covers (first post to latest; `dataSpan`), on the new-deck form, the first-version card and "New version"; "Choose dates…" stays for a run of days. A day before the data starts is refused with a plain message.
- Repeating: a daily deck runs each morning at 07:00 WIB for the day before, once the data has moved past it. A day already made is skipped, so a "(so far)" version is redone by hand ("New version" → the day → replace).
- A PR template's name follows the comparison ("Daily Reputation Report").

## Crisis slides and the Crisis Report template (Refal, 7 Oct 2026)

Refal's team wanted more reports in a case deck. Six slides join the PR deck library. Each is counted in SQL over the deck's period, in the workspace's time zone (`src/reputation/case.ts`), and drawn in `src/reputation/deck.ts`:
- **How it spread (chronology):** dated steps. The first post with a stance in the period, the first boycott call, when each partner brand was first named, the subject's own posts, the first hour a side carried more than half of the talk, the busiest hour, and the biggest posts. Eleven fit a slide; the fact sheet keeps up to fourteen.
- **Posts and comments per hour:** per day when the period runs past three days. Posts split by against and the rest; comments by negative, other and not read yet.
- **Who is talking, over time:** posts and comments per bin by the labeller's voice, with each side's total, negative share and busiest bin. Dropped where no voice is read.
- **Sister brands and boycott calls:** the workspace's partner brands (`settings.commercial`) named in posts and comments, their negative share and when each was first named, plus the boycott words with the top posts. Dropped where none are set.
- **Where the anger is:** comments under the subject's own posts against everywhere else, and each own post's reception.
- **Most commented posts, still moving:** the eight most commented posts and what they took in the last 24 and 6 hours up to the newest comment.

**Issues building** shows up to four issues (it showed three), so a fourth such as the sister brands is not cut.

**Crisis Report** is a new PR template: day on day, repeating, with summary, chronology, pace, motion, issues, exposure, narratives, anger, moving and voices.

**Chorus 1.2** is 1.1 plus that template on the role's list. Refal asked for the template; it was released staged to `fintech-id` (which already ran 1.1) and `kahf-threads`. The other PR workspaces stay on their version until it goes to everyone.

## Teams build their own (Refal, 7 Oct 2026)

Clients pay for CeMO with their credits, so every team can change how the product works for them: decks at any grain, their slides, templates, their own analyses and their own words, in every role (Chorus, Atlas, Spark). Fair learns from what teams build and adopts the good ones. What stays fixed: numbers are counted in SQL (CeMO drafts and names, never computes); no invented data; the core data is never edited; a team's work stays in its workspace (Fair adopts shapes, never data); a Builder's change goes live, a Member's waits for a Builder.

**One change engine for a deck** (`src/decks/changes.ts`): add or drop the role's slides, add or drop the team's analyses as slides (each after a named slide, or at the end), switch day (PR only), week or month, rename, turn the schedule on or off. Preview first (+ added, − dropped, = kept, → set), then apply (`POST /api/decks/[id]/change`). The deck changes for anyone on the team (as Edit does). With `template`, the template it came from changes too: a Builder revises a team template in place (`reviseCreation`, old spec in the audit log) or turns a Fair template into the team's own copy (the deck then points at it); a Member's template change is a creation that waits for a Builder and, once approved, replaces the live one (`spec.replaces`). It is reached from three places:
- **Chats:** CeMO's `change_deck` tool (it knows the team's decks, slides and analyses) shows a card: a Builder gets "This deck + the template" and "This deck only"; a Member gets "Apply to this deck" and "Deck + send template to my Builder". Drafting a change costs 3 credits.
- **Edit:** "Also change the template this deck came from".
- **Slide comments** (below).

**The team's own slides in every deck.** A finding (an analysis: a recipe or a skill pinned from Chats) now draws in PR and Social decks too, not only Brand & KOL (`src/decks/teamSlide.ts`): bars over time when the rows run by day, week or month (split by a second group, negative at the bottom); a split bar for one whole; bars for a short ranked list; a table otherwise. Its title line names the peak or the biggest part, computed from the rows; the rows go on the fact sheet for Ask AI. `FindingSpec` gained `after` and `by`; `cleanFindings` keeps them on PR and Social specs (the Edit page no longer drops them).

**Describe your own slide** (`src/decks/slideDraft.ts`, `POST /api/decks/slide-draft`): at the end of the slide list in New deck and Edit, a person writes what the slide should show; CeMO drafts one analysis over the query builder (comments or posts, metrics, group by, filters; never dates), it is validated (one retry with the errors), tried on the newest seven days and previewed. Kept, it is a team skill (live for a Builder, the maker's own until approved) and ticks into the deck. 3 credits a draft. A Member's own skill runs on their deck before approval (`companyRecipeByKey` reads drafts too).

**`mentions` filter** in the query builder: posts whose caption or comments whose text contain any of up to twelve words (`ILIKE`, wildcards stripped). It is how "comments mentioning halal" is counted; CeMO can use it in Chats too.

**Slide comments** (`slide_comments`, migration 0027; `src/decks/comments.ts`, `/api/decks/[id]/comments`). The deck viewer's side panel has two tabs, Ask AI and Comments; a slide with comments shows a pin on its thumbnail. Comments belong to the version (they go when it is replaced). A comment that mentions @CeMO gets a reply from the slide and the version's fact sheet: a sentence carrying a number the slide or sheet does not print is dropped. When the comment asks for a change, the reply carries a change card (the engine above); when it wants a slide nothing gives, CeMO drafts one and the card adds it (the analysis is saved when the change is applied). A reply costs 1 credit, a drafted change 3. Plain comments are free.

**Case words** (Our Chorus → Case words, PR; `src/company/caseWords.ts`, `/api/builder/case-words`; CeMO's `change_case_words` with a card): sister brands and boycott words with what each matches in the data before saving. A Builder adds and removes the team's own (marked with who added them); a Member sends one to their Builder ("Send to my Builder"), and it waits under Case words (`settings.commercial.pending`) with what it would match until a Builder adds it (in the Member's name) or declines it. Fair's entries stay. They are words counted in SQL, so free. A topic of the team's own is an extension (by words free; CeMO reading each comment priced first).

**Templates at any grain.** A team template can be day on day (PR) and carries the team's analyses as slides (`findings`); New deck picks them up with the template; Save as template keeps them.

**Fair adopts** (`src/company/adopt.ts`; CMS → Client creations → "Adopt into Chorus/Atlas/Spark"): a live team skill becomes one of Fair's recipes (`adopted-<key>`); a live team template becomes a data template on the role version (`template_defs`, offered beside the code's; the role tests accept it). Both go into the role's open draft (or a new one) for the usual tests and release; a Builder's matching suggestion is marked adopted. The client keeps theirs. A new draft (Adopt or the Role Lab's "New draft") copies the role's newest release, staged ones included, so Chorus 1.3 builds on 1.2 (with the Crisis Report) while 1.2 is out to a few teams only.

**Learning:** `deck.changed`, `deck.slide_drafted`, `deck.comment`, `casewords.changed` (ids, counts and flags only, never the words).

## Ask CeMO from the Pulse; a run of days in New deck (Refal, 8 Oct 2026)

**The Pulse asks CeMO.** A case's Pulse (`/pulse`, the hour-by-hour crisis view) had three "Ask why" links at the bottom that only filled the Chats box, so there was no visible way to ask CeMO from it. It now has an ask box under the headline numbers and "Ask CeMO" on every card. Both open Chats with a reference to the Pulse (`k: "pulse"`, `card`; `pulseAskHref` in `src/dashboard/askref.ts`), never its numbers. The server reads the figures again from `pulsePage` (`src/pulse/ask.ts`), shows them in a "From the Pulse" card above the question and tells CeMO they came from the Pulse. A question typed in the box is sent at once (`go=1`); a card's link fills in a question for that card and waits. Learning: `pulse.ask` (card, typed).

**A run of days in New deck.** The first-version picker of a day by day deck hid "Choose dates…" at the end of a list of single days. Every PR deck (day, week or month) now shows two buttons, "One day" and "Several days" (or "One week"/"One month" and "Chosen dates"). "Several days" starts at the last three days the data covers (6–8 Oct when the data runs to 8 Oct) and says how many days it covers. The deck page's "New version" uses the same picker. The picker no longer sits inside a `<label>`, which would pass a click on its text to the first button. A run of days makes the first version; a repeating deck then makes one day (or week, or month) each.

## Password links (Refal, 8 Oct 2026)

**What was missing.** An invitation asks a new person to choose a password, but someone whose email already had an account joins with the password they have, and nobody could reset a forgotten one (Laily's, 7 Oct). There was no way to set a password from the CMS and no "Forgot your password?".

**What we do.** Nobody types a password for someone else, so Fair never knows anyone's password. There are two ways to get a one-time link to set a new one (`password_links`, migration 0028; `src/auth/passwordLinks.ts`):
- **Fair makes one** from CMS → People → "Password link". It is shown to copy into a chat (WhatsApp) and emailed when email is set up. It works once, for 24 hours.
  - Refal or Rafli can make one for anyone.
  - Data ops can make one for a client account, when they look after every workspace it belongs to.
  - A Builder's /team page has no such button: a Builder could otherwise take over an account that reaches other workspaces. Builders send Members to "Forgot your password?".
- **The person asks for one** from the sign-in page ("Forgot your password?", `/reset`). It goes by email only and works for two hours. The answer is the same whether or not the email has an account, and there are at most three an hour.

A new link replaces any the account still had open. Setting the password spends the link and sets `accounts.password_set_at`; sessions signed before it stop passing the request gate (`iat` in the cookie, `stillActive`, 30 seconds' slack between clocks). The invite page points an existing account to "Forgot your password?" too. Audit: `password_link`, `password_link_requested`, `password_set`.

## Page speed: statistics, the Pulse's queries, functions next to the database (Refal, 8 Oct 2026)

**What was slow.** Opening Kahf took over a minute: the PR dashboard spent 79 s in the database and the Pulse 57 s. Beauty was slow too, though less.

**Why.** Three things, none of them the data's size; the whole database is under 1 GB.
- **Stale statistics.** Postgres re-reads a table's statistics after 10% of it changes. `posts` has 300K rows, so the 2,700 Kahf posts never triggered it. The planner believed Kahf had about 29 posts and chose plans that re-read every Kahf post once per post: 8 s a query, 47 queries.
- **Per-hour lookups on the Pulse.** Three Pulse queries counted each hour or each commenter with a lookup over the whole workspace, 300 to 20,000 times over: 29 s, 11 s and 3 s.
- **One query after another.** The Pulse ran its 70 queries in sequence.

**What we do.**
- Every load ends with `analyze posts, comments, creators` (`src/db/refresh.sql`, run by every loader and by the CMS onboarding).
- `posts` and `comments` re-read their statistics after 2% of rows change (migration 0029).
- The Pulse counts per hour once and joins (`src/pulse/page.ts`). Seeding carries a post's platform instead of looking it up per commenter (`src/skills/seeding.ts`); its sample comments now break ties the same way every time.
- The Pulse's independent parts run side by side.
- Comment queries skip posts set aside as off-topic through a small partial index (`posts_not_relevant_idx`, migration 0029), instead of reading all 541 MB of posts each time.
- Vercel functions run in `cle1` (Cleveland, `vercel.json`), the same AWS region as the Neon database (us-east-2, Ohio). Each page makes dozens of database round trips; from Singapore each one would cost about 200 ms.

**Measured** (from a sandbox about 60–500 ms from the database, so a page on Vercel is quicker):
- Kahf PR dashboard: 79 s → 3.5 s.
- Kahf Pulse: 57 s → about 5 s.
- Beauty dashboard: about 3 s.

The numbers are unchanged. The Pulse's output was compared field by field: only which sample comment shows among comments tied on likes differs.

**For new queries.** Never count per hour or per day with a subquery over the workspace; group once and join. Never write `(select … limit 1)` per row over a CTE.

**Later the same day.**
- **Switching team is one page load.** The sidebar and the team picker used to call `router.push` then `router.refresh`, which built the new team's page twice. They now do one full load.
- **Loading screens.** Dashboard, Pulse, Decks and Weekly Reports show a loading screen (`loading.tsx`, `src/ui/PageLoading.tsx`) while their numbers load, so a click never looks stuck.
- **Pulse totals.** The Pulse's headline totals read the comments table once instead of 16 times: same numbers, 3–4× faster.
- **`pnpm perf`** (`scripts/perf.ts`) builds every live workspace's pages as a visit would. For each page it reports the database time, the query count and the slowest queries. Each slow query is flagged when Postgres:
  - read a whole big table;
  - repeated a scan thousands of times;
  - sorted on disk;
  - guessed a workspace's size far off.

  A page over 2 seconds of database time is marked SLOW (`--strict` exits 1). Run it after touching a page's queries or after a big load.
- **The database compute.** Neon's autoscaling here tops out at 2 CU, and the compute drops to its smallest size when idle. The first heavy page after a quiet spell is about twice as slow (the beauty ranking query: 1.8 s cold, 1.0 s warm). A floor of 1 CU and a ceiling of 4 CU on the Launch plan keeps it warm.

**After a code review (/code-review) of the two speed PRs.**
- **Sign-in redirect.** `safeNext` (`src/workspace/teams.ts`) refuses a path containing a tab, a line break or a backslash, and anything that does not resolve to this site. Browsers drop the first two inside a URL and read a backslash as a slash, so `/login?next=/%09/evil.com` used to land on evil.com after sign-in. This predates the speed work.
- **Team switch.** A failed switch (offline, or a team not open to the account) frees the controls and says why. Back from the browser's cache mid-switch reloads the page, so it shows the team the cookie now names.
- **Status codes.** Decks and the Pulse lost their `loading.tsx`, because a loading screen around a whole segment turned a deck's 404 and a panel team's redirect into a 200. The Pulse now wraps only the crisis view in `Suspense`.
- **Pulse.**
  - The head's three reads run together.
  - The totals' platform count comes from the same two passes, and the posts join stays in the workspace.
  - The case-words card finds each matching post and comment once and counts per day with one grouping, instead of three lookups per day.
  - The comment analyses' newest-comment date (`commentWindow`) and the skills' context (`loadContext`) take `max(posted_at) at time zone tz`, which the index answers in a lookup. Before, `max(posted_at at time zone tz)` read every row, four times per Pulse. Results are the same on every workspace (all Asia/Jakarta).
  - The Pulse's database time fell from 8.6 s to 5.1 s, with the same numbers.
- **`pnpm perf`.**
  - It also times the sign-in and sidebar every page loads (`--as email`).
  - It counts a repeated query each time it ran, plus planning time, and keeps going when a page fails to build (FAIL; `--strict` exits 1).
  - It times live workspaces only (`--all` adds review), and skips role dashboards a crisis-only profile never shows.
  - It catches hash spills and parallel scans.

## The logo (Refal, 8 Oct 2026)

The app's mark is the one Refal supplied for the pitch, now Fair Intelligence's (the pitch deck and the video say Fair Intelligence too, with the lockup "fair / intelligence" set in Outfit SemiBold like the original): an orange-to-pink rounded square (#FF9047 to #FF516A) with five sound bars, the middle one peach. It replaces the blue-and-violet "F" square in seven places:
- the sidebar and the CMS;
- the sign-in, password and invitation pages;
- the connector consent page.

It is drawn as a vector (`src/ui/LogoMark.tsx`), traced from the supplied PNG; the two match to within one pixel along the edge. The browser tab icon is the same drawing (`app/icon.svg`), and the home-screen icon is a 180 px PNG (`app/apple-icon.png`). Both are public paths, so the sign-in page shows them.

The product's name stays "Fair Intelligence", and the rest of the app keeps its blue and violet.

## Data architecture V1 (Refal, 10 Oct 2026)

The agreed design is the doc "Core data architecture and model" (https://claude.ai/artifact/XCpZz9SB1HqZboBykahT4e). Refal set all 13 of its decisions to Agree on 10 Oct 2026. Where it conflicts with an older entry, it wins: for example, listening comments no longer keep the five-point scale or CSAT (3 Oct), and a post is read for 7 days, not 30.

**Architecture: one road for every source.** Sources → landing → staging → checks → core → enrichment → serving → screens.
- **Raw files** are kept exactly as received in private Vercel Blob, never in the repository. They are kept 12 months and deleted on request.
- **Staging** is its own area in the same database. Each load lands there first, mapped to our tables. It can be thrown away whole and is cleared 30 days after go-live. Nothing in staging is ever shown.
- **One loader, in TypeScript.** Each source has a small adapter that turns a file into rows; every source then takes the same steps. Python stays for one-off analysis.
- **Who starts a load.** A new workspace's setup and first load happen in the CMS. After that, loads start automatically whenever the scraper delivers.
- **Checks have two outcomes.**
  - A broken load is held with a report: rows missing against the file, duplicates, time zone, unknown handles, or too large a share set aside.
  - A warning, such as an account with 0 followers or a video with 0 views, does not stop the load. The row goes in flagged and stays out of rates and medians, and data ops and the scraper team are told.
  - Nobody reviews a daily load by hand. A person looks only when a load is held, and at a new workspace's first load.
- **Freshness.** Clients are told "updated daily" (weekly for some panels), never an hour. Every number shows its as-of date.
- **Scale.** Posts and readings are split by month from the start, since readings multiply rows.
- **Enrichment** comes from two places.
  - Ours, set up with the panel: sentiment, and topics from the client's list.
  - The client's, after onboarding: extras and cleanup rules. A cleanup never deletes and never changes the core. A standing cleanup shows what it would set aside and needs a Builder's approval.

**Model principles.**
- **One row per real thing**, keyed by platform plus the platform's own id. A post about three brands is one post with three links, each saying how we know: owned, tagged, keyword or mention, with its term, relevance, who checked it, and what brought it in (the panel or a case).
- **Readings keep their time.** Views, likes and followers are readings at a moment. The latest is copied onto the post for speed.
- **Judgments keep their author.** Every label says who made it (vendor, our model and its version, or a person) and when. A new labeller adds rows and never silently overwrites.
- **The core holds only what every source has.** Anything else is an extra (`ext_defs`/`ext_values`). An extra moves into the core once three or more sources have it.
- **Every number has one definition**, versioned, used the same way by every role, screen, chat and the connector. Roles choose definitions and defaults; they never redefine them.
- **Raw stays**, so any number can be rebuilt from its file.

**Decided.**
- **Views.** Default views are at day 7, with the latest beside them. A post is read for 7 days from posting; the scraper should stop there.
- **Copies.** Each panel keeps its own copies for now, keyed by platform id so sharing stays possible.
- **Sentiment** is three classes only: positive, neutral, negative. The vendor's "average" stays negative. CSAT and the five-point detail are dropped and remain only in the kept file.
- **Commenter handles** are kept inside Fair Intelligence only; no legal check needed.
- **Beauty** gets comments, sentiment and topics from Q4 2026 onwards. It is posts-only until then.
- **Share of views leads on brand panels**, with share of voice (posts) always beside it. Share of engagement uses likes + comments.
- **Commenters are never creators.** Only an account with a linked post is a creator.
- **Affiliator** is worked out per period (day, week or month), never stored. One cart post makes a creator an affiliator for that whole period.
- **Cases** are blended in storage and divided in counting. Posts only a case brought in count in that case, never in the panel's everyday totals, creators or tiers. Each case needs its own access list before any case moves out of its own workspace; until then Kahf stays its own workspace.
- **Client creations** are reviewed by Fair. Adopting one takes the definition, never the client's rows. Adopting a model-made field moves its running cost from the client's credits to Fair, so Fair estimates it per panel first.

**Refal's answers on 10 Oct.**
- Git history keeps the old raw files for now; Refal will change the repository's visibility later.
- Build now and integrate with the scraper later: the day-7 stop and the Fintech shape for Beauty and cases are the scraper team's side.
- Clients are not told about moving numbers at this point.
- Share of views leads.
- Access per case as above.

**Build order**, each step its own PR, checked with `pnpm test`, `pnpm smoke`, `pnpm perf` and a count before and after:

| Step | What changes |
|---|---|
| 0 | this entry |
| 1 | raw files to private Blob |
| 2 | one TypeScript loader with staging and checks |
| 3 | the core: links instead of a row per brand, readings, labels with their author, three-class sentiment, CSAT out |
| 4 | definitions and daily totals, which every screen reads |
| 5 | cases with an access list |

**Step 1: raw files to the store (10 Oct).**
- **The manifest.** `data/raw/MANIFEST.json` lists the 53 raw files, 64 MB in all: 3 Beauty exports, 15 Kahf files and 35 Maudy files. Each entry gives:
  - its workspace;
  - its place in the store (`raw/<workspace>/<file>`);
  - its size and SHA-256;
  - the day it arrived, from git.
- **The upload.** The files go to private Vercel Blob from Vercel's own production build, which already holds the store's token, so no token passes through a laptop or a chat.
  - `pnpm raw sync --build` is the first step of `pnpm build`, and `vercel.json` pins the build command.
  - The sync never fails the build. Each file's outcome goes to the `raw_files` table (`src/raw/files.ts`, migration 0030): stored, with the time it was confirmed, or why not and where. A file that is not stored stays where it was.
  - The first production build failed on the earlier version of the sync, which stopped the build when the store could not be reached. Its logs are only on Vercel, and this session cannot reach Vercel, which is why the outcome now goes to the database instead.
- **Out of the repository.** Then the repository stops tracking the files: `data/raw/*` is gitignored except this README and the manifest. Old commits still hold them; Refal decides later about the history and the repository's visibility.
- **Reading them back.** Loaders read a raw file through `readRaw` (`src/raw/store.ts`): the local copy if its hash matches, else the store.
- **Not stored yet.** The production build on 10 Oct recorded "No Blob store in this environment": the Vercel project has no Blob store connected. The CMS's dump upload needs the same store. Connecting a private Blob store to the project, in all environments, lets the next production build store the files.
- **Files never in the repository.** Fourteen raw files were never in the repository, and the only copies we know of sit in a Claude session's sandbox:
  - the Fintech dump: 13 tables, 110 MB, first loaded 3 Oct;
  - the converted Q3 Instagram file for Beauty: 29 MB, first loaded 6 Oct.

  They are listed in the manifest too, 67 files in all. The production build cannot store them, because they are not in its checkout. They go to the store with `pnpm raw sync`, run where the files and the store's token both are. `/data/raw/*` is gitignored, apart from the README and the manifest, so a raw file cannot be committed by accident.
- **Commands.**
  - `pnpm raw pull <workspace>` fetches files into `data/raw/`, checked against their hash, for the Python loaders or for analysis.
  - `pnpm raw check` shows where each file is, and what `raw_files` says.
  - `pnpm raw expired` lists files past their 12 months.
