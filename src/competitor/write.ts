/**
 * The words of the weekly report, written by the model from the facts
 * (DECISIONS, 29 Sep 2026). The model sees a fact sheet in which every number is
 * already formatted the way the deck prints it, writes the narrative through one
 * tool, and `checkNarrative` rejects any number the facts do not contain and any
 * field over its word limit. A rejected draft goes back with the problems, twice
 * at most; after that, or without a model, the report ships with a plain
 * narrative built from the facts, so a scheduled report never fails for words.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, describeModelError } from "../chat/client";
import { hasModelCredentials, modelId } from "../chat/loop";
import { checkNarrative, type Narrative } from "./narrative";
import type { Cell, GroupResult, Mover, Platform, WeeklyReport } from "./types";
import { change, compact, flagValue, int, lensLines, metricLabel, PLATFORM_NAME, pct, pts } from "./view";

export type Written = { narrative: Narrative; by: "model" | "fallback"; attempts: number; problems: string[] };
type Create = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

const MAX_ATTEMPTS = 3;
const TOOL_NAME = "write_weekly_report";

// ------------------------------------------------------------- fact sheet
function cellLine(pl: Platform, c: Cell | undefined): string {
  if (!c?.covered || !c.now || !c.prev) return `  ${PLATFORM_NAME[pl]}: not in coverage`;
  const n = c.now, p = c.prev;
  const flags = c.flags.map((f) => `HIGHLIGHTED ${f.metric === "er" ? "engagement rate" : f.metric} ${f.direction} (${f.metric === "er" ? pts(f.value, f.previous) : `SOV ${pct(f.value)} from ${pct(f.previous)}`}, 8-week range ${flagValue(f.unit, f.metric, f.low)}–${flagValue(f.unit, f.metric, f.high)})`);
  return `  ${PLATFORM_NAME[pl]}: posts ${int(n.posts)} (${change(n.posts, p.posts)}; SOV ${pct(n.posts_share)}, ${pts(n.posts_share, p.posts_share)}) · views ${compact(n.views)} (${change(n.views, p.views)}; SOV ${pct(n.views_share)}, ${pts(n.views_share, p.views_share)}) · ER ${pct(n.er)} (last week ${pct(p.er)}, ${pts(n.er, p.er)}) · creators ${int(n.creators)} (last week ${int(p.creators)})${flags.length ? ` · ${flags.join("; ")}` : ""}`;
}

function groupBlock(r: WeeklyReport, g: GroupResult): string {
  return [`- ${g.group.name}${g.group.untracked?.length ? ` (not collected yet: ${g.group.untracked.join(", ")})` : ""}`, ...r.platforms.map((pl) => cellLine(pl, g.cells[pl]))].join("\n");
}

function moverBlock(m: Mover, i: number): string {
  const f = m.flag;
  const posts = m.what.top_posts.map((p) => `    ${p.ref} ${p.creator_handle ? "@" + p.creator_handle : "brand account"}: ${compact(p.views)} views${p.er != null ? `, ${pct(p.er)} ER` : ""}${p.content_format ? `, ${p.content_format}` : ""}${p.has_cart ? ", yellow cart" : ""}. "${(p.caption ?? "").replace(/\s+/g, " ").slice(0, 140)}"`);
  return [
    `${i + 1}. key="${m.key}" ${m.name} on ${PLATFORM_NAME[m.platform]}: ${metricLabel(f.metric, f.unit, m.platform)} ${f.direction} to ${flagValue(f.unit, f.metric, f.value)} from ${flagValue(f.unit, f.metric, f.previous)} last week (8-week range ${flagValue(f.unit, f.metric, f.low)}–${flagValue(f.unit, f.metric, f.high)})`,
    ...lensLines(m).map((l) => `   ${l.label}: ${l.segs.map((s) => s.t).join("")}`),
    `   Top posts:`,
    ...posts,
    m.other_flags.length ? `   Also highlighted for ${m.name}: ${m.other_flags.map((o) => `${PLATFORM_NAME[o.platform]} ${o.flag.metric} ${o.flag.direction}`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

/** Everything the model may say, with every number already printed the way the deck prints it. */
export function factSheet(r: WeeklyReport): string {
  const core = r.watchlist.filter((g) => g.group.kind === "core");
  const relevant = r.watchlist.filter((g) => g.group.kind === "when_relevant");
  const panel = r.platforms.map((pl) => {
    const p = r.panel[pl];
    return p ? `${PLATFORM_NAME[pl]} panel: ${int(p.now.posts)} posts (${change(p.now.posts, p.prev.posts)} against last week), ${compact(p.now.views)} views (${change(p.now.views, p.prev.views)})` : "";
  }).filter(Boolean);
  return [
    `REPORT: ${r.title} for ${r.client}, week ${r.week.iso} (${r.week.label}), against ${r.previous_week.label}. Platforms: ${r.platforms.map((p) => PLATFORM_NAME[p]).join(", ")}.`,
    `RULE: a move is highlighted when it is outside the brand's own ${r.rules.lookback_weeks}-week range, at least ${r.rules.z} SD from its average, at least ${r.rules.min_change_pct}% against last week (${r.rules.min_er_change_pts} pt for ER) and at least ${r.rules.min_posts} posts or ${compact(r.rules.min_views)} views. Posts and views are judged as share of voice (SOV) of the panel.`,
    "",
    "PANEL",
    ...panel,
    "",
    "WATCHLIST (core)",
    ...core.map((g) => groupBlock(r, g)),
    ...(relevant.length ? ["", "WATCHLIST (when relevant: mention only if they moved)", ...relevant.map((g) => groupBlock(r, g))] : []),
    "",
    r.movers.length ? `MOVERS (one driver slide each, in this order; drivers[].key must be exactly: ${r.movers.map((m) => `"${m.key}"`).join(", ")})` : "MOVERS: none. This is a quiet week; drivers must be an empty list.",
    ...r.movers.map(moverBlock),
    ...(r.flagged.length > r.movers.length ? ["", `ALSO HIGHLIGHTED: ${r.flagged.filter((f) => !r.movers.some((m) => m.key === f.key && m.platform === f.platform && m.flag.metric === f.flag.metric)).map((f) => `${f.name} ${PLATFORM_NAME[f.platform]} ${f.flag.metric} ${f.flag.direction}`).join("; ")}`] : []),
    ...(r.near_misses.length && !r.movers.length ? ["", "CLOSEST TO THE LINE (not highlighted)", ...r.near_misses.map((x) => `- ${x.name} ${PLATFORM_NAME[x.platform]} ${x.metric === "er" ? "engagement rate" : `SOV of ${x.metric}`} ${x.value == null ? "–" : pct(x.value)} (last week ${x.previous == null ? "–" : pct(x.previous)}): ${x.miss}`)] : []),
    "",
    `CLIENT: ${r.client} (reported in the appendix; the actions are for ${r.client}). Their brands: ${r.client_brands.map((g) => g.group.name).join(", ")}.`,
    groupBlock(r, r.portfolio),
    ...r.client_brands.filter((g) => r.platforms.some((pl) => g.cells[pl]?.flags.length)).map((g) => groupBlock(r, g)),
    "",
    "DATA NOTES",
    ...r.notes.map((n) => `- ${n.text}`),
  ].join("\n");
}

// ------------------------------------------------------------------ model
const SYSTEM = `You write the words of Fair's Weekly Competitor Pulse, a short deck a brand's marketing team reads on Monday morning. The numbers are already computed; you phrase them.

Rules:
- Use only numbers that appear in the fact sheet, written exactly as they appear there (same rounding and unit: "34.5M", "11.2%", "+43%", "2.0 pt"). Never compute a new number: no sums, differences, averages or ratios of your own. When unsure, say it without a number.
- Plain English, short sentences, no filler, no hype. Say what moved, who drove it and what it means for the client.
- Watchlist brands fill the report; the client's own brands appear only in portfolio_note and as the brands an action is for.
- A highlighted move is news; everything else is context. In a quiet week say so plainly and use near misses and the client's own numbers.
- High views at very low engagement read as paid distribution; say "looks paid", never assert it.

Fields and word limits (hard limits; a longer field is rejected):
- summary: exactly three items, labels "New", "Working", "Worth testing" in that order. stat: the one number for the callout (max 9 characters). stat_label: max 6 words. text: max 18 words.
- scoreboard_title: max 12 words, the headline of the week. movers_title: max 12 words.
- drivers: one per mover, in the given order, key exactly as given. title max 10 words; why max 45 words (who and what drove it, from the lens lines); attention_to_action max 28 words (does the attention turn into buying: cart, reach vs engagement).
- actions: one to three things the client should do this week. title max 9 words; detail max 30 words; brands: the client's brand names it applies to, or ["All brands"]; based_on: which move it comes from, e.g. "Timephoria · Instagram views".
- portfolio_note: optional, max 30 words, the client's own notable move.

Call ${TOOL_NAME} exactly once with the whole narrative.`;

const EXAMPLE = `Example of the voice (a different week): summary New "11.2%" / "Timephoria's share of Instagram views" / "Timephoria pushed a new skintint stick through mid-tier reviewers; the top two reviews drew 5.2M and 4.7M views." Driver why: "Mid-tier reviewers carried a new skintint stick: 125 creators posted, double last week's 62, and Instagram views rose from 81K to 34.5M. Engagement stayed at 0.2%, so the reach looks paid rather than earned." Action: "Meet the skintint stick where people buy" / "Timephoria's stick lives in Instagram reviews with no cart. A base-product review series on TikTok with cart links meets the same shopper closer to checkout."`;

function tool(r: WeeklyReport, clientBrands: string[]): Anthropic.Tool {
  const keys = r.movers.map((m) => m.key);
  return {
    name: TOOL_NAME,
    description: "Write the narrative of this week's report.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "array", minItems: 3, maxItems: 3,
          items: { type: "object", properties: { label: { type: "string", enum: ["New", "Working", "Worth testing"] }, stat: { type: "string" }, stat_label: { type: "string" }, text: { type: "string" } }, required: ["label", "stat", "stat_label", "text"] },
        },
        scoreboard_title: { type: "string" },
        movers_title: { type: "string" },
        drivers: {
          type: "array", minItems: keys.length, maxItems: keys.length,
          items: { type: "object", properties: { key: keys.length ? { type: "string", enum: keys } : { type: "string" }, title: { type: "string" }, why: { type: "string" }, attention_to_action: { type: "string" } }, required: ["key", "title", "why", "attention_to_action"] },
        },
        actions: {
          type: "array", minItems: 1, maxItems: 3,
          items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, brands: { type: "array", items: { type: "string", enum: [...clientBrands, "All brands"] } }, based_on: { type: "string" } }, required: ["title", "detail", "brands", "based_on"] },
        },
        portfolio_note: { type: "string" },
      },
      required: ["summary", "scoreboard_title", "movers_title", "drivers", "actions"],
    },
  } as Anthropic.Tool;
}

function asNarrative(input: unknown, r: WeeklyReport): Narrative {
  const o = (input ?? {}) as Partial<Narrative>;
  return {
    week: r.week.iso,
    summary: Array.isArray(o.summary) ? o.summary : [],
    scoreboard_title: String(o.scoreboard_title ?? ""),
    movers_title: String(o.movers_title ?? ""),
    drivers: Array.isArray(o.drivers) ? o.drivers : [],
    actions: Array.isArray(o.actions) ? o.actions : [],
    ...(o.portfolio_note ? { portfolio_note: String(o.portfolio_note) } : {}),
  };
}

/** Write this week's narrative: the model when it is configured and its draft passes the check, otherwise the plain narrative. */
export async function writeNarrative(r: WeeklyReport, opts: { create?: Create } = {}): Promise<Written> {
  const clientBrands = r.client_brands.map((g) => g.group.name);
  const create: Create | null = opts.create ?? (hasModelCredentials() ? (p) => anthropicClient().messages.create(p) : null);
  let problems: string[] = [];
  let attempts = 0;
  if (create) {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: `${EXAMPLE}\n\nFact sheet for this week:\n\n${factSheet(r)}` }];
    try {
      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        const res = await create({
          model: modelId(),
          max_tokens: 3000,
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          tools: [tool(r, clientBrands)],
          tool_choice: { type: "auto" },
          messages,
        });
        const use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME);
        if (!use) {
          problems = ["no narrative was written (the tool was not called)"];
          messages.push({ role: "assistant", content: res.content.length ? res.content : [{ type: "text", text: "(no answer)" }] });
          messages.push({ role: "user", content: `Call ${TOOL_NAME} with the narrative.` });
          continue;
        }
        const n = asNarrative(use.input, r);
        problems = checkNarrative(n, r);
        if (!problems.length) return { narrative: n, by: "model", attempts, problems: [] };
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: use.id, is_error: true, content: `Rejected. Fix these and call ${TOOL_NAME} again with the whole narrative:\n- ${problems.join("\n- ")}` }] });
      }
    } catch (e) {
      problems = [`model error: ${describeModelError(e)}`];
    }
  }
  return { narrative: plainNarrative(r), by: "fallback", attempts, problems };
}

// ---------------------------------------------------------- plain narrative
const SHORT: Record<string, string> = { posts: "share of posts", views: "share of views", er: "engagement rate" };
/** a value as the deck prints it, or null when the deck would print "<0.1%" (not a number the check can match) */
const printed = (s: string) => (s.startsWith("<") ? null : s);

/**
 * The narrative when the model is unavailable or keeps failing the check: plain
 * sentences from the facts, printed as the deck prints them, within every limit.
 */
export function plainNarrative(r: WeeklyReport): Narrative {
  const movers = r.movers.slice(0, 3);
  const labels = ["New", "Working", "Worth testing"] as const;
  const summary: Narrative["summary"] = movers.map((m, i) => {
    const f = m.flag;
    const now = printed(flagValue(f.unit, f.metric, f.value));
    const before = printed(flagValue(f.unit, f.metric, f.previous));
    return {
      label: labels[i],
      stat: now ?? (f.direction === "up" ? "Up" : "Down"),
      stat_label: `${m.name} ${PLATFORM_NAME[m.platform]} ${SHORT[f.metric]}`.split(/\s+/).slice(0, 6).join(" "),
      text: `${f.direction === "up" ? "Up" : "Down"}${before ? ` from ${before} last week` : " against last week"}, outside its own ${r.rules.lookback_weeks}-week range.`,
    };
  });
  if (!movers.length) summary.push({ label: labels[0], stat: "Quiet", stat_label: "watchlist this week", text: "No watchlist brand moved outside its own normal range." });
  for (const pl of r.platforms) {
    if (summary.length >= 3) break;
    const p = r.panel[pl];
    if (!p || !p.prev.posts) continue;
    summary.push({ label: labels[summary.length], stat: change(p.now.posts, p.prev.posts), stat_label: `${PLATFORM_NAME[pl]} panel posts vs last week`, text: `Every brand's posts on ${PLATFORM_NAME[pl]} are judged against this whole-panel move.` });
  }
  while (summary.length < 3) summary.push({ label: labels[summary.length], stat: "Quiet", stat_label: "watchlist this week", text: "No watchlist brand moved outside its own normal range." });

  const names = movers.map((m) => m.name);
  const scoreboard_title = movers.length ? `${names.join(", ").split(/\s+/).slice(0, 8).join(" ")} moved beyond normal` : "A quiet week on the watchlist";
  const count = ["No brand", "One brand", "Two brands", "Three brands"][movers.length] ?? "Several brands";
  const movers_title = movers.length ? `${count} moved outside ${movers.length === 1 ? "its" : "their"} normal range` : "Nothing moved beyond normal; here is what came closest";

  const drivers: Narrative["drivers"] = r.movers.map((m) => {
    const top = m.what.top_posts[0];
    const why = [
      `${int(m.who.creators)} creators posted for ${m.name} on ${PLATFORM_NAME[m.platform]}, against ${int(m.who.creators_prev)} last week.`,
      top ? `The top post, by ${top.creator_handle ? "@" + top.creator_handle : "a brand account"}, drew ${compact(top.views)} views.` : "",
    ].filter(Boolean).join(" ");
    return {
      key: m.key,
      title: `${m.name}: ${SHORT[m.flag.metric]} ${m.flag.direction} on ${PLATFORM_NAME[m.platform]}`.split(/\s+/).slice(0, 10).join(" "),
      why,
      attention_to_action: "Read the lens lines and the posts behind them before reacting: one week outside the normal range is a signal to watch, not yet a trend.",
    };
  });

  const actions: Narrative["actions"] = movers.length
    ? movers.map((m) => ({
        title: `Look closely at ${m.name} on ${PLATFORM_NAME[m.platform]}`.split(/\s+/).slice(0, 9).join(" "),
        detail: `Its ${SHORT[m.flag.metric]} moved outside its own normal range. Check the posts behind it and decide whether ${r.client} should answer.`,
        brands: ["All brands"],
        based_on: `${m.name} · ${PLATFORM_NAME[m.platform]} ${SHORT[m.flag.metric]}`,
      }))
    : [{ title: "Use the quiet week to test a brief", detail: "No watchlist brand moved beyond normal. A quiet week is a good moment to test a new creator brief without a competitor push in the way.", brands: ["All brands"], based_on: "Scoreboard · no highlighted moves" }];

  const n: Narrative = { week: r.week.iso, summary, scoreboard_title, movers_title, drivers, actions };
  // belt and braces: anything the check still objects to loses its number
  for (const p of checkNarrative(n, r)) {
    const m = /^summary\[(\d)\]\.(stat|text|stat_label)/.exec(p);
    if (m) {
      const s = n.summary[Number(m[1])];
      if (m[2] === "stat") s.stat = "—";
      else if (m[2] === "text") s.text = "See the scoreboard for this move.";
      else s.stat_label = "this week";
    }
    const d = /^drivers\.([^.]+)\.why/.exec(p);
    if (d) { const x = n.drivers.find((y) => y.key === d[1]); if (x) x.why = "See the lens lines and posts on this slide."; }
  }
  return n;
}
