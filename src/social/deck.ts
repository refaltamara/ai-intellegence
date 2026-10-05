/**
 * Social Media decks (DECISIONS, 3 Oct 2026): the Monthly Content Review a social team sends
 * up, and the Competitor Content Teardown (the same deck with a competitor in focus). Same
 * machinery as the other decks (PptxGenJS layout, the PDF recorder, Ask AI per slide,
 * versions in the viewer); the facts come from src/social/dashboard.ts over the deck's
 * period, the model writes only the words from a fact sheet, and every number in them must
 * be one the slides print (checkSocial), else the plain words.
 */
import type Anthropic from "@anthropic-ai/sdk";
import PptxGenJS from "pptxgenjs";
import { anthropicClient, describeModelError, toolAnswer } from "../chat/client";
import { hasModelCredentials, modelId } from "../chat/loop";
import { numbersIn } from "../competitor/narrative";
import { C, CW, M, add, text, title, type Slide } from "../competitor/draw";
import { drawPdf, recordWith, slideTextsOf, type SlideText } from "../competitor/pdfdeck";
import { deckPeriod, latestComplete, type Grain, type Period } from "../competitor/period";
import { change, compact, dayMonth, int, pct, pts } from "../competitor/view";
import { shiftPeriod } from "../dashboard/period";
import { foot, frame, plainText, quoteBox, table } from "../reputation/deck";
import { SOCIAL, type RoleModel } from "../roles/model";
import { SkillDb } from "../skills/db";
import { BAND_ORDER, socialFacts, type OwnPost, type SocialData } from "./dashboard";
import type { SocialSlide, SocialSpec } from "./slides";

export { SOCIAL_SLIDES, SOCIAL_SLIDE_KINDS, cleanSocialSlides, type SocialSlide, type SocialSpec } from "./slides";

export type SocialReport = SocialData & { title: string; grain: Grain; period: Period; previous: Period; slides: SocialSlide[] };
export type SocialNarrative = {
  summary: { headline: string; worked: string; didnt: string; next: string };
  accounts: string;
  formats: string;
  best: string;
  competitors: string;
  community: string;
};

const PLATFORM: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };
const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const times = (x: number) => (x >= 100 ? `×${int(x)}` : `×${x.toFixed(1)}`);

export async function socialReport(ws: string, o: { title: string; grain: Grain; spec: SocialSpec; period?: string; asOf: string; role?: RoleModel }): Promise<SocialReport> {
  const period = o.period ? deckPeriod(o.grain, o.period) : latestComplete(o.grain, o.asOf);
  const previous = shiftPeriod(period, -1);
  const d = await socialFacts(ws, { focus: o.spec.focus, from: period.from, to: period.to, platform: o.spec.platform, prev: { from: previous.from, to: previous.to } }, o.role ?? SOCIAL, new SkillDb());
  if (!d) throw new Error("this workspace has no brands to report on");
  if (!d.kpis.posts.now) throw new Error(`no own posts from ${d.focus.name} in ${period.label}`);
  return { ...d, title: o.title, grain: o.grain, period, previous, slides: o.spec.slides };
}

// -------------------------------------------------------------- fact sheet
const postLine = (p: OwnPost) => `${PLATFORM[p.platform] ?? p.platform} @${p.handle ?? "own"} ${p.format}, ${dayMonth(p.posted_at)}: ${int(p.engagements)} engagements${p.views != null ? `, ${compact(p.views)} views` : ""}, ${int(p.comments)} comments${p.index != null ? `, ${times(p.index)} the account's usual` : ""}; "${plainText(p.caption).slice(0, 140)}"`;

export function socialSheet(r: SocialReport): string {
  const k = r.kpis;
  const who = r.focus.name;
  const out: string[] = [];
  out.push(`Content report for ${who}'s own accounts: ${r.period.label}, against ${r.previous.label}.${r.comparable ? "" : " The period before has too few own posts to compare."}`);
  out.push(`\n## Headline numbers (this period; previous; change)`);
  out.push(`- Posts: ${int(k.posts.now ?? 0)}; ${int(k.posts.prev ?? 0)}; ${change(k.posts.now ?? 0, k.posts.prev ?? 0)}`);
  out.push(`- Engagement: ${compact(k.engagements.now)}; ${compact(k.engagements.prev)}; ${change(k.engagements.now ?? 0, k.engagements.prev ?? 0)}`);
  out.push(`- Typical post (median engagement): ${int(k.median_eng.now ?? 0)}; ${int(k.median_eng.prev ?? 0)}`);
  out.push(`- Typical video views: ${compact(k.video_views.now)}; ${compact(k.video_views.prev)}`);
  out.push(`- Comments: ${int(k.comments.now ?? 0)}; negative ${pct(k.neg_pct.now)} (${pts(k.neg_pct.now, k.neg_pct.prev)}); reply rate ${pct(k.reply_rate.now)}`);
  out.push(`\n## Accounts (posts; a week; typical post; typical views; engagement rate; comments; negative; replies)`);
  for (const a of r.accounts) out.push(`- ${PLATFORM[a.platform] ?? a.platform} @${a.handle}: ${int(a.posts)}; ${a.per_week.toFixed(1)}; ${int(a.median_eng)}; ${a.median_views == null ? "–" : compact(a.median_views)}; ${a.er == null ? "–" : pct(a.er, 2)}; ${int(a.comments)}; ${pct(a.neg_pct)}; ${int(a.replies)}`);
  out.push(`\n## Formats (share of posts; share of engagement; typical post; typical views)`);
  for (const f of r.formats) out.push(`- ${f.format}: ${pct(f.post_share, 0)}; ${pct(f.eng_share, 0)}; ${int(f.median_eng)}; ${f.median_views == null ? "–" : compact(f.median_views)}`);
  out.push(`\n## When posts did best (day, time of day WIB: typical engagement, posts; cells with 3+ posts)`);
  for (const t of [...r.timing].filter((t) => t.median_eng != null).sort((a, b) => (b.median_eng ?? 0) - (a.median_eng ?? 0)).slice(0, 6)) out.push(`- ${DOW[t.dow]} ${t.band.toLowerCase()}: ${int(t.median_eng ?? 0)}, ${int(t.posts)} posts`);
  out.push(`\n## Best posts against their account's usual`);
  for (const p of r.best) out.push(`- ${postLine(p)}`);
  out.push(`\n## Weakest posts against their account's usual`);
  for (const p of r.weakest) out.push(`- ${postLine(p)}`);
  out.push(`\n## Competitors' own channels (posts; a week; typical post; typical views; comments; negative)`);
  for (const c of r.competitors) out.push(`- ${c.name}${c.is_focus ? " (this report)" : ""}: ${int(c.posts)}; ${c.per_week.toFixed(1)}; ${int(c.median_eng)}; ${c.median_views == null ? "–" : compact(c.median_views)}; ${int(c.comments)}; ${pct(c.neg_pct)}${c.top ? `; best post ${int(c.top.engagements)} engagements on ${PLATFORM[c.top.platform] ?? c.top.platform}` : ""}`);
  out.push(`\n## Community under ${who}'s posts (topic: comments; share; negative; purchase intent)`);
  for (const t of r.topics) out.push(`- ${t.topic}: ${int(t.comments)}; ${pct(t.share)}; ${pct(t.neg_pct)}; ${pct(t.intent_pct)}`);
  for (const q of [...r.quotes.positive.slice(0, 2), ...r.quotes.negative.slice(0, 2)]) out.push(`- comment (${q.sentiment}): "${plainText(q.text).slice(0, 200)}"${q.translation ? ` (${q.translation.slice(0, 180)})` : ""}, ${int(q.likes)} likes`);
  if (r.notes.length) out.push(`\n## Caveats\n${r.notes.map((n) => `- ${n}`).join("\n")}`);
  return out.join("\n");
}

// --------------------------------------------------------------- the words
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const LIMITS = { headline: 14, block: 45, takeaway: 40 };

export function checkSocial(n: SocialNarrative, r: SocialReport): string[] {
  const out: string[] = [];
  const has = new Set(r.slides);
  const lim = (label: string, s: string | undefined, max: number) => {
    if (!s || !s.trim()) out.push(`${label} is empty`);
    else if (words(s) > max) out.push(`${label} has ${words(s)} words; at most ${max}`);
  };
  lim("summary.headline", n.summary?.headline, LIMITS.headline);
  lim("summary.worked", n.summary?.worked, LIMITS.block);
  lim("summary.didnt", n.summary?.didnt, LIMITS.block);
  lim("summary.next", n.summary?.next, LIMITS.block);
  for (const k of ["accounts", "formats", "best", "competitors", "community"] as const) if (has.has(k)) lim(k, n[k], LIMITS.takeaway);
  const known = numbersIn(socialSheet(r));
  const prose = [n.summary?.headline, n.summary?.worked, n.summary?.didnt, n.summary?.next, n.accounts, n.formats, n.best, n.competitors, n.community].filter(Boolean).join("\n");
  for (const x of numbersIn(prose)) {
    if (x.unit === "" && Number.isInteger(x.value) && x.value <= 10) continue;
    const ok = known.some((k) => k.unit === x.unit && (k.value === x.value || Number(k.value.toFixed(x.decimals)) === x.value || (Math.round(k.value) === x.value && x.decimals === 0)));
    if (!ok) out.push(`"${x.raw}" is not a number on the slides; use the fact sheet's numbers exactly as printed`);
  }
  return out;
}

/** The words when the model is unavailable or keeps failing the check: plain sentences from the facts. */
export function plainSocial(r: SocialReport): SocialNarrative {
  const k = r.kpis;
  const who = r.focus.name;
  const lift = [...r.formats].filter((f) => f.posts >= 3 && f.eng_share != null && f.post_share != null).sort((a, b) => (b.eng_share! - b.post_share!) - (a.eng_share! - a.post_share!));
  const up = lift[0], down = lift.at(-1);
  const best = r.best[0];
  const cell = [...r.timing].filter((t) => t.median_eng != null).sort((a, b) => (b.median_eng ?? 0) - (a.median_eng ?? 0))[0];
  const acc = r.accounts[0];
  const comp = [...r.competitors].filter((c) => !c.is_focus && c.posts >= 3).sort((a, b) => b.median_eng - a.median_eng)[0];
  const topic = r.topics.find((t) => !/no topic/i.test(t.topic)) ?? r.topics[0];
  return {
    summary: {
      headline: `${who}: ${up ? `${up.format.toLowerCase()} carried the ${r.grain === "month" ? "month" : "week"}` : `${int(k.posts.now ?? 0)} posts this ${r.grain === "month" ? "month" : "week"}`}`,
      worked: up ? `${up.format} was ${pct(up.post_share, 0)} of posts and ${pct(up.eng_share, 0)} of engagement${best ? `; the best post did ${times(best.index ?? 0)} its account's usual` : ""}.` : `${int(k.posts.now ?? 0)} posts drew ${compact(k.engagements.now)} engagement.`,
      didnt: down && down !== up ? `${down.format} was ${pct(down.post_share, 0)} of posts but ${pct(down.eng_share, 0)} of engagement.` : `${pct(k.neg_pct.now)} of comments under the posts were negative.`,
      next: `${up ? `Post more ${up.format.toLowerCase()}` : "Keep the mix"}${cell ? `, and try ${DOW[cell.dow]} ${cell.band.toLowerCase()}, when the typical post drew ${int(cell.median_eng ?? 0)}` : ""}.`,
    },
    accounts: acc ? `@${acc.handle} on ${PLATFORM[acc.platform] ?? acc.platform} posted most: ${int(acc.posts)} posts, a typical post of ${int(acc.median_eng)}.` : "No own posts this period.",
    formats: up ? `${up.format} earns more than its share of posts; ${cell ? `${DOW[cell.dow]} ${cell.band.toLowerCase()} is the best slot` : "no slot stands out yet"}.` : "Not enough posts to compare formats.",
    best: best ? `The best post did ${times(best.index ?? 0)} its account's usual with ${int(best.engagements)} engagements.` : "Not enough posts per account to compare.",
    competitors: comp ? `${comp.name} has the strongest typical post among competitors at ${int(comp.median_eng)}.` : "Competitors posted little on their own accounts this period.",
    community: topic ? `${topic.topic} leads the comments with ${pct(topic.share)}, ${pct(topic.neg_pct)} negative.` : "Few comments this period.",
  };
}

const TOOL = "write_content_deck";
const s40 = (d: string) => ({ type: "string", description: d });

function socialTool(): Anthropic.Tool {
  return {
    name: TOOL,
    description: "Write the words of the content deck. Every number must come from the fact sheet, exactly as printed.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "object", properties: {
          headline: s40(`The one thing the team must know, at most ${LIMITS.headline} words.`),
          worked: s40(`What worked, at most ${LIMITS.block} words.`),
          didnt: s40(`What did not, at most ${LIMITS.block} words.`),
          next: s40(`What to post next, at most ${LIMITS.block} words.`),
        }, required: ["headline", "worked", "didnt", "next"] },
        accounts: s40(`One takeaway on the accounts, at most ${LIMITS.takeaway} words.`),
        formats: s40(`One takeaway on formats and timing, at most ${LIMITS.takeaway} words.`),
        best: s40(`One takeaway on the best and weakest posts, at most ${LIMITS.takeaway} words.`),
        competitors: s40(`One takeaway on the competitors' own channels, at most ${LIMITS.takeaway} words.`),
        community: s40(`One takeaway on the community, at most ${LIMITS.takeaway} words.`),
      },
      required: ["summary", "accounts", "formats", "best", "competitors", "community"],
    },
  } as Anthropic.Tool;
}

type Create = (p: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
export type SocialWritten = { narrative: SocialNarrative; by: "model" | "fallback"; attempts: number; problems: string[] };

export async function writeSocial(r: SocialReport, opts: { create?: Create; role?: RoleModel; workspace?: string } = {}): Promise<SocialWritten> {
  const create: Create | null = opts.create ?? (hasModelCredentials() ? (p) => anthropicClient({ workspace: opts.workspace ?? null, purpose: "social_deck" }).messages.create(p) : null);
  let problems: string[] = [];
  let attempts = 0;
  if (create) {
    const role = opts.role ?? SOCIAL;
    const req: Anthropic.MessageCreateParamsNonStreaming = {
      model: modelId(), max_tokens: 10000,
      system: [{ type: "text", text: `You write the words of a ${r.grain === "month" ? "monthly" : "weekly"} content deck about ${r.focus.name}'s own social accounts. ${role.voice.replace(/\{\{client\}\}/g, r.focus.name)}\n\nThe numbers are already on the slides. Use only numbers from the fact sheet, written exactly as it prints them; never compute a new one. Plain English, short sentences. Never mention tools, analyses or how the data was made.`, cache_control: { type: "ephemeral" } }],
      tools: [socialTool()],
      messages: [{ role: "user", content: `Fact sheet for ${r.period.label}:\n\n${socialSheet(r)}` }],
    };
    try {
      let { res, use, messages } = await toolAnswer(create, req, TOOL);
      while (attempts < 3) {
        attempts++;
        if (!use) { problems = ["no words were written (the tool was not called)"]; break; }
        const n = use.input as SocialNarrative;
        problems = checkSocial(n, r);
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
  return { narrative: plainSocial(r), by: "fallback", attempts, problems };
}

// ------------------------------------------------------------------ slides
const top = (r: SocialReport) => `${r.title} · ${r.period.label}`;
const bottom = (r: SocialReport) => `Fair · prepared for ${r.focus.name}'s social media team`;

function summarySlide(pres: PptxGenJS, r: SocialReport, n: SocialNarrative, page: number) {
  const s = pres.addSlide();
  frame(s, top(r), bottom(r), page);
  title(s, n.summary.headline, `${r.focus.name}'s own accounts · ${r.period.label} against ${r.previous.label}`);
  const blocks: [string, string][] = [["What worked", n.summary.worked], ["What did not", n.summary.didnt], ["What to post next", n.summary.next]];
  blocks.forEach(([h, t], i) => {
    const x = M + i * (CW / 3);
    add(s, h, { x, y: 1.72, w: CW / 3 - 0.3, h: 0.26, fontSize: 11, bold: true, color: C.blue });
    add(s, t, { x, y: 2.02, w: CW / 3 - 0.3, h: 1.3, fontSize: 11.5, color: C.ink, fit: "shrink" });
  });
  const k = r.kpis;
  const d = (now: number | null, prev: number | null, kind: "count" | "pct") => (!r.comparable || now == null || prev == null ? "too few before to compare" : `${kind === "count" ? change(now, prev) : pts(now, prev)} vs before`);
  const tiles: [string, string, string][] = [
    ["Posts", int(k.posts.now ?? 0), d(k.posts.now, k.posts.prev, "count")],
    ["Engagement", compact(k.engagements.now), d(k.engagements.now, k.engagements.prev, "count")],
    ["Typical post", int(k.median_eng.now ?? 0), d(k.median_eng.now, k.median_eng.prev, "count")],
    ["Typical video views", compact(k.video_views.now), d(k.video_views.now, k.video_views.prev, "count")],
    ["Negative comments", pct(k.neg_pct.now), d(k.neg_pct.now, k.neg_pct.prev, "pct")],
    ["Reply rate", pct(k.reply_rate.now), d(k.reply_rate.now, k.reply_rate.prev, "pct")],
  ];
  const tw = (CW - 0.15 * 5) / 6;
  tiles.forEach(([l, v, dd], i) => {
    const x = M + i * (tw + 0.15);
    s.addShape("roundRect", { x, y: 3.6, w: tw, h: 1.35, fill: { color: C.white }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
    add(s, l, { x: x + 0.15, y: 3.72, w: tw - 0.3, h: 0.25, fontSize: 10, bold: true, color: C.ink6 });
    add(s, v, { x: x + 0.15, y: 3.98, w: tw - 0.3, h: 0.5, fontSize: 24, bold: true, color: C.ink });
    add(s, dd, { x: x + 0.15, y: 4.52, w: tw - 0.3, h: 0.25, fontSize: 9, color: C.ink6 });
  });
  if (r.notes.length) add(s, r.notes.slice(0, 3).join(" "), { x: M, y: 5.25, w: CW, h: 1.2, fontSize: 9.5, color: C.warn, fit: "shrink" });
  foot(s, "Engagement = likes, comments, shares and saves as each platform counts them. Typical = the median post. Views only where the platform reports them (Instagram photos and carousels have none).");
}

function accountsSlide(pres: PptxGenJS, r: SocialReport, n: SocialNarrative, page: number) {
  const s = pres.addSlide();
  frame(s, top(r), bottom(r), page);
  title(s, "The accounts", n.accounts);
  table(s, ["Account", "Platform", "Posts", "A week", "Typical post", "Typical views", "Eng. rate", "Comments", "Negative", "Replies"],
    r.accounts.map((a) => [`@${a.handle}`, PLATFORM[a.platform] ?? a.platform, int(a.posts), a.per_week.toFixed(1), int(a.median_eng), a.median_views == null ? "–" : compact(a.median_views), a.er == null ? "–" : pct(a.er, 2), int(a.comments), pct(a.neg_pct), int(a.replies)]),
    { x: M, y: 1.7, w: CW, colW: [2.4, 1.2, 0.8, 0.85, 1.2, 1.25, 1.05, 1.1, 1.1, 1.383], right: [2, 3, 4, 5, 6, 7, 8, 9], bold: [0] });
  foot(s, `${r.period.label}. Engagement rate = engagement ÷ views, on posts with views.`);
}

function formatsSlide(pres: PptxGenJS, r: SocialReport, n: SocialNarrative, page: number) {
  const s = pres.addSlide();
  frame(s, top(r), bottom(r), page);
  title(s, "Formats and timing", n.formats);
  const half = (CW - 0.4) / 2;
  add(s, "Share of posts against share of engagement", { x: M, y: 1.7, w: half, h: 0.26, fontSize: 11, bold: true, color: C.ink6 });
  r.formats.slice(0, 5).forEach((f, i) => {
    const y = 2.1 + i * 0.85;
    add(s, [text(f.format, { fontSize: 12, bold: true, color: C.ink }), text(`   typical ${int(f.median_eng)}${f.median_views != null ? ` · ${compact(f.median_views)} views` : ""}`, { fontSize: 9.5, color: C.ink6 })], { x: M, y, w: half, h: 0.28 });
    const bw = half - 1.1;
    s.addShape("rect", { x: M, y: y + 0.32, w: Math.max(0.02, (bw * (f.post_share ?? 0)) / 100), h: 0.13, fill: { color: "D6E1FF" }, line: { color: "FFFFFF", width: 0 } });
    s.addShape("rect", { x: M, y: y + 0.5, w: Math.max(0.02, (bw * (f.eng_share ?? 0)) / 100), h: 0.13, fill: { color: "0FA897" }, line: { color: "FFFFFF", width: 0 } });
    add(s, `${pct(f.post_share, 0)} / ${pct(f.eng_share, 0)}`, { x: M + bw + 0.1, y: y + 0.3, w: 1.0, h: 0.35, fontSize: 9.5, color: C.ink6 });
  });
  const x2 = M + half + 0.4;
  add(s, "Typical engagement by day and time (WIB)", { x: x2, y: 1.7, w: half, h: 0.26, fontSize: 11, bold: true, color: C.ink6 });
  const rows = [1, 2, 3, 4, 5, 6, 7].map((dow) => [DOW[dow], ...BAND_ORDER.map((b) => { const c = r.timing.find((t) => t.dow === dow && t.band === b); return c?.median_eng != null ? compact(c.median_eng) : c ? `(${c.posts})` : ""; })]);
  table(s, ["", ...BAND_ORDER], rows, { x: x2, y: 2.05, w: half, colW: [0.9, ...BAND_ORDER.map(() => (half - 0.9) / BAND_ORDER.length)], right: [1, 2, 3, 4, 5], size: 9.5, maxH: 3.6 });
  foot(s, "Blue bars: share of posts; green: share of engagement. A format whose green bar is longer earns more than its share. Time cells need three or more posts; fewer show the count in brackets.");
}

function bestSlide(pres: PptxGenJS, r: SocialReport, n: SocialNarrative, page: number) {
  const s = pres.addSlide();
  frame(s, top(r), bottom(r), page);
  title(s, "What to repeat, and what to learn from", n.best);
  const half = (CW - 0.4) / 2;
  const list = (posts: OwnPost[], x: number, head: string) => {
    add(s, head, { x, y: 1.7, w: half, h: 0.26, fontSize: 11, bold: true, color: C.ink6 });
    add(s, posts.slice(0, 5).flatMap((p) => [
      text(`@${p.handle ?? "own"} · ${PLATFORM[p.platform] ?? p.platform} ${p.format}`, { fontSize: 10.5, bold: true, color: C.blue5, hyperlink: { url: p.url } }),
      text(`  ${p.index != null ? times(p.index) : "–"} usual · ${int(p.engagements)} engagements${p.views != null ? ` · ${compact(p.views)} views` : ""}`, { fontSize: 9.5, color: C.ink6, breakLine: true }),
      text(`${plainText(p.caption).slice(0, 110)}`, { fontSize: 9.5, color: C.ink, breakLine: true }),
      text(" ", { fontSize: 5, breakLine: true }),
    ]), { x, y: 2.0, w: half, h: 4.5, fit: "shrink" });
  };
  list(r.best, M, "Best against the account's usual");
  list(r.weakest, M + half + 0.4, "Weakest against the account's usual");
  foot(s, "Usual = the account's median engagement in the period; accounts with five or more measured posts.");
}

function competitorsSlide(pres: PptxGenJS, r: SocialReport, n: SocialNarrative, page: number) {
  const s = pres.addSlide();
  frame(s, top(r), bottom(r), page);
  title(s, "The competitors' own channels", n.competitors);
  table(s, ["Brand", "Posts", "A week", "Typical post", "Typical views", "Comments", "Negative", "Best post"],
    r.competitors.map((c) => [c.name, int(c.posts), c.per_week.toFixed(1), int(c.median_eng), c.median_views == null ? "–" : compact(c.median_views), int(c.comments), pct(c.neg_pct), c.top ? `${int(c.top.engagements)} · ${plainText(c.top.caption).slice(0, 60)}` : "–"]),
    { x: M, y: 1.7, w: CW, colW: [1.6, 0.8, 0.85, 1.15, 1.2, 1.05, 1.0, 4.683], right: [1, 2, 3, 4, 5, 6], bold: [0], mark: r.competitors.findIndex((c) => c.is_focus) });
  foot(s, `${r.period.label}. Own accounts only; engagement as each platform counts it.`);
}

function communitySlide(pres: PptxGenJS, r: SocialReport, n: SocialNarrative, page: number) {
  const s = pres.addSlide();
  frame(s, top(r), bottom(r), page);
  title(s, `What people say under ${r.focus.name}'s posts`, n.community);
  const half = (CW - 0.4) / 2;
  table(s, ["Topic", "Comments", "Share", "Negative", "Purchase intent"], r.topics.slice(0, 9).map((t) => [t.topic, int(t.comments), pct(t.share), pct(t.neg_pct), pct(t.intent_pct)]),
    { x: M, y: 1.7, w: half, colW: [2.2, 1.0, 0.8, 0.95, 1.016], right: [1, 2, 3, 4], maxH: 4.4 });
  const qs = [...r.quotes.positive.slice(0, 2), ...r.quotes.negative.slice(0, 2)];
  qs.forEach((q, i) => quoteBox(s, q, M + half + 0.4, 1.75 + i * 1.18, half, 1.05));
  foot(s, "The brand's own replies are left out. Quotes: the comments liked most, two positive and two negative.");
}

export function buildSocialDeck(pres: PptxGenJS, r: SocialReport, n: SocialNarrative): void {
  let page = 1;
  for (const k of r.slides) {
    if (k === "summary") summarySlide(pres, r, n, page++);
    else if (k === "accounts") accountsSlide(pres, r, n, page++);
    else if (k === "formats") formatsSlide(pres, r, n, page++);
    else if (k === "best") bestSlide(pres, r, n, page++);
    else if (k === "competitors") competitorsSlide(pres, r, n, page++);
    else if (k === "community") communitySlide(pres, r, n, page++);
  }
}

export async function socialPptx(r: SocialReport, n: SocialNarrative): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = top(r);
  buildSocialDeck(pres, r, n);
  return (await pres.write({ outputType: "nodebuffer" })) as Buffer;
}
export const socialRecord = (r: SocialReport, n: SocialNarrative) => recordWith((pres) => buildSocialDeck(pres as unknown as PptxGenJS, r, n));
export const socialPdf = (r: SocialReport, n: SocialNarrative) => drawPdf(socialRecord(r, n), { title: top(r) });
export const socialSlideTexts = (r: SocialReport, n: SocialNarrative): SlideText[] => slideTextsOf(socialRecord(r, n));
export type { Slide };
