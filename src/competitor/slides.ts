/**
 * The slide library (Decks, DECISIONS 2 Oct 2026): every kind of slide a deck
 * can carry, in deck order. The weekly report carries its fixed set; a deck
 * carries the slides its template or its owner picked. The deck builder, the
 * narrative check, the writer's tool and the Decks page all read this list.
 */
import type { WeeklyReport } from "./types";
import { closeupPicks } from "./view";

export type SlideKind =
  | "summary" | "findings" | "scoreboard" | "trend" | "movers" | "drivers" | "creators" | "content" | "campaigns" | "angles"
  | "tiers" | "products" | "posting" | "closeups" | "patterns" | "moves" | "portfolio" | "evidence";

export type SlideInfo = {
  kind: SlideKind;
  title: string;
  description: string;
  /** how many pages it takes */
  pages: string;
  /** the summary opens every deck */
  required?: boolean;
  /** needs a client (the portfolio appendix) or a finding pinned from Chats */
  needs?: "client" | "finding";
  /** computed with the landscape facts */
  landscape?: boolean;
  /** read from captions (src/captions/) */
  captions?: boolean;
};

export const SLIDES: SlideInfo[] = [
  { kind: "summary", title: "Summary", description: "The period in three callouts: what's new, what's working, what's worth testing.", pages: "1", required: true },
  { kind: "findings", title: "Findings from Chats", description: "Analyses pinned from a conversation, run again for each period.", pages: "1 per finding", needs: "finding" },
  { kind: "scoreboard", title: "Scoreboard", description: "Posts, views and engagement rate for every watched brand against the period before, significant moves in blue.", pages: "1" },
  { kind: "trend", title: "Trend", description: "Each brand's views over the last periods, week on week or month on month, with share of voice.", pages: "1 per platform" },
  { kind: "movers", title: "Movers", description: "The brands that moved outside their own normal range, or what came closest on a quiet period.", pages: "1" },
  { kind: "drivers", title: "What's driving it", description: "One slide per mover: who posted, what, the campaign tags, own channel against creators, and the cart.", pages: "1 per mover" },
  { kind: "creators", title: "Top creators", description: "The creators who brought the most views, with their tier, brand, posts and engagement; first-timers marked.", pages: "1" },
  { kind: "content", title: "Top content", description: "The six posts that drew the most views, with caption, format and cart.", pages: "1" },
  { kind: "campaigns", title: "Campaigns and launches", description: "What each brand is running, read from captions: launches, sale events, collabs, offline events; which are new; how much carries an offer.", pages: "1", captions: true },
  { kind: "angles", title: "Products and angles", description: "The products creators talk about, the hook that brought their views and the angle of the best post, read from captions.", pages: "1", captions: true },
  { kind: "tiers", title: "Creator tiers", description: "Where each brand puts its content and where its views come from, Nano to Mega.", pages: "1", landscape: true },
  { kind: "products", title: "Products", description: "The categories creators name in captions and the products in the TikTok cart.", pages: "1", landscape: true },
  { kind: "posting", title: "Posting pattern", description: "Posts per day and hour, peaks, promo and double-date captions.", pages: "1", landscape: true },
  { kind: "closeups", title: "Competitor close-ups", description: "Two brands side by side: what they pushed, their own channel, their creators, their offers.", pages: "1–2", landscape: true },
  { kind: "patterns", title: "Patterns", description: "Clippers, one creator carrying a brand, affiliate bursts, templated captions, seeding tags.", pages: "1", landscape: true },
  { kind: "moves", title: "What to do next", description: "Three to five prioritised moves, each with the number behind it.", pages: "1" },
  { kind: "portfolio", title: "Appendix: the client's brands", description: "The client's own brands on the same measures and rule.", pages: "1", needs: "client" },
  { kind: "evidence", title: "Appendix: evidence", description: "The posts the deck cites, and how to read it.", pages: "1" },
];

export const SLIDE_KINDS: SlideKind[] = SLIDES.map((s) => s.kind);
export const LANDSCAPE_SLIDES = new Set<SlideKind>(SLIDES.filter((s) => s.landscape).map((s) => s.kind));
export const CAPTION_SLIDES = new Set<SlideKind>(SLIDES.filter((s) => s.captions).map((s) => s.kind));
export const slideInfo = (k: SlideKind) => SLIDES.find((s) => s.kind === k)!;

/** The weekly report's fixed set, before and after the landscape slides (1 Oct 2026), and with the slides read from captions (2 Oct 2026). */
const WEEKLY_V1: SlideKind[] = ["summary", "scoreboard", "movers", "drivers", "moves", "portfolio", "evidence"];
const WEEKLY_V2: SlideKind[] = ["summary", "scoreboard", "movers", "drivers", "tiers", "products", "posting", "closeups", "patterns", "moves", "portfolio", "evidence"];
const WEEKLY_V3: SlideKind[] = ["summary", "scoreboard", "movers", "drivers", "campaigns", "angles", "tiers", "products", "posting", "closeups", "patterns", "moves", "portfolio", "evidence"];

/** A deck's own pick, cleaned: known kinds, deck order, the summary always first. */
export function cleanSlides(input: unknown): SlideKind[] {
  const want = new Set((Array.isArray(input) ? input : []).filter((k): k is SlideKind => SLIDE_KINDS.includes(k as SlideKind)));
  want.add("summary");
  return SLIDE_KINDS.filter((k) => want.has(k));
}

export const hasClient = (r: WeeklyReport) => r.client_brands.length > 0;

/**
 * The slides this report carries, in order. The weekly report keeps its fixed
 * set (a landscape slide with nothing to show is skipped when drawn; the two
 * caption slides join after the drivers when the captions read name something). A deck
 * keeps what it picked, less what it cannot show: the portfolio without a
 * client, findings without a finding, a landscape slide without its data.
 */
export function deckSlides(r: WeeklyReport): SlideKind[] {
  if (!r.slides) {
    if (!r.landscape) return WEEKLY_V1;
    // the caption slides only when the captions read name something; a week with none keeps the V2 set exactly
    const K = r.captions;
    if (!K?.events.length && !K?.products.length) return WEEKLY_V2;
    return WEEKLY_V3.filter((k) => (k === "campaigns" ? K.events.length > 0 : k === "angles" ? K.products.length > 0 : true));
  }
  const L = r.landscape;
  return cleanSlides(r.slides).filter((k) => {
    if (k === "portfolio") return hasClient(r);
    if (k === "findings") return !!r.findings?.length;
    if (k === "creators") return !!r.creators?.length;
    if (k === "content") return !!r.content?.length;
    if (k === "campaigns") return !!r.captions?.events.length;
    if (k === "angles") return !!r.captions?.products.length;
    if (k === "trend") return trendPlatforms(r).length > 0;
    if (k === "tiers") return !!L?.tiers.rows.length;
    if (k === "products") return !!L?.products.length;
    if (k === "posting") return !!L?.posting.posts;
    if (k === "closeups") return closeupPicks(r).length > 0;
    if (k === "patterns") return !!L?.patterns.length;
    return true;
  });
}

/** Whether a report is a deck (picked slides) rather than the weekly report's fixed set. */
export const isDeck = (r: WeeklyReport) => !!r.slides;

/** The platforms the trend slides cover: those with at least one watched brand in coverage. */
export function trendPlatforms(r: WeeklyReport) {
  return r.platforms.filter((pl) => r.watchlist.some((g) => g.cells[pl]?.covered));
}
