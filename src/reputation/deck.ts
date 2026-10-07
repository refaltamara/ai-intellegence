/**
 * PR decks (DECISIONS, 3 Oct 2026): the reputation report a PR team sends up every
 * week or month, and the issue post-mortem. Same machinery as the competitor decks
 * (PptxGenJS layout, the PDF recorder, Ask AI per slide, versions in the Weekly
 * Reports viewer), different point of view: conversations, issues, narratives and
 * reputation against competitors, never creators.
 *
 * Numbers come from src/reputation/dashboard.ts (reputationFacts) over the deck's
 * period; the model writes only the words, from a fact sheet, and every number in
 * them must be one the deck prints (checkRep). Otherwise the plain words are used.
 */
import type Anthropic from "@anthropic-ai/sdk";
import PptxGenJS from "pptxgenjs";
import { anthropicClient, describeModelError, toolAnswer } from "../chat/client";
import { hasModelCredentials, modelId } from "../chat/loop";
import { numbersIn } from "../competitor/narrative";
import { C, CW, FONT, M, W, add, chip, text, title, type Slide } from "../competitor/draw";
import { drawPdf, recordWith, slideTextsOf, type SlideText } from "../competitor/pdfdeck";
import { deckPeriod, latestComplete, type Grain, type Period } from "../competitor/period";
import { change, compact, dayMonth, int, pct, pts } from "../competitor/view";
import { shiftPeriod } from "../dashboard/period";
import { PR, type RoleModel } from "../roles/model";
import { SkillDb } from "../skills/db";
import { reputationFacts, type Issue, type Level, type PrDashboardData, type Quote } from "./dashboard";

export { REP_SLIDES, REP_SLIDE_KINDS, cleanRepSlides, type RepSlide, type RepSpec } from "./slides";
import type { RepSlide, RepSpec } from "./slides";

export type ReputationReport = PrDashboardData & {
  title: string;
  grain: Grain;
  period: Period;
  previous: Period;
  slides: RepSlide[];
};

export type RepNarrative = {
  summary: { headline: string; happened: string; means: string; next: string };
  issues: { topic: string; read: string; response: string }[];
  narratives: string;
  competitive: string;
  voices: string;
  service: string;
};

/** The deck fonts carry no emoji and no CJK, Thai or Arabic glyphs: drop them from quoted words and captions. */
export const plainText = (t: string) =>
  t
    // emoji, skin tones, flags (regional indicators), joiners
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    // scripts the deck fonts (Liberation Sans) do not carry: CJK, kana, hangul, Thai, Arabic
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Arabic}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const LEVEL_NAME: Record<Level, string> = { calm: "Calm", watch: "Watch", issue: "Issue", crisis: "Crisis", recovering: "Recovering" };
const LEVEL_COLOR: Record<Level, string> = { calm: "0E9F6E", watch: "D98E04", issue: "F26B4B", crisis: "E5484D", recovering: "1E5EFF" };
const LEVEL_BG: Record<Level, string> = { calm: "E6F6F0", watch: "FFF4DE", issue: "FFEEE8", crisis: "FDECEC", recovering: "EDF2FF" };
const SCOPE: Record<Issue["scope"], string> = { only_us: "Only us", category: "Whole category", mixed: "Us and some others" };
const PLATFORM: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };

/** A workspace with one brand (a profile) has no one to compare with: no scope, no competitive slide. */
const solo = (r: PrDashboardData) => r.brands.length < 2;
/** No normal level yet (the capture starts with the story): the status is not "calm", it is unknown. */
const noNorm = (r: PrDashboardData) => r.status.baseline.neg_pct == null && r.status.level === "calm";
const levelName = (r: PrDashboardData) => (noNorm(r) ? "No norm yet" : LEVEL_NAME[r.status.level]);
/** Where labelled posts are counted with the comments (a profile), the words say so. */
const saidOf = (r: PrDashboardData) => (r.voice_posts > 0 ? "posts and comments" : "comments");
const reachOf = (v: number | null) => (v == null ? "not reported" : compact(v));
const NO_NORM_COLOR = "94A3B8", NO_NORM_BG = "F1F5F9";

// ------------------------------------------------------------------- facts
/** The report for one period (the latest the data fully covers by default) and the period before it. */
export async function reputationReport(ws: string, o: { title: string; grain: Grain; spec: RepSpec; period?: string; asOf: string; role?: RoleModel }): Promise<ReputationReport> {
  const period = o.period ? deckPeriod(o.grain, o.period) : latestComplete(o.grain, o.asOf);
  const previous = shiftPeriod(period, -1);
  const d = await reputationFacts(ws, { focus: o.spec.focus, from: period.from, to: period.to, platform: o.spec.platform, prev: { from: previous.from, to: previous.to } }, o.role ?? PR, new SkillDb());
  if (!d) throw new Error("this workspace has no brands to report on");
  if (!d.kpis.mentions.now && !d.kpis.comments.now) throw new Error(`no posts or comments about ${d.focus.name} in ${period.label}`);
  // a slide with nothing it could measure here stays out: the competitors need a second brand, service needs comment themes
  const slides = o.spec.slides.filter((k) => !(k === "competitive" && solo(d)) && !(k === "service" && !d.service.measured));
  return { ...d, title: o.title, grain: o.grain, period, previous, slides };
}

// -------------------------------------------------------------- fact sheet
const quoteLine = (q: Quote) => `"${q.text.slice(0, 220)}"${q.translation && q.translation !== q.text ? ` (${q.translation.slice(0, 200)})` : ""} [${PLATFORM[q.platform] ?? q.platform}, ${int(q.likes)} likes]`;

/** Every fact the deck prints, as the deck prints it: what the writer and Ask AI read. */
export function repSheet(r: ReputationReport): string {
  const k = r.kpis;
  const out: string[] = [];
  const who = r.focus.name;
  out.push(`Reputation report for ${who}${r.focus.is_client ? " (our brand)" : ""}: ${r.period.label}, against ${r.previous.label}. Platforms: ${r.filters.platform === "all" ? r.platforms.map((p) => PLATFORM[p] ?? p).join(", ") : PLATFORM[r.filters.platform] ?? r.filters.platform}.`);
  const said = saidOf(r);
  out.push(`\n## Status on ${r.status.day ? dayMonth(r.status.day.d) : "–"}: ${levelName(r)}`);
  out.push(r.status.reason);
  out.push(`Days in the period by status: ${Object.entries(r.status.history.filter((h) => h.d >= r.period.from && h.d <= r.period.to).reduce<Record<string, number>>((a, h) => ({ ...a, [LEVEL_NAME[h.level]]: (a[LEVEL_NAME[h.level]] ?? 0) + 1 }), {})).map(([l, n]) => `${l} ${n}`).join(", ")}.`);
  out.push(`\n## Headline numbers (this period; previous; change)`);
  out.push(`- Mentions (posts about ${who}): ${int(k.mentions.now ?? 0)}; ${int(k.mentions.prev ?? 0)}; ${change(k.mentions.now ?? 0, k.mentions.prev ?? 0)}`);
  out.push(k.reach.now == null ? `- Reach: not reported (these platforms report no views)` : `- Reach (views of those posts): ${compact(k.reach.now)}; ${compact(k.reach.prev)}; ${change(k.reach.now ?? 0, k.reach.prev ?? 0)}`);
  out.push(`- ${r.voice_posts > 0 ? `Posts and comments (${int(r.voice_posts)} posts with a stance, and the comments under posts)` : "Comments"}: ${int(k.comments.now ?? 0)}; ${int(k.comments.prev ?? 0)}; ${change(k.comments.now ?? 0, k.comments.prev ?? 0)}`);
  out.push(`- Negative share of ${said}: ${pct(k.neg_pct.now)}; ${pct(k.neg_pct.prev)}; ${pts(k.neg_pct.now, k.neg_pct.prev)}`);
  out.push(`- CSAT (1 to 5): ${k.csat.now?.toFixed(2) ?? "–"}; ${k.csat.prev?.toFixed(2) ?? "–"}`);
  out.push(`- Purchase intent share of comments: ${pct(k.intent_pct.now)}; ${pct(k.intent_pct.prev)}; ${pts(k.intent_pct.now, k.intent_pct.prev)}`);
  out.push(`\n## Issues (topics carrying ${who}'s negative ${said})`);
  if (!r.issues.length) out.push(`None: no topic carried enough negative ${said} to call an issue.`);
  for (const i of r.issues) {
    out.push(`- ${i.topic}: ${int(i.negative)} negative ${said} (${int(i.negative_prev)} before, ${change(i.negative, i.negative_prev)}), ${pct(i.neg_pct)} of ${int(i.comments)} ${said} on it${solo(r) ? "" : `; other brands ${pct(i.industry.neg_pct)}. Scope: ${SCOPE[i.scope]}${i.industry.brands_up.length ? ` (also hit: ${i.industry.brands_up.join(", ")})` : ""}`}. Stage: ${i.stage}. Peak ${i.peak_day ? dayMonth(i.peak_day) : "–"}. Platforms: ${i.platforms.map((p) => `${PLATFORM[p.platform] ?? p.platform} ${int(p.negative)}`).join(", ")}. Themes: ${i.themes.map((t) => `${t.theme} ${int(t.n)}`).join(", ") || "–"}.`);
    for (const q of i.quotes.slice(0, 2)) out.push(`  - quote: ${quoteLine(q)}`);
    for (const p of i.posts.slice(0, 2)) out.push(`  - post: @${p.handle ?? "unknown"} on ${PLATFORM[p.platform] ?? p.platform}${p.source === "owned" ? " (our own post)" : ""}, ${p.views != null ? `${compact(p.views)} views` : `${int(p.likes ?? 0)} likes`}${p.stance ? `, ${p.stance === "negative" ? "against" : p.stance === "positive" ? "defending" : "neutral"}` : ""}, ${int(p.negative)} negative of ${int(p.comments)} comments under it: ${p.caption.slice(0, 160)}`);
  }
  out.push(`\n## Narratives (topics of the ${said} about ${who}; share; change in volume; negative share and its change; CSAT)`);
  for (const x of r.narratives.filter((x) => x.comments > 0)) out.push(`- ${x.catch_all ? `${x.topic} (no topic fits)` : x.topic}: ${int(x.comments)} ${said}, ${pct(x.share)}, ${change(x.comments, x.comments_prev)}; negative ${pct(x.neg_pct)} (${pts(x.neg_pct, x.neg_pct_prev)}); CSAT ${x.csat?.toFixed(2) ?? "–"}${x.quote ? `; e.g. ${quoteLine(x.quote)}` : ""}`);
  if (!solo(r)) out.push(`\n## Competitive reputation (posts; share of voice; reach; comments; negative share and change; CSAT; purchase intent)`);
  if (!solo(r)) for (const b of r.competitive) out.push(`- ${b.name}${b.is_focus ? " (this report)" : ""}: ${int(b.posts)}; ${pct(b.sov)}; ${compact(b.views)}; ${int(b.comments)}; ${pct(b.neg_pct)} (${pts(b.neg_pct, b.neg_pct_prev)}); ${b.csat?.toFixed(2) ?? "–"}; ${pct(b.intent_pct)}${b.top_issue ? `; issue building: ${b.top_issue.topic}, ${int(b.top_issue.negative)} negative (${change(b.top_issue.negative, b.top_issue.negative_prev)})` : ""}`);
  const ampViews = r.amplifiers.some((a) => a.views > 0);
  out.push(`\n## Amplifiers (accounts whose posts about ${who} reached most people; ${ampViews ? "reach" : "likes (no views reported)"}; comments; ${ampViews ? "negative share" : "their posts against us"})`);
  for (const a of r.amplifiers) out.push(`- @${a.handle} (${PLATFORM[a.platform] ?? a.platform}${a.followers ? `, ${compact(a.followers)} followers` : ""}): ${ampViews ? compact(a.views) : `${int(a.likes)} likes`}; ${int(a.comments)}; ${a.neg_pct != null ? pct(a.neg_pct) : a.stanced ? `${int(a.against)} of ${int(a.stanced)} posts against` : "–"}`);
  out.push(`\n## Own channels (${who}'s own posts; posts; comments; negative share; other brands' own posts negative share; brand replies)`);
  for (const o of r.own) out.push(`- ${PLATFORM[o.platform] ?? o.platform}: ${int(o.posts)}; ${int(o.comments)}; ${pct(o.neg_pct)}; ${pct(o.others_neg_pct)}; ${int(o.replies)}`);
  if (!r.own.length) out.push("- no own posts tracked in the period");
  if (r.service.measured) {
    out.push(`\n## For customer service: ${int(r.service.total)} service complaints (payments, refunds, accounts, the app)`);
    for (const q of r.service.quotes.slice(0, 4)) out.push(`- ${quoteLine(q)}`);
  }
  if (r.notes.length) out.push(`\n## Caveats\n${r.notes.map((n) => `- ${n}`).join("\n")}`);
  return out.join("\n");
}

// ------------------------------------------------------------- the words
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const LIMITS = { headline: 14, block: 45, read: 50, response: 35, takeaway: 40 };

/** Numbers the deck prints, read back the way prose writes them. */
function pool(r: ReputationReport) {
  return numbersIn(repSheet(r));
}

/** Problems with the words for this report; empty when they are fit to print. */
export function checkRep(n: RepNarrative, r: ReputationReport): string[] {
  const out: string[] = [];
  const has = new Set(r.slides);
  const lim = (label: string, s: string | undefined, max: number) => {
    if (!s || !s.trim()) out.push(`${label} is empty`);
    else if (words(s) > max) out.push(`${label} has ${words(s)} words; at most ${max}`);
  };
  lim("summary.headline", n.summary?.headline, LIMITS.headline);
  lim("summary.happened", n.summary?.happened, LIMITS.block);
  lim("summary.means", n.summary?.means, LIMITS.block);
  lim("summary.next", n.summary?.next, LIMITS.block);
  if (has.has("issues") || has.has("issue_detail")) {
    if ((n.issues?.length ?? 0) !== r.issues.length) out.push(`issues must have ${r.issues.length} entries, one per issue in the fact sheet, in its order`);
    r.issues.forEach((i, k) => {
      const x = n.issues?.[k];
      if (!x) return;
      if (x.topic !== i.topic) out.push(`issues[${k}].topic must be "${i.topic}"`);
      lim(`issues[${k}].read`, x.read, LIMITS.read);
      lim(`issues[${k}].response`, x.response, LIMITS.response);
    });
  }
  if (has.has("narratives")) lim("narratives", n.narratives, LIMITS.takeaway);
  if (has.has("competitive")) lim("competitive", n.competitive, LIMITS.takeaway);
  if (has.has("voices")) lim("voices", n.voices, LIMITS.takeaway);
  if (has.has("service")) lim("service", n.service, LIMITS.takeaway);
  const known = pool(r);
  const prose = [n.summary?.headline, n.summary?.happened, n.summary?.means, n.summary?.next, ...(n.issues ?? []).flatMap((x) => [x.read, x.response]), n.narratives, n.competitive, n.voices, n.service].filter(Boolean).join("\n");
  for (const x of numbersIn(prose)) {
    if (x.unit === "" && Number.isInteger(x.value) && x.value <= 10) continue; // "two topics", "3 platforms"
    const ok = known.some((k) => k.unit === x.unit && (k.value === x.value || Number(k.value.toFixed(x.decimals)) === x.value || Math.round(k.value) === x.value && x.decimals === 0));
    if (!ok) out.push(`"${x.raw}" is not a number on the slides; use the fact sheet's numbers exactly as printed`);
  }
  return out;
}

/** The words when the model is unavailable or keeps failing the check: plain sentences from the facts. */
export function plainRep(r: ReputationReport): RepNarrative {
  const k = r.kpis;
  const who = r.focus.name;
  const only = solo(r) ? undefined : r.issues.find((i) => i.scope === "only_us" && !i.catch_all);
  const top = only ?? r.issues.find((i) => !i.catch_all) ?? r.issues[0];
  const lv = r.status.level;
  const said = saidOf(r);
  const respond = (i: Issue) =>
    solo(r) ? `Prepare a line for spokespeople on ${i.topic === "Not in a topic" ? "this" : i.topic} and watch whether it keeps growing.`
    : i.scope === "only_us" ? `Ours alone: find the cause with the ${i.topic === "Not in a topic" ? "product" : i.topic} owners and prepare a holding statement.`
    : i.scope === "category" ? "A category complaint: no statement needed; brief customer service and watch our share against the others."
    : "Watch it against the brands also hit; prepare a line in case it grows.";
  const sorted = [...r.competitive].filter((b) => b.neg_pct != null).sort((a, b) => (a.neg_pct ?? 0) - (b.neg_pct ?? 0));
  const best = sorted[0], worst = sorted.at(-1);
  const amp = r.amplifiers[0];
  const narr = r.narratives.filter((x) => !x.catch_all && x.comments > 0)[0];
  return {
    summary: {
      headline: (noNorm(r)
        ? `${who}: ${top ? `${top.topic === "Not in a topic" ? "complaints outside our topics" : top.topic} leads the negative talk` : "no normal level yet to judge against"}`
        : `${who}: ${LEVEL_NAME[lv].toLowerCase()} ${r.grain === "month" ? "month" : "week"}${only ? `, but ${only.topic} complaints are ours alone` : top ? `, ${top.topic === "Not in a topic" ? "complaints outside our topics" : top.topic} leads the negative talk` : ""}`).slice(0, 120),
      happened: `${int(k.mentions.now ?? 0)} posts about ${who}${k.reach.now != null ? ` reached ${compact(k.reach.now)} views and` : ""} drew ${int(k.comments.now ?? 0)} ${said}; ${pct(k.neg_pct.now)} were negative${k.neg_pct.prev != null ? ` (${pts(k.neg_pct.now, k.neg_pct.prev)} on ${r.previous.label})` : ""}.`,
      means: only ? `${only.topic} is a complaint about ${who} alone: ${pct(only.neg_pct)} negative against ${pct(only.industry.neg_pct)} for the other brands.` : top ? `${top.topic} carries most of the negative talk${solo(r) ? "" : ", and the other brands see it too"}.` : "Nothing points to a reputation problem this period.",
      next: lv === "issue" || lv === "crisis" ? `Decide on a response to ${top?.topic ?? "the negative talk"} today and brief spokespeople.` : noNorm(r) && top ? `Decide on a response to ${top.topic}; there is no normal level yet to say how unusual this is, so read the issues on the next slides.` : only ? `Look into ${only.topic} with the team that owns it before it grows.` : "No response needed; keep watching the issues on the next slides.",
    },
    issues: r.issues.map((i) => ({
      topic: i.topic,
      read: `${int(i.negative)} negative ${said} (${change(i.negative, i.negative_prev)}), ${pct(i.neg_pct)} of ${said} on it${solo(r) ? "" : ` against ${pct(i.industry.neg_pct)} for the other brands`}; mostly on ${i.platforms.slice(0, 2).map((p) => PLATFORM[p.platform] ?? p.platform).join(" and ")}.`,
      response: respond(i),
    })),
    narratives: narr ? `${narr.topic} is the largest named topic at ${pct(narr.share)} of the conversation, ${pct(narr.neg_pct)} negative.` : "No topic stands out this period.",
    competitive: best && worst ? `${best.name} has the lowest negative share at ${pct(best.neg_pct)}; ${worst.name} the highest at ${pct(worst.neg_pct)}.` : "Not enough comments to compare the brands.",
    voices: amp ? `@${amp.handle} on ${PLATFORM[amp.platform] ?? amp.platform} reached the most people with ${amp.views > 0 ? `${compact(amp.views)} views` : `${int(amp.likes)} likes`}.` : "No creator posts about us this period.",
    service: `${int(r.service.total)} complaints belong with customer service, not with PR.`,
  };
}

const TOOL = "write_reputation_deck";
const s40 = (d: string) => ({ type: "string", description: d });

function repTool(r: ReputationReport): Anthropic.Tool {
  return {
    name: TOOL,
    description: "Write the words of the reputation deck. Every number must come from the fact sheet, exactly as printed.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "object", properties: {
          headline: s40(`The deck's headline: the one thing management must know, at most ${LIMITS.headline} words.`),
          happened: s40(`What happened this period, at most ${LIMITS.block} words.`),
          means: s40(`What it means for ${r.focus.name}'s reputation (ours alone, or the category's), at most ${LIMITS.block} words.`),
          next: s40(`What the PR team should do next, at most ${LIMITS.block} words; say so when no response is the right call.`),
        }, required: ["headline", "happened", "means", "next"] },
        issues: { type: "array", description: `One entry per issue in the fact sheet, in its order (${r.issues.length}).`, items: { type: "object", properties: {
          topic: s40("The issue's topic exactly as in the fact sheet."),
          read: s40(`What is going on, in plain words with its numbers, at most ${LIMITS.read} words.`),
          response: s40(`The recommended response, at most ${LIMITS.response} words.`),
        }, required: ["topic", "read", "response"] } },
        narratives: s40(`One takeaway on the narratives, at most ${LIMITS.takeaway} words.`),
        competitive: s40(`One takeaway on reputation against the competitors, at most ${LIMITS.takeaway} words.`),
        voices: s40(`One takeaway on amplifiers and own channels, at most ${LIMITS.takeaway} words.`),
        service: s40(`One line on the customer-service complaints, at most ${LIMITS.takeaway} words.`),
      },
      required: ["summary", "issues", "narratives", "competitive", "voices", "service"],
    },
  } as Anthropic.Tool;
}

function repSystem(r: ReputationReport, role: RoleModel): string {
  return [
    `You write the words of a ${r.grain === "month" ? "monthly" : "weekly"} reputation deck for ${r.focus.name}'s PR team, for them to send to management. ${role.voice.replace(/\{\{client\}\}/g, r.focus.name)}`,
    "The numbers are already on the slides. Use only numbers from the fact sheet, written exactly as it prints them (1.2M, 16.1%, +2.7 pt); never compute a new one, never round differently. Quote comments only from the fact sheet.",
    "Write in plain English, short sentences, no jargon, no hype. Name the platform when it matters. Say clearly whether an issue is about us alone or the whole category, and when no response is the right call.",
    "Never mention tools, analyses, skills or how the data was made.",
    ...(solo(r) ? [`${r.focus.name} is the only brand watched here: never compare with other brands or the category, and leave the competitive and service lines short.`] : []),
    ...(noNorm(r) ? ["There is no normal level to compare with yet (the capture starts with this story): never call the period calm; say how much of the talk is negative and what it is about."] : []),
    ...(r.voice_posts > 0 ? ["Posts by other accounts carry a stance and are counted with the comments: call them posts and comments, not comments."] : []),
  ].join("\n\n");
}

type Create = (p: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
export type RepWritten = { narrative: RepNarrative; by: "model" | "fallback"; attempts: number; problems: string[] };

export async function writeRep(r: ReputationReport, opts: { create?: Create; role?: RoleModel; workspace?: string } = {}): Promise<RepWritten> {
  const create: Create | null = opts.create ?? (hasModelCredentials() ? (p) => anthropicClient({ workspace: opts.workspace ?? null, purpose: "pr_deck" }).messages.create(p) : null);
  let problems: string[] = [];
  let attempts = 0;
  if (create) {
    const req: Anthropic.MessageCreateParamsNonStreaming = {
      model: modelId(), max_tokens: 10000,
      system: [{ type: "text", text: repSystem(r, opts.role ?? PR), cache_control: { type: "ephemeral" } }],
      tools: [repTool(r)],
      messages: [{ role: "user", content: `Fact sheet for ${r.period.label}:\n\n${repSheet(r)}` }],
    };
    try {
      let { res, use, messages } = await toolAnswer(create, req, TOOL);
      while (attempts < 3) {
        attempts++;
        if (!use) { problems = ["no words were written (the tool was not called)"]; break; }
        const n = use.input as RepNarrative;
        problems = checkRep(n, r);
        if (!problems.length) return { narrative: n, by: "model", attempts, problems: [] };
        if (attempts >= 3) break;
        messages = [...messages, { role: "assistant", content: res.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: use.id, is_error: true, content: `Rejected. Fix these and call ${TOOL} again with all the words:\n- ${problems.join("\n- ")}` }] }];
        res = await create({ ...req, tool_choice: { type: "auto" }, messages });
        use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL);
      }
    } catch (e) {
      problems = [`model error: ${describeModelError(e)}`];
    }
  }
  return { narrative: plainRep(r), by: "fallback", attempts, problems };
}

// ---------------------------------------------------------------- slides
const cell = (o: PptxGenJS.TableCellProps = {}): PptxGenJS.TableCellProps => ({ fontFace: FONT, valign: "middle", margin: [3, 6, 3, 6], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }], ...o });
const headCell = (o: PptxGenJS.TableCellProps = {}) => cell({ ...o, border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] });

export function table(s: Slide, head: string[], rows: (string | PptxGenJS.TextProps[])[][], o: { x: number; y: number; w: number; colW: number[]; right?: number[]; size?: number; maxH?: number; bold?: number[]; mark?: number }) {
  const size = o.size ?? 10;
  const align = (i: number) => (o.right?.includes(i) ? "right" : "left") as PptxGenJS.HAlign;
  const h = head.map((t, i) => ({ text: [text(t, { fontSize: size - 0.5, bold: true, color: C.ink6 })], options: headCell({ align: align(i) }) }));
  const body = rows.map((r, ri) => r.map((c, i) => ({
    text: typeof c === "string" ? [text(c, { fontSize: size, bold: o.bold?.includes(i), color: C.ink })] : c,
    options: cell({ align: align(i), ...(ri === o.mark ? { fill: { color: C.blue05 } } : {}) }),
  })));
  const rh = Math.min(0.42, (o.maxH ?? 4.6) / Math.max(1, rows.length));
  s.addTable([h, ...body] as PptxGenJS.TableRow[], { x: o.x, y: o.y, w: o.w, colW: o.colW, rowH: [0.32, ...body.map(() => rh)] });
}

function chrome(s: Slide, r: ReputationReport, page: number) {
  frame(s, `${r.title} · ${r.period.label}`, `Fair · prepared for ${r.focus.name}'s PR team`, page);
}

/** The page frame every role deck shares: the deck and period at the top, who it is for and the page at the bottom. */
export function frame(s: Slide, top: string, bottom: string, page: number) {
  add(s, top, { x: M, y: 0.32, w: 8, h: 0.25, fontSize: 10, color: C.ink4 });
  add(s, bottom, { x: M, y: 7.08, w: 6, h: 0.22, fontSize: 9, color: C.ink4 });
  add(s, String(page), { x: W - M - 1, y: 7.08, w: 1, h: 0.22, fontSize: 9, color: C.ink4, align: "right" });
}

export const foot = (s: Slide, t: string) => add(s, t, { x: M, y: 6.62, w: CW, h: 0.36, fontSize: 9, color: C.ink4 });

export function quoteBox(s: Slide, q: Pick<Quote, "text" | "translation" | "likes" | "platform" | "url">, x: number, y: number, w: number, h: number) {
  s.addShape("rect", { x, y, w: 0.04, h, fill: { color: C.bar }, line: { color: C.bar, width: 0 } });
  const qt = plainText(q.text), qtr = q.translation ? plainText(q.translation) : null;
  const t = qt.length > 170 ? qt.slice(0, 168) + "…" : qt;
  const tr = qtr && qtr !== qt ? (qtr.length > 150 ? qtr.slice(0, 148) + "…" : qtr) : null;
  add(s, [
    text(`“${t}”`, { fontSize: 10, color: C.ink, breakLine: true }),
    ...(tr ? [text(tr, { fontSize: 8.5, italic: true, color: C.ink6, breakLine: true })] : []),
    text(`${PLATFORM[q.platform] ?? q.platform}${q.likes ? ` · ${int(q.likes)} likes` : ""} · open post`, { fontSize: 8, color: C.blue5, hyperlink: { url: q.url } }),
  ], { x: x + 0.14, y, w: w - 0.14, h, fit: "shrink" });
}

function summarySlide(pres: PptxGenJS, r: ReputationReport, n: RepNarrative, page: number) {
  const s = pres.addSlide();
  chrome(s, r, page);
  title(s, n.summary.headline, `${r.focus.name} · ${r.period.label} against ${r.previous.label}`);
  const lv = r.status.level;
  const nn = noNorm(r);
  const said = saidOf(r);
  s.addShape("roundRect", { x: M, y: 1.7, w: 3.1, h: 1.5, fill: { color: nn ? NO_NORM_BG : LEVEL_BG[lv] }, line: { color: nn ? NO_NORM_BG : LEVEL_BG[lv], width: 0 }, rectRadius: 0.1 });
  add(s, `Status on ${r.status.day ? dayMonth(r.status.day.d) : "–"}`, { x: M + 0.2, y: 1.82, w: 2.8, h: 0.25, fontSize: 10, bold: true, color: C.ink6 });
  add(s, levelName(r), { x: M + 0.2, y: 2.08, w: 2.8, h: 0.5, fontSize: nn ? 24 : 28, bold: true, color: nn ? NO_NORM_COLOR : LEVEL_COLOR[lv] });
  add(s, r.status.baseline.neg_pct != null && r.status.day?.neg_pct != null ? `${pct(r.status.day.neg_pct)} negative that day, norm ${pct(r.status.baseline.neg_pct)}` : nn && r.status.day?.neg_pct != null ? `${pct(r.status.day.neg_pct)} negative that day; no normal level to compare with yet` : `Not enough ${said} that day to judge`, { x: M + 0.2, y: 2.65, w: 2.8, h: 0.45, fontSize: 9.5, color: C.ink6 });
  const blocks: [string, string][] = [["What happened", n.summary.happened], ["What it means", n.summary.means], ["What to do next", n.summary.next]];
  blocks.forEach(([h, t], i) => {
    const x = M + 3.35 + i * 3.0;
    add(s, h, { x, y: 1.72, w: 2.85, h: 0.26, fontSize: 11, bold: true, color: C.blue });
    add(s, t, { x, y: 2.02, w: 2.85, h: 1.3, fontSize: 11, color: C.ink, fit: "shrink" });
  });
  const k = r.kpis;
  const tiles: [string, string, string][] = [
    ["Mentions", int(k.mentions.now ?? 0), change(k.mentions.now ?? 0, k.mentions.prev ?? 0)],
    ["Reach", k.reach.now == null ? "–" : compact(k.reach.now), k.reach.now == null ? "not reported;" : change(k.reach.now ?? 0, k.reach.prev ?? 0)],
    [r.voice_posts > 0 ? "Posts and comments" : "Comments", int(k.comments.now ?? 0), change(k.comments.now ?? 0, k.comments.prev ?? 0)],
    ["Negative", pct(k.neg_pct.now), pts(k.neg_pct.now, k.neg_pct.prev)],
    ["CSAT", k.csat.now?.toFixed(2) ?? "–", k.csat.now != null && k.csat.prev != null ? `${k.csat.now - k.csat.prev >= 0 ? "+" : "−"}${Math.abs(k.csat.now - k.csat.prev).toFixed(2)}` : "–"],
    ["Purchase intent", pct(k.intent_pct.now), pts(k.intent_pct.now, k.intent_pct.prev)],
  ];
  const tw = (CW - 0.15 * 5) / 6;
  tiles.forEach(([l, v, d], i) => {
    const x = M + i * (tw + 0.15);
    s.addShape("roundRect", { x, y: 3.6, w: tw, h: 1.35, fill: { color: C.white }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
    add(s, l, { x: x + 0.15, y: 3.72, w: tw - 0.3, h: 0.25, fontSize: 10, bold: true, color: C.ink6 });
    add(s, v, { x: x + 0.15, y: 3.98, w: tw - 0.3, h: 0.5, fontSize: 24, bold: true, color: C.ink });
    add(s, d === "not reported;" ? "not reported" : `${d} vs before`, { x: x + 0.15, y: 4.52, w: tw - 0.3, h: 0.25, fontSize: 9.5, color: C.ink6 });
  });
  const issues = r.issues.slice(0, 4);
  if (issues.length) {
    add(s, "Issues this period", { x: M, y: 5.2, w: 4, h: 0.26, fontSize: 11, bold: true, color: C.ink6 });
    issues.forEach((i, j) => {
      const x = M + j * (CW / issues.length);
      if (!solo(r)) chip(s, SCOPE[i.scope], x, 5.55, { fill: i.scope === "only_us" ? "FFEEE8" : C.blue05, color: i.scope === "only_us" ? "C2410C" : C.blue });
      add(s, [text(i.topic, { fontSize: 12, bold: true, color: C.ink, breakLine: true }), text(`${int(i.negative)} negative · ${pct(i.neg_pct)} of ${said}`, { fontSize: 10, color: C.ink6 })], { x, y: 5.9, w: CW / issues.length - 0.2, h: 0.6 });
    });
  }
  foot(s, `${r.voice_posts > 0 ? `Posts about ${r.focus.name} that carry a stance, and the comments under posts` : `Comments about ${r.focus.name} under posts that name the brand or are its own`}; the brand's own replies are left out. Negative = share of labelled ${said}. Status: ${r.status.rule}`);
  s.addNotes(`${n.summary.headline}\n${n.summary.happened}\n${n.summary.means}\n${n.summary.next}`);
}

function timelineSlide(pres: PptxGenJS, r: ReputationReport, n: RepNarrative, page: number) {
  const s = pres.addSlide();
  chrome(s, r, page);
  title(s, "Status, day by day", r.status.reason);
  const days = r.status.history;
  const x0 = M, w = CW, slot = w / Math.max(1, days.length);
  const max = Math.max(1, ...days.map((d) => d.neg_pct ?? 0));
  const top = 2.0, h = 3.2;
  s.addShape("line", { x: x0, y: top + h, w, h: 0, line: { color: C.line, width: 0.75 } });
  days.forEach((d, i) => {
    const x = x0 + i * slot;
    const bh = ((d.neg_pct ?? 0) / max) * (h - 0.3);
    const inPeriod = d.d >= r.period.from && d.d <= r.period.to;
    s.addShape("rect", { x: x + slot * 0.18, y: top + h - bh, w: slot * 0.64, h: Math.max(0.01, bh), fill: { color: inPeriod ? "F26B4B" : "F7B9A8" }, line: { color: "FFFFFF", width: 0 } });
    s.addShape("rect", { x: x + slot * 0.1, y: top + h + 0.12, w: slot * 0.8, h: 0.2, fill: { color: d.norm ? LEVEL_COLOR[d.level] : NO_NORM_COLOR }, line: { color: "FFFFFF", width: 0 } });
    if (i % Math.ceil(days.length / 10) === 0 || i === days.length - 1) add(s, dayMonth(d.d), { x, y: top + h + 0.38, w: slot * 3, h: 0.22, fontSize: 8.5, color: C.ink4 });
  });
  add(s, `Bars: negative share of ${saidOf(r)} about ${r.focus.name} each day (highest ${pct(max)}); darker bars are ${r.period.label}. Strip: the status that day${days.some((d) => !d.norm) ? "; grey where there was no normal level yet" : ""}.`, { x: M, y: 1.62, w: CW, h: 0.3, fontSize: 10, color: C.ink6 });
  const legend: [string, string][] = (["calm", "watch", "issue", "crisis", "recovering"] as Level[]).map((l) => [LEVEL_NAME[l], LEVEL_COLOR[l]]);
  if (days.some((d) => !d.norm)) legend.push(["No norm yet", NO_NORM_COLOR]);
  legend.forEach(([l, c], i) => {
    s.addShape("rect", { x: M + i * 1.6, y: 6.1, w: 0.22, h: 0.16, fill: { color: c }, line: { color: "FFFFFF", width: 0 } });
    add(s, l, { x: M + i * 1.6 + 0.3, y: 6.06, w: 1.2, h: 0.24, fontSize: 9.5, color: C.ink6 });
  });
  foot(s, r.status.rule);
  s.addNotes(r.status.reason);
}

function issueCard(s: Slide, r: ReputationReport, i: Issue, n: RepNarrative["issues"][number] | undefined, x: number, y: number, w: number, h: number) {
  s.addShape("roundRect", { x, y, w, h, fill: { color: C.white }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
  add(s, i.topic, { x: x + 0.18, y: y + 0.14, w: w - 0.36, h: 0.32, fontSize: 14, bold: true, color: C.ink, fit: "shrink" });
  let cx = x + 0.18;
  if (!solo(r)) cx += chip(s, SCOPE[i.scope], cx, y + 0.52, { fill: i.scope === "only_us" ? "FFEEE8" : C.blue05, color: i.scope === "only_us" ? "C2410C" : C.blue }) + 0.08;
  chip(s, i.stage.charAt(0).toUpperCase() + i.stage.slice(1), cx, y + 0.52, { fill: "F1F5F9", color: C.ink6 });
  add(s, [text(int(i.negative), { fontSize: 22, bold: true, color: C.ink, breakLine: true }), text(`negative, ${change(i.negative, i.negative_prev)}`, { fontSize: 9, color: C.ink6 })], { x: x + 0.18, y: y + 0.92, w: w / 2 - 0.2, h: 0.7 });
  add(s, [text(pct(i.neg_pct), { fontSize: 22, bold: true, color: C.ink, breakLine: true }), text(solo(r) ? `of ${int(i.comments)} ${saidOf(r)}` : `others ${pct(i.industry.neg_pct)}`, { fontSize: 9, color: C.ink6 })], { x: x + w / 2, y: y + 0.92, w: w / 2 - 0.2, h: 0.7 });
  add(s, n?.read ?? "", { x: x + 0.18, y: y + 1.72, w: w - 0.36, h: 1.05, fontSize: 10.5, color: C.ink, fit: "shrink" });
  if (i.quotes[0]) quoteBox(s, i.quotes[0], x + 0.18, y + 2.85, w - 0.36, 1.05);
  add(s, [text("Response: ", { fontSize: 10, bold: true, color: C.blue }), text(n?.response ?? "", { fontSize: 10, color: C.ink })], { x: x + 0.18, y: y + h - 0.85, w: w - 0.36, h: 0.72, fit: "shrink" });
}

function issuesSlide(pres: PptxGenJS, r: ReputationReport, n: RepNarrative, page: number) {
  const s = pres.addSlide();
  chrome(s, r, page);
  const list = r.issues.slice(0, 3);
  title(s, list.length ? "Issues building" : "No issue building", list.length ? `The topics carrying ${r.focus.name}'s negative ${saidOf(r)} in ${r.period.label}${solo(r) ? "" : ", and whether each is ours alone"}` : `No topic carried enough negative ${saidOf(r)} about ${r.focus.name} to call an issue.`);
  const gap = 0.2, w = list.length ? (CW - gap * (list.length - 1)) / list.length : CW;
  list.forEach((i, k) => issueCard(s, r, i, n.issues[k], M + k * (w + gap), 1.7, w, 4.8));
  foot(s, `${solo(r) ? "" : "Only us: our negative share on the topic is at least one and a half times the other brands'. Whole category: the other brands see the same or worse. "}Stage compares the last three days with the three before.`);
}

function issueDetailSlides(pres: PptxGenJS, r: ReputationReport, n: RepNarrative, start: number): number {
  let page = start;
  r.issues.forEach((i, k) => {
    const s = pres.addSlide();
    chrome(s, r, page++);
    title(s, solo(r) ? i.topic : `${i.topic}: ${SCOPE[i.scope].toLowerCase()}`, n.issues[k]?.read);
    // daily negative comments
    const max = Math.max(1, ...i.daily.map((d) => d.negative));
    const slot = 6 / Math.max(1, i.daily.length);
    add(s, `Negative ${saidOf(r)} per day`, { x: M, y: 1.75, w: 6, h: 0.25, fontSize: 10, bold: true, color: C.ink6 });
    i.daily.forEach((d, j) => {
      const bh = (d.negative / max) * 1.8;
      s.addShape("rect", { x: M + j * slot + slot * 0.15, y: 4.0 - bh, w: slot * 0.7, h: Math.max(0.01, bh), fill: { color: "F26B4B" }, line: { color: "FFFFFF", width: 0 } });
      if (j % Math.ceil(i.daily.length / 8) === 0) add(s, dayMonth(d.d), { x: M + j * slot, y: 4.05, w: slot * 3, h: 0.2, fontSize: 8, color: C.ink4 });
    });
    add(s, [
      text("Where: ", { fontSize: 10, bold: true, color: C.ink6 }), text(i.platforms.map((p) => `${PLATFORM[p.platform] ?? p.platform} ${int(p.negative)}`).join(" · ") || "–", { fontSize: 10, color: C.ink, breakLine: true }),
      text("Themes: ", { fontSize: 10, bold: true, color: C.ink6 }), text(i.themes.map((t) => `${t.theme} ${int(t.n)}`).join(" · ") || "–", { fontSize: 10, color: C.ink, breakLine: true }),
      ...(solo(r) ? [] : [text("Also hit: ", { fontSize: 10, bold: true, color: C.ink6 }), text(i.industry.brands_up.join(", ") || "no other brand", { fontSize: 10, color: C.ink })]),
    ], { x: M, y: 4.4, w: 6, h: 1.0 });
    add(s, [text("Response: ", { fontSize: 11, bold: true, color: C.blue }), text(n.issues[k]?.response ?? "", { fontSize: 11, color: C.ink })], { x: M, y: 5.5, w: 6, h: 0.9, fit: "shrink" });
    const rx = M + 6.4, rw = CW - 6.4;
    add(s, "In their words", { x: rx, y: 1.75, w: rw, h: 0.25, fontSize: 10, bold: true, color: C.ink6 });
    i.quotes.slice(0, 3).forEach((q, j) => quoteBox(s, q, rx, 2.05 + j * 1.05, rw, 0.95));
    add(s, "Where it happens", { x: rx, y: 5.25, w: rw, h: 0.25, fontSize: 10, bold: true, color: C.ink6 });
    add(s, i.posts.slice(0, 2).flatMap((p) => [text(`@${p.handle ?? "unknown"}${p.source === "owned" ? " (our post)" : ""}`, { fontSize: 10, bold: true, color: C.blue5, hyperlink: { url: p.url } }), text(` ${PLATFORM[p.platform] ?? p.platform} · ${p.views != null ? `${compact(p.views)} views` : `${int(p.likes ?? 0)} likes`}${p.stance ? ` · ${p.stance === "negative" ? "against" : p.stance === "positive" ? "defending" : "neutral"}` : ""}${p.comments ? ` · ${int(p.negative)} negative of ${int(p.comments)} comments` : ""}: ${plainText(p.caption).slice(0, 90)}`, { fontSize: 9, color: C.ink6, breakLine: true })]), { x: rx, y: 5.52, w: rw, h: 1.0, fit: "shrink" });
    foot(s, `${r.period.label}. Negative ${saidOf(r)} on this topic about ${r.focus.name}${solo(r) ? "" : "; other brands' share from the same topic"}.`);
  });
  return page;
}

function narrativesSlide(pres: PptxGenJS, r: ReputationReport, n: RepNarrative, page: number) {
  const s = pres.addSlide();
  chrome(s, r, page);
  title(s, `What people say about ${r.focus.name}`, n.narratives);
  const rows = r.narratives.filter((x) => x.comments > 0).slice(0, 9);
  table(s, ["Topic", r.voice_posts > 0 ? "Posts + comments" : "Comments", "Share", "Change", "Negative", "vs before", "CSAT", "In their words"],
    rows.map((x) => [x.catch_all ? `${x.topic} (no topic fits)` : x.topic, int(x.comments), pct(x.share), change(x.comments, x.comments_prev), pct(x.neg_pct), pts(x.neg_pct, x.neg_pct_prev), x.csat?.toFixed(2) ?? "–", x.quote ? `“${plainText(x.quote.text).slice(0, 90)}${plainText(x.quote.text).length > 90 ? "…" : ""}”` : "–"]),
    { x: M, y: 1.7, w: CW, colW: [2.1, 0.95, 0.8, 0.85, 0.95, 0.9, 0.7, 5.083], right: [1, 2, 3, 4, 5, 6], bold: [0], size: 9.5 });
  foot(s, `${r.voice_posts > 0 ? "Posts and comments" : "Comments"} about ${r.focus.name} in ${r.period.label} by topic; change is against ${r.previous.label}.`);
}

function competitiveSlide(pres: PptxGenJS, r: ReputationReport, n: RepNarrative, page: number) {
  const s = pres.addSlide();
  chrome(s, r, page);
  title(s, "Reputation against the competitors", n.competitive);
  const rows = r.competitive;
  table(s, ["Brand", "Posts", "Share of voice", "Reach", "Comments", "Negative", "vs before", "CSAT", "Purchase intent", "Issue building"],
    rows.map((b) => [b.name, int(b.posts), pct(b.sov), compact(b.views), int(b.comments), pct(b.neg_pct), pts(b.neg_pct, b.neg_pct_prev), b.csat?.toFixed(2) ?? "–", pct(b.intent_pct), b.top_issue ? `${b.top_issue.topic} (${change(b.top_issue.negative, b.top_issue.negative_prev)})` : "–"]),
    { x: M, y: 1.7, w: CW, colW: [1.6, 0.8, 1.15, 0.9, 1.0, 1.0, 0.95, 0.75, 1.25, 2.933], right: [1, 2, 3, 4, 5, 6, 7, 8], bold: [0], mark: rows.findIndex((b) => b.is_focus) });
  foot(s, `${r.period.label} against ${r.previous.label}. Posts that name the brand or are its own; share of voice is of those posts. Negative and CSAT over labelled comments; purchase intent over all comments.`);
}

function voicesSlide(pres: PptxGenJS, r: ReputationReport, n: RepNarrative, page: number) {
  const s = pres.addSlide();
  chrome(s, r, page);
  title(s, "Who carried the conversation, and how our posts landed", n.voices);
  const half = (CW - 0.3) / 2;
  add(s, "Amplifiers", { x: M, y: 1.65, w: half, h: 0.26, fontSize: 11, bold: true, color: C.ink6 });
  const ampViews = r.amplifiers.some((a) => a.views > 0);
  table(s, ["Account", "Platform", ampViews ? "Reach" : "Likes", "Comments", ampViews ? "Negative" : "Stance"],
    r.amplifiers.slice(0, 8).map((a) => [[text(`@${a.handle}`, { fontSize: 10, bold: true, color: C.blue5, hyperlink: { url: a.top_url } })], PLATFORM[a.platform] ?? a.platform, ampViews ? compact(a.views) : int(a.likes), int(a.comments), a.neg_pct != null ? pct(a.neg_pct) : a.stanced === 1 ? (a.against ? "against" : "not against") : a.stanced > 1 ? `${int(a.against)} of ${int(a.stanced)} against` : "–"]),
    { x: M, y: 1.95, w: half, colW: [2.2, 1.05, 0.85, 0.9, 0.916], right: [2, 3, 4], maxH: 4.3 });
  add(s, "Own channels", { x: M + half + 0.3, y: 1.65, w: half, h: 0.26, fontSize: 11, bold: true, color: C.ink6 });
  if (r.own.length && solo(r)) table(s, ["Platform", "Posts", "Comments", "Negative", "Replies"],
    r.own.map((o) => [PLATFORM[o.platform] ?? o.platform, int(o.posts), int(o.comments), pct(o.neg_pct), int(o.replies)]),
    { x: M + half + 0.3, y: 1.95, w: half, colW: [1.5, 0.95, 1.2, 1.15, 1.116], right: [1, 2, 3, 4], maxH: 2.0 });
  else if (r.own.length) table(s, ["Platform", "Posts", "Comments", "Negative", "Other brands", "Replies"],
    r.own.map((o) => [PLATFORM[o.platform] ?? o.platform, int(o.posts), int(o.comments), pct(o.neg_pct), pct(o.others_neg_pct), int(o.replies)]),
    { x: M + half + 0.3, y: 1.95, w: half, colW: [1.2, 0.75, 1.0, 0.95, 1.1, 0.916], right: [1, 2, 3, 4, 5], maxH: 2.0 });
  else add(s, `${r.focus.name} posted nothing tracked in ${r.period.label}.`, { x: M + half + 0.3, y: 1.95, w: half, h: 0.3, fontSize: 10, color: C.ink6 });
  if (r.own_worst.length) {
    add(s, "Received worst", { x: M + half + 0.3, y: 4.35, w: half, h: 0.26, fontSize: 10, bold: true, color: C.ink6 });
    add(s, r.own_worst.slice(0, 3).flatMap((p) => [text(`${PLATFORM[p.platform] ?? p.platform}`, { fontSize: 9.5, bold: true, color: C.blue5, hyperlink: { url: p.url } }), text(` · ${int(p.negative)} negative of ${int(p.comments)}: ${plainText(p.caption).slice(0, 80)}`, { fontSize: 9, color: C.ink6, breakLine: true })]), { x: M + half + 0.3, y: 4.62, w: half, h: 1.8, fit: "shrink" });
  }
  foot(s, `Amplifiers: accounts other than the brands whose posts about ${r.focus.name} reached most people${ampViews ? "; negative = share of the comments under their posts" : " (by likes: no views reported); stance = how their own posts lean"}. Own channels: the brand's own posts${solo(r) ? "" : "; other brands = their own posts' negative share"}.`);
}

function serviceSlide(pres: PptxGenJS, r: ReputationReport, n: RepNarrative, page: number) {
  const s = pres.addSlide();
  chrome(s, r, page);
  title(s, `${int(r.service.total)} complaints for customer service`, n.service);
  const qs = r.service.quotes.slice(0, 6);
  const w = (CW - 0.3) / 2;
  qs.forEach((q, i) => quoteBox(s, q, M + (i % 2) * (w + 0.3), 1.75 + Math.floor(i / 2) * 1.5, w, 1.35));
  foot(s, "Negative comments whose theme is a payment, a refund, an account, a transfer or the app: service problems to hand over, not reputation stories.");
}

export function buildRepDeck(pres: PptxGenJS, r: ReputationReport, n: RepNarrative): void {
  let page = 1;
  for (const k of r.slides) {
    if (k === "summary") summarySlide(pres, r, n, page++);
    else if (k === "timeline") timelineSlide(pres, r, n, page++);
    else if (k === "issues") issuesSlide(pres, r, n, page++);
    else if (k === "issue_detail") page = r.issues.length ? issueDetailSlides(pres, r, n, page) : page;
    else if (k === "narratives") narrativesSlide(pres, r, n, page++);
    else if (k === "competitive") competitiveSlide(pres, r, n, page++);
    else if (k === "voices") voicesSlide(pres, r, n, page++);
    else if (k === "service") serviceSlide(pres, r, n, page++);
  }
}

export async function repPptx(r: ReputationReport, n: RepNarrative): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = `${r.title} · ${r.period.label}`;
  buildRepDeck(pres, r, n);
  return (await pres.write({ outputType: "nodebuffer" })) as Buffer;
}

export function repRecord(r: ReputationReport, n: RepNarrative) {
  return recordWith((pres) => buildRepDeck(pres as unknown as PptxGenJS, r, n));
}

export async function repPdf(r: ReputationReport, n: RepNarrative): Promise<Buffer> {
  return drawPdf(repRecord(r, n), { title: `${r.title} · ${r.period.label}` });
}

export function repSlideTexts(r: ReputationReport, n: RepNarrative): SlideText[] {
  return slideTextsOf(repRecord(r, n));
}
