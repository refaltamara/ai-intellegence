# CeMO — PRD v2: the partner experience

> **v2.1 amendments (9 Sep 2026, agreed with Refal).** The document below is the v2 addendum as written. Where the amendments here disagree with it, the amendments win.
>
> - **Name.** The product and the analyst persona are **CeMO** — "Your CMO", Creator Intelligence for Market Monitoring. "Fair Intel" is the internal codename only.
> - **Client brand** is settable now (owner-only control on the Data page, default none) and lives on the workspace; when Decisions ship it moves to the decision (`decisions.client_brand_id`), because Fair's team works for many clients.
> - **The daily brief** stays in the plan but is keyed to data loads ("since your last load") rather than the calendar, so it never claims freshness the static panel cannot support. It turns daily once the feed is continuous. Built in step 2 with the Today screen.
> - **Sounds** (§14.3 section 6, §14.4 `sound_*` columns, half of `/trending`) are deferred: the source export carries no sound field. Hashtags already exist (`/hashtags`, `/campaigns`, `/themes`, `/products`, `/hashtag-overlap`, shipped 3 Sep) and the `posts.hashtags` migration in §14.4 is already in place.
> - **No pg-boss** (CLAUDE.md rule 8). The brief job and large exports run on Vercel Cron / synchronous routes.
> - **No `strict: true`** on the new tools: strict mode rejects `minItems`/`maxItems`/`maxLength`. Ranges are enforced server-side, as for every existing tool.
> - **Follow-ups are not a tool call.** The model emits a trailing `<followups>[…]</followups>` block in the same response; the server parses, validates against available analyses, and strips it. Zero extra round trip. Each item carries `skill` and `params` so a tapped chip is deterministic.
> - **The mechanism-leak filter** strips slashed skill names only and counts everything else; it never blanket-bans "run" or "/".
> - **Pane actions never make the model compute.** The server recomputes the post-exclusion count and ranking and hands it to the model to narrate.
> - **Answer shape** stays lead + up to four bold-label bullets + optional closing line (Refal, 4 Sep); the v2 prose-only rule is dropped.
> - **A new thread never asks for a decision first.** It lands under "Untitled" and is named after the first answer.
> - **/discovery is folded into the pane**, not deleted: its filter controls become the table object's filter bar (step 3).
> - **Build order** (agreed): (1) partner behaviours with no layout change — hide the mechanism, activity lines, counter, follow-ups, `ask_user`, the CeMO prompt, client-brand setting, tighter typography; (2) Decisions with client-on-decision, brief keyed to loads, Today; (3) the evidence pane with discovery folded in, two-way actions, export; (4) brand pages minus sounds.
> - **Step 1 shipped 9 Sep 2026.** The Skills page and the /discovery screen remain reachable until step 3 absorbs them.
> - **Step 2 shipped 9 Sep 2026:** Decisions with client-on-decision, pins, the load-keyed brief with a daily cron.
> - **Step 3 shipped 9 Sep 2026:** the evidence pane (§2) with tabs, sort/filter/exclude, Refine (discovery's filters folded in, window/platform for the rest), chart range and series toggles, an editable agent draft, the three footer actions and CSV/Excel export with the About sheet (§13). Deltas after a pane action are computed by the server; pane actions are hidden user turns in `messages.content_json` (no `hidden` column). Pane ratio persists in the browser, not in `users`. The rail keeps Skills (amendment below). Brand pages (§14) are step 4.
> - **Amended after use (9 Sep):** Chats is the default at `/` and stays free-form and unattached; Decisions at `/decisions` carries the brief, the watchers' findings and the list ("what you want to see, to kick off your thinking"). Today is removed. Skills stays in the sidebar as the library; the no-skill-names rule applies inside conversations only. Result objects collapse behind a strip in the thread (the pane replaces this in step 3), charts need three or more points, caveats sit behind "About this data".

---

# Fair Intel — PRD Addendum v2: the partner experience

Companion to `PRD.md`. Where this document and `PRD.md` disagree, this document wins. Sections of `PRD.md` that are superseded are named explicitly in §11. Everything else in `PRD.md` (data model, skill engine, evidence rules, agents, reports, ETL) stands unchanged.

Mock: `fair-intel-prototype-v3.html` (Today screen + Decision workspace with evidence pane). Build against it.

---

## 0. What changes, in one paragraph

Skills stop being a user-facing concept. The registry, the engine, the tools, the evidence rules all stay — but the user never sees a skill name, a slash menu, or a "Running /discovery…" line. Instead the product behaves like a brainstorm partner that sits on the data: it opens the day by telling you what changed, it asks one question back before doing ambiguous work, it disagrees when the data disagrees with you, it narrates what it is doing in plain activity language, and it ends every answer with the two or three things it would ask next. The screen splits: conversation on the left, the evidence object on the right (a table, a chart, an agent draft, a report) — and that right pane is a workspace you can act on, not a preview. Conversations attach to a decision ("Ramadan launch"), not a date.

---

## 1. Principles (the model, the UI, and the copy are all tested against these)

1. **Hide the mechanism, never the evidence.** No skill names, tool names, or slash commands anywhere in the UI or in model output. Every number still carries an evidence chip. "Based on 1,284 posts" stays; "ran /discovery" goes.
2. **It talks first.** No screen ever opens on an empty text box. The first thing on screen is the model mid-thought about the workspace's data.
3. **One question back, then go.** For an ambiguous request the model asks exactly one clarifying question with tappable options, then executes. Never two questions. Never a question when the request is unambiguous.
4. **It disagrees on evidence.** When the data contradicts the premise of the request, the model does what was asked *and* says what it would do instead, with the numbers. It does not refuse and it does not lecture.
5. **Activity, not mechanism.** While tools run, the UI shows what is being looked at ("looking through 104,212 creators"), never what is being called.
6. **Every answer ends with the next question.** Two or three tappable follow-ups the model would ask next. This replaces the slash menu as the way users discover what the product can do.
7. **The pane opens only when there is an object.** A sentence answer stays in the thread. A table, chart, agent draft, or report opens the evidence pane.
8. **The pane is two-way.** Acting on the pane (exclude rows, change a threshold, edit a schedule) is a message to the model, and the model responds.
9. **Work attaches to a decision.** Threads, pinned evidence, agents, and reports live under a named decision, not under a timestamp.

---

## 2. Shell: conversation + evidence pane

### 2.1 Layout states

```
State A — thread only (no object yet)
┌──────┬──────────────────────────────────────────────┐
│ rail │  thread (max-width 720, centered)             │
│      │                                               │
│      │  [composer]                                   │
└──────┴──────────────────────────────────────────────┘

State B — thread + pane (an object exists)
┌──────┬────────────────────────┬─────────────────────┐
│ rail │  thread (min 380)      │  evidence pane      │
│      │                        │  ┌tabs────────────┐ │
│      │                        │  │ object         │ │
│      │  [composer]            │  │ actions        │ │
└──────┴────────────────────────┴─────────────────────┘
        40%                       60%  (user-draggable, persisted per user)

State C — pane focused (user clicked "expand")
┌──────┬────┬────────────────────────────────────────┐
│ rail │thr.│  evidence pane (thread collapses to     │
│      │(80)│  a narrow strip showing last message)   │
└──────┴────┴────────────────────────────────────────┘
```

- Rail: 56 px icon rail (Today, Decisions, Agents, Reports, Data). Expands on hover to 220 px with labels. No "Skills" entry.
- Transition A→B: pane slides in from the right in 220 ms; thread reflows. This is the one orchestrated motion in the product; everything else is instant.
- Below 1100 px: pane becomes a bottom sheet over the thread (drag handle, 70 % height). Below 720 px: full-screen with a back button.

### 2.2 When the pane opens (server decides, client obeys)

The chat SSE stream carries pane events (§5.4). The server emits `pane_open` when a tool result has `output.kind` of `table`, `chart`, `flags`, `agent_draft`, or `report`. It never emits for `text`-kind results or for `query_metrics` results with ≤ 3 rows (those render inline as a small figure with a chip).

### 2.3 Tabs

- Each object is a tab. Tab label = short plain-language title generated by the server from the run (`"Nano creators for Ramadan"`, `"Share of voice, 8 wks"`, `"Weekly: new nano entrants"` for an agent draft). Never the skill name.
- Max 6 open tabs per thread; oldest unpinned closes. Pinned tabs never auto-close.
- Tab state persists in `skill_runs.pane_state jsonb` (sort, filters applied in-pane, excluded ids, selected rows, chart range).

### 2.4 Pane object types and their in-pane actions

| Object | Renders | In-pane actions (each is a `pane_action` message, §5.5) |
|---|---|---|
| table | rows from `SkillResult.rows`, columns from `output.columns`, diff highlighting on `diff_key` | sort, filter by column, select rows, exclude rows, pin row, "Only show new" toggle when a prior run exists |
| chart | SVG from `ChartSpec` | change range (4w/8w/13w/26w), toggle series, hover shows evidence ids |
| flags | flag cards (waves, seeding) | dismiss, "watch this" (→ agent draft) |
| agent_draft | editable card: name, plain-language schedule, delivery, only-if-changed | edit any field, activate, discard |
| report | document view | edit title, add section, share |

Pane footer, always present on table/chart/flags: **Pin to decision**, **Watch this** (promote to agent — carries the run's `params_resolved` exactly, per PRD §6.2), **Export**. These three are the only actions; do not add more.

### 2.5 Two-way rule

Every in-pane action that changes the *meaning* of the object (exclude rows, change threshold, change range, edit agent draft) is sent to the model as a structured user turn and the model replies in the thread in one or two sentences ("Excluded 12 affiliates. 41 left; the top three by cart share are unchanged."). Purely cosmetic actions (sort, column filter, pin) are not sent to the model; they update `pane_state` only.

---

## 3. Skills go internal

- Delete routes `/skills` and `/skills/discovery`. Delete the slash menu. Delete the "Running /skill…" status component.
- `skills.registry.json` stays the source of truth for the model's `run_skill` tool (unchanged) and gains two fields per skill:

```json
{
  "activity": {
    "start": "Looking through {creator_count} creators",
    "steps": ["Checking who has posted for competitors", "Pulling last 90 days of performance"],
    "done": "Matched {matched} of {creator_count}"
  },
  "pane_title": "{tier_label} creators for {intent}"
}
```
  `activity.start/steps/done` are templated with values from `SkillResult.meta` and `params_resolved`. Steps are shown one at a time, ~600 ms apart, while the SQL runs; if the run finishes early, remaining steps are skipped. `pane_title` templates the tab label.

- Routing is the model's job (it already does this via `run_skill`). The only change is that the user no longer types the routing hint. Keep rule 2 of the system prompt about `/slash` commands *out*; the model should never see a slash command.
- **Admin only:** a `/admin/skills` route (behind `FAIR_ADMIN` role) lists the registry, shows run counts and `evidence_miss` per skill, and lets Fair edit activity/pane_title strings. This is the only place a skill name appears.

### 3.1 Activity vocabulary (apply everywhere; extend in the registry)

| Skill | start | done |
|---|---|---|
| discovery | Looking through {creator_count} creators | Matched {matched} |
| mercenaries | Checking who has worked for more than one brand | Found {n} working across {brands} brands |
| loyalists | Looking for creators who came back | {n} returned for {brand} |
| affiliates | Separating resellers from creators | {n} look like affiliate accounts |
| breakout | Scanning small accounts for outsized reach | {n} breakout posts |
| funnel-mix | Working out where reach and carts come from | Done |
| overlap | Comparing rosters | {n} shared creators |
| spend-estimate | Estimating cost from tier and volume | Done |
| velocity | Following posts over their first 7 days | Done |
| forecast | Projecting the current week | Done |
| waves | Looking for sudden creator surges | {n} surges |
| compare | Lining up {brands} brands week by week | Done |
| launch | Reading the launch window | Done |
| objections / questions / dupes / claims / whitespace / seeding | Reading {comment_count} comments | Done |
| audience / switchers / superfans | Looking at who comments where | Done |
| narrative | Reading Threads and X | Done |

---

## 4. Partner behaviours

### 4.1 It talks first — the daily brief

- A `brief` job runs per workspace at 06:00 in the workspace timezone (pg-boss, cron). It runs three skills with fixed params: `compare` (client vs all, last 7 days vs prior 7), `waves` (last 7 days), `breakout` (last 7 days), plus collects every agent diff produced in the last 24 h.
- The model is called once with those results and the brief prompt (§5.3.2). Output is a `Brief`:

```ts
type Brief = {
  date: string;                     // YYYY-MM-DD in workspace tz
  headline: string;                 // one sentence, ≤ 140 chars, with evidence ids
  body: string;                     // 1–3 sentences, evidence ids inline
  offer: { label: string; prompt: string; skill?: string; params?: object }; // one offered action, phrased as a question the user can accept
  followups: { label: string; prompt: string }[];  // 2 more, optional
  evidence: Evidence[];
  quiet: boolean;                   // true when nothing moved; UI shows a one-line "Quiet week so far" instead of a card
};
```
- Persist in `briefs(id, workspace_id, date, content jsonb, evidence jsonb, generated_at, seen_at)`. One per workspace per day; regenerate on demand from a "Refresh" affordance (rate-limit 1/hour).
- Today screen (§7) renders the brief as the hero. Clicking `offer` posts `offer.prompt` as the first user message of a new thread under a decision the user picks (or "Untitled" — renamed later, §6).
- Rule: the brief must contain at least one number with an evidence chip or be `quiet: true`. Never a brief without evidence.

### 4.2 It asks back — one clarifying question

- New tool `ask_user` (§5.2). The model calls it when a request is ambiguous on a dimension that would change the result materially. It returns one question and 2–4 options plus a free-text escape. The UI renders it as tappable options in the thread; the answer is sent as a normal user message.
- Hard rules in the prompt: at most one `ask_user` per user turn; never when the user already specified the dimension; never for cosmetic choices. If the user answers "just pick", the model picks, says which it picked in ≤ 8 words, and continues.
- Dimensions that warrant asking (from the skill params): competitor-exclusion for discovery; window when the user says "recently"; which brand when the workspace has multiple client brands; nano vs micro when the user says "small creators" and the tiers behave differently in this category.

### 4.3 It disagrees — on evidence

- Prompt rule (§5.3.1 rule 5). The behaviour: run what was asked; if a tool result in this turn shows the premise is wrong or a better option exists, add a **counter** paragraph beginning with a plain contrast ("Before you commit to that —" / "One thing the data says —") with the numbers and evidence ids, and offer the alternative as the first follow-up chip.
- The counter is not a refusal and not a hedge. It has to name a specific alternative and a specific figure.
- Server tags assistant messages that contain a counter (`messages.has_counter bool`, detected by the model emitting `<counter>…</counter>`, which the server strips into a styled block). Track `counter_rate` per 100 messages as a product metric; target 10–25 %. Below 5 % the prompt is too soft; above 40 % it is nagging.

### 4.4 Activity, not mechanism

Covered in §3.1 and §5.4. Additionally: the model's text must never contain "skill", "tool", "query", "SQL", "run", "/", or a skill name. The server post-filters assistant text against the registry's skill names and the banned words and logs `mechanism_leak` on hit (strip and replace with "this" as a fallback; fix the prompt if it recurs).

### 4.5 It suggests the next question

- New tool `suggest_followups` (§5.2), called by the model at the end of every substantive answer. 2–3 items, each a label (≤ 48 chars) and a full prompt the label expands to.
- The first follow-up is the alternative from a counter when there is one.
- UI: chips under the assistant message. Tapping a chip sends its prompt as the user's message. Chips disappear once the user sends anything.
- Follow-ups are generated from the registry: the model may only propose follow-ups that map to an available skill (`requires[]` satisfied) or to `query_metrics`. The server validates by dry-routing each follow-up prompt through a cheap Haiku call with `tool_choice: {type: "tool", name: "run_skill"}` is **not** used (forced tool use can 400 on some models); instead validate by checking the `skill` field the model attaches to each follow-up against `available_skills`. Drop unavailable ones.

### 4.6 Decisions, not dates

See §6 and §7.

---

## 5. Model integration changes

### 5.1 Loop (delta to PRD §5.1)

- Same SSE loop. Two tools added (`ask_user`, `suggest_followups`), one behaviour change: when the model calls `ask_user`, the server ends the turn after emitting the question (it does not append a synthetic tool_result and continue). The user's next message is the answer; the server appends it as a normal user message, plus a `tool_result` for the pending `ask_user` call with the answer text so the message history stays valid.
- Tool-call cap stays at 6; `ask_user` and `suggest_followups` count toward it.

### 5.2 Tools (six — five core plus `export_run`, §13.2)

`run_skill`, `query_metrics`, `create_agent_draft` — unchanged from PRD §5.2, except `run_skill`'s description drops the sentence about slash commands.

**4. `ask_user`**
```json
{
  "name": "ask_user",
  "description": "Ask the user exactly one clarifying question before running an analysis, only when the answer would materially change the result and the user has not already specified it. Give 2 to 4 short options. Never ask more than one question per turn. Never ask about cosmetic choices.",
  "input_schema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" },
      "options": { "type": "array", "minItems": 2, "maxItems": 4, "items": { "type": "object", "properties": { "label": { "type": "string" }, "value": { "type": "string" } }, "required": ["label","value"], "additionalProperties": false } },
      "why": { "type": "string", "description": "One short clause the UI shows in grey under the question, e.g. 'competitor overlap changes who ranks first'." }
    },
    "required": ["question","options","why"],
    "additionalProperties": false
  },
  "strict": true
}
```

**5. `suggest_followups`**
```json
{
  "name": "suggest_followups",
  "description": "At the end of every substantive answer, propose the 2 or 3 questions you would ask next given what the data just showed. Each needs a short label and the full prompt it expands to, and the analysis it would use. If you gave a counter-argument this turn, the first follow-up must be the alternative you proposed.",
  "input_schema": {
    "type": "object",
    "properties": {
      "items": { "type": "array", "minItems": 2, "maxItems": 3, "items": { "type": "object", "properties": { "label": { "type": "string", "maxLength": 48 }, "prompt": { "type": "string" }, "skill": { "type": "string", "enum": ["discovery","mercenaries","...23 names","query_metrics"] } }, "required": ["label","prompt","skill"], "additionalProperties": false } }
    },
    "required": ["items"],
    "additionalProperties": false
  },
  "strict": true
}
```
Server: on `suggest_followups`, filter items by `available_skills`, emit SSE `followups`, append a `tool_result` of `{"ok":true}`, and let the model end its turn.

### 5.3 System prompts

#### 5.3.1 Thread prompt (replaces PRD §5.3; keep in `src/chat/system.md`)

```
You are the analyst behind Fair Intel, working with the {client_brand.name} team inside {workspace.name}. Other tracked brands are competitors. You have watched every public creator post about these brands since {data_since}, and you know {creator_count} creators across TikTok and Instagram.

You are a partner in the room, not a report generator. You think out loud in short sentences, you have a view, and you show your work with evidence.

How you answer
1. Lead with the answer in 2–4 sentences. No headers, no bullet lists longer than four items, no preamble.
2. Every number, ranking, and named creator or post comes from a tool result in this conversation. Cite inline with the evidence id in square brackets, e.g. [ev_03]. If the data does not contain it, say so in one clause and move on. Never invent a figure.
3. Never mention how you got the answer. No tool names, no analysis names, no "I ran", no "query", no slash commands. Say "looking at the last 8 weeks" not "running a comparison".
4. Before doing ambiguous work, ask exactly one question with ask_user — only when the answer changes the result and the user has not already said. If they say "just pick", pick, say which in a few words, and continue. Never ask twice in one turn.
5. When the data disagrees with the user's premise or shows a better option, do what they asked and then push back. Wrap the pushback in <counter></counter>. It must name a specific alternative with a specific figure and evidence id. One counter per answer at most. Do not hedge it and do not apologise for it.
6. End every substantive answer by calling suggest_followups with the 2–3 things you would ask next. If you gave a counter, the alternative is the first follow-up.
7. When the user asks for something on a schedule or says "watch", "alert me", "every week", call create_agent_draft with the most recent relevant run's parameters carried over exactly. Describe the schedule in plain words, never cron.
8. Compare within a capture month by default. When comparing across months, state the capture caveat from meta.caveats once, in one clause.
9. Mirror the user's language (Indonesian or English). Brand and creator handles stay verbatim. Currency is IDR unless the user uses another.
10. Tone: direct, warm, specific. Say "you" and "I". No exclamation marks. No "great question". Disagree like a colleague who wants the campaign to work.

Pane actions
When a user message is a pane action (it arrives as JSON with type "pane_action"), reply in one or two sentences describing what changed in the object and whether the conclusion changed. Do not re-run the analysis unless the action requires it (excluding rows does not; changing a window does).

Decision context
The current decision is "{decision.name}" ({decision.status}). Pinned so far: {pinned_summaries}. Prefer continuity with what is pinned: if a shortlist is pinned, new discovery answers should note overlap with it.
```

#### 5.3.2 Brief prompt (`src/brief/system.md`)

```
You are the analyst behind Fair Intel for the {client_brand.name} team. It is {date_human}. Below are this week's comparison, any creator surges, any breakout posts, and every alert your watchers produced overnight.

Write the morning brief as if you were the first person in the room:
- headline: one sentence, the single most important thing that changed, with an evidence id. ≤ 140 characters.
- body: 1–3 sentences with the numbers behind it, evidence ids inline. Competitors before us if they moved more.
- offer: one thing you would do next, phrased as a question the user can say yes to ("Want me to check whether any of your creators are in Skintific's push?"), with the prompt that would run it.
- followups: up to two more, optional.
If nothing moved beyond normal variance, set quiet to true and write a one-line headline saying so.
Never write a brief without at least one evidence id unless quiet is true. Never mention tools or analyses.
```

### 5.4 SSE events (adds to PRD §5.1)

| event | payload | client behaviour |
|---|---|---|
| `activity` | `{run_id, text, step, total}` | inline status line under the composer; replaces previous text |
| `pane_open` | `{run_id, kind, title, object}` | open pane if closed; add tab; focus it |
| `pane_update` | `{run_id, patch}` | apply patch to the object (after a pane action) |
| `ask` | `{question, options[], why}` | render option chips in thread; disable composer until answered or user types |
| `counter` | `{text, evidence[]}` | render as counter block (left border, `--amber`) |
| `followups` | `{items[]}` | render chips under the message |
| `text`, `tool_result`, `done` | unchanged | |

### 5.5 Pane actions as user turns

A pane action is appended to `messages` as `role: user` with `content_json = {"type":"pane_action","run_id":"…","action":"exclude_rows","ids":["…"],"human":"Excluded 12 rows"}` and `hidden: true` (new column). The UI shows it in the thread as a small grey system-style line ("You excluded 12 creators") rather than a bubble. The model sees the JSON.

Actions: `exclude_rows`, `include_rows`, `set_threshold {field, value}`, `set_range {weeks}`, `edit_agent_draft {patch}`, `activate_agent`, `discard_agent`, `pin`, `unpin`.

### 5.6 Titles

Threads and tabs are titled by a Haiku call on the first assistant message (thread) and on each `pane_open` (tab, using `pane_title` template first; Haiku only if a template variable is missing). ≤ 6 words, no skill names. `messages.title_source` records template vs model.

---

## 6. Data model deltas

```sql
decisions(
  id uuid pk, workspace_id, user_id, name text, status text default 'open',   -- open | decided | archived
  outcome text null, created_at, updated_at
)
conversations: add decision_id uuid null references decisions(id), title text (model-generated)
agents:        add decision_id uuid null
reports:       add decision_id uuid null
pins(id uuid pk, decision_id, skill_run_id, note text null, created_by, created_at)
briefs(id uuid pk, workspace_id, date date, content jsonb, evidence jsonb, quiet bool, generated_at, seen_at null, unique(workspace_id, date))
skill_runs:    add pane_state jsonb null, pane_title text null
messages:      add hidden bool default false, has_counter bool default false, followups jsonb null
users:         add pane_ratio numeric default 0.6
```

Migration: backfill every existing conversation into a decision named from the conversation title (one decision per conversation) so nothing is orphaned. Users merge later by drag-and-drop on the Decisions screen.

---

## 7. Screens by route (replaces PRD §8)

| Screen | Route | What is on it |
|---|---|---|
| Today | `/` | Brief hero (headline, body with chips, offer button, 2 follow-ups). Composer under it ("or ask me something"). Below: open decisions (name, last activity, pinned count, agents watching), then "Alerts this week" from agent diffs. No empty state ever: with no data loaded, the brief says so and offers the Data screen. |
| Decision | `/d/[id]` | Thread + evidence pane (§2). Header: decision name (inline-editable), status pill, pinned count, watching count. Right-pane tabs. New thread inside a decision = same route, new conversation_id in the URL hash. |
| Decisions | `/decisions` | List, grouped open / decided / archived. Drag a thread onto another decision to merge. "Mark decided" asks for the outcome in one line. |
| Agents | `/agents` | Renamed in UI to **Watching**. List: plain-language title ("New nano creators for Ramadan, every Monday"), decision it belongs to, last change found, delivery. Creating one from here opens a thread with the prompt "What do you want me to watch?" — there is no form. |
| Reports | `/reports/[id]` | Unchanged, plus decision link. |
| Data | `/data` | Brand list is clickable → `/data/[brand]` coverage page (§14). |
| Admin: skills | `/admin/skills` | §3, Fair staff only. |

Removed: `/skills`, `/skills/discovery`, the slash menu, the Skills gallery.

Design tokens: `:root` block from `fair-intel-prototype-v3.html` (same as v2; `--blue:#1E5EFF` placeholder until Fair Influence tokens are supplied — one-line swap). Plus Jakarta Sans. 1px borders, no shadows except popovers and the pane's left edge. Blue for actions, active, own brand, evidence chips. Amber left-border for counters only.

---

## 8. Copy rules

- Sentence case everywhere. No all-caps labels.
- Name things by what the user does: "Watching", not "Agents"; "Pin to decision", not "Save run"; "Watch this", not "Create agent".
- Activity lines are present continuous and name the thing looked at: "Looking through 104,212 creators", "Reading 38,410 comments". Never "Running", "Executing", "Querying".
- Counters start with a plain contrast, never "However" or "Note that": "Before you commit to that —", "One thing the data says —", "I'd flip this —".
- Follow-up chips are questions the user would actually type, in the user's language: "Who's in Skintific's push?", "Same list, nano only", "Watch this weekly".
- The brief speaks first person: "Skintific tripled views this week" not "Skintific's views increased by 200%".
- Empty and error states give the next action: "No comments loaded yet — this needs the comment layer. Ask me anything about creators or brands in the meantime."

---

## 9. Acceptance tests (add to PRD §10)

**M6 — Shell and pane**
- [ ] Sending "who are the top nano creators in beauty this month" opens the pane with a table tab titled without a skill name; the thread shows an activity line that changes at least once during the run.
- [ ] Sending "which brand had the most views last week" does **not** open the pane; the answer is inline with a chip.
- [ ] Excluding 5 rows in the table produces a hidden user turn and a 1–2 sentence assistant reply; the run is not re-executed (`skill_runs` count unchanged).
- [ ] Changing chart range from 8w to 13w re-executes and replaces the tab object.
- [ ] Pane ratio drag persists across reload.
- [ ] At 900 px the pane is a bottom sheet; at 600 px it is full screen with back.

**M7 — Partner behaviours**
- [ ] "Find me creators for Ramadan" → exactly one `ask` event with 2–4 options; answering runs discovery; "just pick" runs it with a stated choice.
- [ ] "Give me mega creators for our launch" in a workspace where nano cart share > 2× mega → assistant reply contains one counter block with a figure and an evidence id, and the first follow-up chip proposes nanos.
- [ ] 100 assistant messages: `mechanism_leak` = 0; `evidence_miss` < 1; `counter_rate` between 10 and 25 %.
- [ ] Every substantive answer emits a `followups` event with 2–3 items, all mapping to available skills; none reference a phase-2 skill while comments are unloaded.
- [ ] Brief generated at 06:00 WIB for each workspace; contains ≥ 1 evidence chip or `quiet: true`; offer button starts a thread whose first user message equals `offer.prompt`.

**M8 — Decisions**
- [ ] New thread from Today prompts for a decision (existing or new) before the first reply streams; the thread lands under it.
- [ ] Pinning a table adds it to the decision; a later discovery answer in the same decision mentions overlap with the pinned shortlist.
- [ ] "Watch this" on a pinned table creates an agent draft in the pane with `params_resolved` identical to the run's; activating creates the agent under the decision.
- [ ] Marking a decision decided asks for the outcome and moves it to the decided group.

---

## 10. Build order (continues PRD §10)

- **M6** Shell + pane + activity events + registry `activity`/`pane_title` fields + remove `/skills` and slash menu. 1 week.
- **M7** `ask_user`, `suggest_followups`, counter handling, mechanism-leak filter, brief job + Today screen, new system prompts. 1 week.
- **M8** Decisions, pins, Watching rename, migrations, admin skills page. 3–4 days.

---

## 11. What this supersedes in `PRD.md`

- §5.2 tools: now five (adds `ask_user`, `suggest_followups`); `run_skill` description loses the slash-command sentence.
- §5.3 system prompt: replaced by §5.3.1 here.
- §5.6 UI behaviour: replaced entirely by §2 and §4 here.
- §8 screens: replaced by §7 here.
- Registry format (§4.2): adds `activity` and `pane_title` per skill.
- `CLAUDE.md`: append the block in §12.

---

## 12. `CLAUDE.md` delta (append verbatim)

```
## Partner experience (PRD-v2-partner-experience.md)
- Skills are internal. Never render a skill name, slash command, tool name, or "Running…" in the UI or in model text. The server filters assistant text for these and logs mechanism_leak.
- The right pane is an evidence object (table | chart | flags | agent_draft | report). It opens only on a pane_open SSE event. Pane actions that change meaning are sent to the model as hidden user turns of type pane_action.
- Every thread belongs to a decision. Pins, agents, and reports hang off decisions.
- The model asks at most one clarifying question per turn (ask_user), ends substantive answers with suggest_followups, and may emit one <counter> block per answer which the server renders as an amber-bordered block.
- The daily brief (briefs table) is generated at 06:00 workspace time and is the hero of /.
- Exports (csv/xlsx) apply pane_state and include an About sheet; export_run is the only chat path. Brand pages under /data are coverage pages with six sections (coverage, tiers, posts over time, top creators, hashtags, sounds) and an Ask-about-this link each; no KPI heroes. Hashtags/sounds need the posts.hashtags / posts.sound_* columns from the loader and the /trending skill.
- Activity strings and pane titles come from skills.registry.json (activity, pane_title) and are templated from SkillResult.meta and params_resolved.
```


---

## 13. Export (any table object, discovery first)

### 13.1 From the pane
- The **Export** footer button opens a two-item menu: **CSV** and **Excel (.xlsx)**. No other formats in v1.
- Route: `GET /api/runs/[id]/export?format=csv|xlsx`. Session + workspace scoping as everywhere else.
- The export is the **full result** (`skill_runs.result.rows`, all of them — never the ≤ 60 rows trimmed for the model context) with `pane_state` applied: excluded rows removed, in-pane column filters applied, current sort applied, "Only show new" honoured if on.
- Columns use the human labels from `output.columns` (`Cart share`, not `cart_pct`); numbers are numbers, not formatted strings; percentages exported as 0–100 with the header saying `(%)`; URLs kept as URLs.
- Add three trailing columns to every row: `Evidence url` (sample post), `For you` (Never / last paid post date), `Excluded` is **not** included — excluded rows are simply absent.
- `.xlsx` gets a second sheet, **About this list**: run title, date and time (workspace tz), plain-language filters from `params_resolved` (e.g. "Nano · over 40% cart · no competitor post in last 90 days"), data freshness (`meta.freshness`), capture caveats (`meta.caveats`), row count before and after exclusions, and the decision it belongs to. CSV gets the same as a commented header block (`# …`) above the data — keep it, spreadsheets ignore it and humans read it.
- Filename: `{pane_title slug}-{YYYY-MM-DD}.{csv|xlsx}`.
- Generation is synchronous up to 5,000 rows; above that enqueue a pg-boss job and send the file to the user's email + an in-app toast with the link. Discovery never exceeds this in practice but `query_metrics` can.
- Log `exports(id, skill_run_id, user_id, format, rows, created_at)`; show "Exported 41 rows as CSV" as a hidden system line in the thread so the model knows it happened.

### 13.2 From chat
Add a sixth tool. It is deliberately tiny.

```json
{
  "name": "export_run",
  "description": "Export the rows of an analysis in this conversation as a CSV or Excel file when the user asks for a spreadsheet, CSV, Excel, download, or 'send me the list'. Defaults to the most recent table in this conversation and to xlsx. Returns a download url to give the user.",
  "input_schema": {
    "type": "object",
    "properties": {
      "skill_run_id": { "type": "string" },
      "format": { "type": "string", "enum": ["csv","xlsx"] }
    },
    "required": ["skill_run_id","format"],
    "additionalProperties": false
  },
  "strict": true
}
```
System prompt addition (rule 11): *"When the user asks for a spreadsheet, CSV, Excel, or to download a list, call export_run on the most recent table and reply with the link in one sentence. If there is no table in the conversation yet, say so and offer to build the list first."*

The tool applies the same `pane_state` as the button. Reply copy: "Here's the list — 39 creators, Excel." with the link rendered as a file chip, not a raw URL.

Acceptance (add to M6): export from pane after excluding 2 rows yields 39 rows; xlsx has the About sheet; "send me this as a spreadsheet" in chat returns a file chip within 3 s for ≤ 5,000 rows.

---

## 14. Brand pages under Data (coverage, not analytics)

### 14.1 Why this shape
Fair Listening's brand dashboard, with thin data, shows two nano creators, a mentions line that spikes once and sits at zero for 29 days, and 0 % growth on every row. That is what a dashboard does with sparse coverage — it advertises emptiness. Fair Intel's brand page exists to answer one question: **"what have you actually collected about this brand?"** — so a client trusts the answers and a Fair operator can spot gaps. It is a door into the conversation, not a place to do analysis. Dashboards proper stay deferred.

### 14.2 Routes
- `/data` — unchanged, plus the brand list becomes clickable. Each row: brand, client/competitor pill, owned handles, posts, creators, comments (0 until P2), first and last captured date, last load.
- `/data/[brand_slug]` — the brand page. Header: brand name, client/competitor pill, owned handles per platform with a link to each, "Tracked since {first_capture}", "Last fetched {last_load}". Period picker: 30 d / 90 d / all, default 30 d.

### 14.3 Six sections, in this order
Every section has a small **Ask about this** link at its right edge. It opens a new thread (prompting for a decision as usual) with a prefilled first message and `brand_id` set in the thread context — see 14.5.

**1. Coverage**
Posts, creators, comments, platforms, owned vs earned split, months covered per platform with capture days per month (the same uneven-capture data the README warns about, made visible). If a platform has < 15 capture days in a month, show that month's cell amber with "partial". Nothing here is a metric; it is an inventory.

**2. Creator tiers**
One row per tier (nano, micro, mid, macro, mega): creators, posts, views, **share of views**, median views per post, ER, cart share (TikTok only). Rules:
- A tier with fewer than 5 creators in the period renders its metric cells as "too few to compare" rather than numbers. Counts still show.
- Show share of views alongside share of creators; that is the row that tells the story ("7 % of creators, 41 % of views").
- No "View details" buttons. The Ask link's prefilled prompt is "Which tier is doing the work for {brand} — creators, views, and carts by tier over the last {period}."

**3. Posts over time**
Weekly bars (not daily dots), last 13 weeks, stacked owned vs earned, one series per platform toggle. Weeks with no capture at all are drawn as a hatched gap labelled "no posts captured", never as a zero. Growth is shown as this period vs the prior period of the same length, as a signed number and a percent; when the prior period has no capture, show "no comparison" not 0 %.

**4. Top creators**
Table, last {period}: creator, tier, platform, posts, views, ER, cart share, **worked for** (other tracked brands this creator posted for in the period, as chips), **for {client}** (Never / last paid post date). Sortable, 20 rows, "Show all" expands to 100. Same table component as the evidence pane so it can be exported with §13 and pinned to a decision.

**5. Hashtags**
Table, last {period}: hashtag, platform, posts using it, creators using it, views on those posts, **share of the brand's views**, vs prior period (signed count and percent; "new" if absent in prior period; "no comparison" if prior period has no capture). Sorted by views. 15 rows, "Show all" → 100. Exclude the brand's own name hashtags from the top of the list by default (toggle "Include brand hashtags") — `#luxcrime` ranking first tells nobody anything. Rows with a single post show views but "—" for growth.

**6. Sounds** (TikTok only; section hidden when the period has no TikTok capture)
Table, last {period}: sound name, artist/original creator, posts, creators, views, share of the brand's TikTok views, vs prior period, and **also used by** (other tracked brands whose posts used the same sound in the period, as chips — this is the interesting column: a sound moving across brands is a trend, a sound used once is noise). Original sounds (`original sound - {handle}`) are grouped as "Original sounds" in one row with a count, expandable, so the table isn't 80 % single-use originals. 15 rows, "Show all" → 100.

Sections 5 and 6 use the same table component as 4, so they export (§13) and pin.

### 14.4 Data model additions for hashtags and sounds (ETL, do before building sections 5–6)

```sql
posts: add hashtags text[] default '{}',          -- lowercased, no '#', deduped, from caption + post metadata
       add sound_id text null,                    -- platform sound id (TikTok music_id); null on IG
       add sound_name text null,                  -- as shown on the post
       add sound_author text null,                -- artist or original creator handle
       add sound_is_original bool null            -- name starts with 'original sound' / 'suara asli'
create index posts_hashtags_gin on posts using gin (hashtags);
create index posts_sound_idx on posts (workspace_id, brand_id, sound_id) where sound_id is not null;
```
- Loader contract (PRD §3.4): both columns are optional in the upload; when absent, the loader records `meta.missing_columns` and the brand page hides sections 5–6 with "Hashtags not in this export" — it does not show an empty table.
- Hashtags are parsed from `caption` when a `hashtags` column is absent: `#\w+` tokens, lowercased. Indonesian "suara asli" counts as original sound.
- Two new materialized views, refreshed after each load:
  `brand_hashtag_weeks(brand_id, platform, week, hashtag, posts, creators, views)` and
  `brand_sound_weeks(brand_id, week, sound_id, sound_name, sound_author, is_original, posts, creators, views)`.
- New skill in the registry, phase 1c (`requires: ["posts.hashtags","posts.sound_id"]`): **`/trending`** — "what hashtags and sounds are moving in the category this week, and which brands are on them." Output kind `table`, diff_key `hashtag|sound_id`. Activity: "Reading hashtags and sounds across {brands} brands" → "{n} moving". This is what "Ask about this" on sections 5–6 routes to, and it is agent-promotable like everything else ("Tell me when a sound crosses three brands").

### 14.4b Not in v1 of the page
- Sentiment, topics, comments (P2).
- Per-creator drill-down pages (still out of scope; creator context lives in the conversation).
- Any KPI card row. Counts live in Coverage; there is no "Total views 12.4M" hero.

### 14.5 Ask about this (page → thread)
- Each section's link posts a first message and sets `conversations.context_json = {"brand_id": "…", "period": "30d", "section": "tiers"}`. The thread prompt gains one line: *"The user arrived from {brand}'s data page, looking at {section} for the last {period}. Start from that; do not ask which brand."*
- Prefilled prompts: Coverage → "What's missing in what you have on {brand}?"; Tiers → as above; Posts over time → "What happened to {brand} in week {peak_week}?"; Top creators → "Who's new for {brand} this period, and have any of them posted for us?"; Hashtags → "Which hashtags are {brand} riding that we aren't?"; Sounds → "Which sounds are moving across brands this month, and is {brand} early or late on them?"
- This is the only way analysis leaves the page. No inline charts beyond section 3.

### 14.6 Data
Sections 1–4 read from the existing materialized views (`brand_weeks`, `creator_brand_months`, `posts`) plus a new `brand_coverage` view: `(brand_id, platform, month, capture_days, posts, creators, comments, first_captured, last_captured)` refreshed after each load. No new tables.

### 14.7 Acceptance (add to M8)
- [ ] `/data/skintific` renders six sections from the DB with no client-side aggregation; sections 5–6 hide with a one-line reason when the load lacked hashtag/sound columns.
- [ ] Hashtags table excludes `#skintific` by default; the toggle brings it back. Sounds table groups original sounds into one expandable row and shows `also used by` chips.
- [ ] `/trending` runs when hashtags and sound columns are loaded and returns `unavailable` with the missing layer named when they are not.
- [ ] A tier with 3 creators shows counts but "too few to compare" for views/ER/cart.
- [ ] A month with 16 TikTok capture days is marked partial in Coverage; a week with zero capture is a hatched gap in Posts over time.
- [ ] Growth reads "no comparison" when the prior period is empty.
- [ ] "Ask about this" on Tiers opens a thread whose first assistant message names the brand without asking which brand.
- [ ] Top creators exports via §13 and pins to a decision.

---

## Appendix A — Target dialogue (what "partner" looks like in practice)

**Today, 06:00 brief**
> Skintific tripled views this week and most of it is nano accounts with 60 % cart — that looks like an affiliate push, not a campaign. [ev_01] Luxcrime is flat. Your own views are up 12 % on 9 fewer creators [ev_02].
> **Want me to check whether any of your creators are in Skintific's push?**
> _Same list, what are they saying in comments?_ · _Who else is running affiliates this month?_

**Decision: Ramadan launch**

User: find me creators for the Ramadan launch

Assistant (ask): Before I look — do you mind if they've posted for a competitor in the last 90 days?
_(competitor overlap changes who ranks first)_
[ Exclude competitor creators ] [ Fine if they have ] [ Only if they've posted for us before ]

User: exclude them

Assistant: *Looking through 104,212 creators → Checking who has posted for competitors → Matched 1,284*
Pane opens: "Ramadan creators, no competitor overlap" (table)

Assistant: 1,284 creators fit, and the interesting group is the 41 nanos with over 40 % cart share and no competitor history in 90 days [ev_04]. Top three by cart are @rinaskin (57 %), @dwi.glowup (52 %), @beautybynadia (49 %) [ev_05].
<counter>Before you commit to nanos only — micros in this category convert nearly as well (47 % vs 42 % cart [ev_06]) and give you about 4× the reach per creator [ev_07]. I'd take 30 nanos and 8 micros rather than 50 nanos.</counter>
_Show me the 30 + 8 mix_ · _Which of these have worked for MS Glow?_ · _Watch for new ones weekly_

User: (pane) excludes 12 rows

Assistant: Excluded 12. 29 left; the top three by cart are unchanged.

User: watch for new ones weekly

Assistant: Pane tab: "Weekly: new Ramadan creators" (agent draft) — Every Monday 08:00 WIB, only when someone new appears, sent to WhatsApp and here. Same filters as this list.
[ Start watching ] [ Change ]
