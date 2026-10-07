/**
 * The decks a team can start from (Decks, DECISIONS 2 Oct 2026). A template is
 * a grain and a set of slides from the library (src/competitor/slides.ts); the
 * team picks the brands, the client (optional) and the period. Every slide can
 * be added or removed afterwards.
 */
import type { DeckGrain } from "../competitor/period";
import type { SlideKind } from "../competitor/slides";
import type { RoleId } from "../roles/model";
import type { RepSlide } from "../reputation/slides";
import type { SocialSlide } from "../social/slides";

export type DeckTemplate = {
  key: string;
  name: string;
  /** the title printed on the slides */
  title: string;
  description: string;
  grain: DeckGrain;
  slides: SlideKind[];
  /** what the brand picker asks for */
  brands: "watchlist" | "focus";
  recurring: boolean;
  /** the roles that start from it (src/roles/model.ts); a PR deck is about one brand's reputation */
  roles: RoleId[];
  /** "reputation": a PR deck (src/reputation/deck.ts); "social": a Social Media deck (src/social/deck.ts); each with its own slides */
  family?: "reputation" | "social";
  rep_slides?: RepSlide[];
  social_slides?: SocialSlide[];
};

export const DECK_TEMPLATES: DeckTemplate[] = [
  {
    key: "weekly-pulse",
    name: "Weekly Competitor Pulse",
    title: "Weekly Competitor Pulse",
    description: "The watchlist week on week: who moved and why, the campaigns running, creator tiers, products, posting, close-ups, patterns and the moves to make.",
    grain: "week",
    slides: ["summary", "scoreboard", "movers", "drivers", "campaigns", "tiers", "products", "posting", "closeups", "patterns", "moves", "portfolio", "evidence"],
    brands: "watchlist",
    recurring: true,
    roles: ["brand_kol"],
  },
  {
    key: "monthly-review",
    name: "Monthly review",
    title: "Monthly Competitor Review",
    description: "Month on month: the scoreboard, each brand's trend, the movers, top creators, campaigns, the products and angles that worked, tiers and close-ups.",
    grain: "month",
    slides: ["summary", "scoreboard", "trend", "movers", "drivers", "creators", "campaigns", "angles", "tiers", "products", "closeups", "moves", "portfolio", "evidence"],
    brands: "watchlist",
    recurring: true,
    roles: ["brand_kol"],
  },
  {
    key: "campaign-tracker",
    name: "Campaign tracker",
    title: "Campaign Tracker",
    description: "Follow a push week by week: the trend, the posts and creators carrying it, when it posts, and the patterns behind it.",
    grain: "week",
    slides: ["summary", "trend", "creators", "content", "campaigns", "angles", "posting", "patterns", "moves", "evidence"],
    brands: "focus",
    recurring: true,
    roles: ["brand_kol"],
  },
  {
    key: "creator-scouting",
    name: "Creator scouting",
    title: "Creator Scouting",
    description: "Who to brief next: the creators bringing the views, first-timers, tiers, the content that works, and affiliate and seeding patterns.",
    grain: "month",
    slides: ["summary", "creators", "content", "angles", "tiers", "patterns", "moves", "evidence"],
    brands: "focus",
    recurring: false,
    roles: ["brand_kol"],
  },
  {
    key: "competitor-deep-dive",
    name: "Competitor deep-dive",
    title: "Competitor Deep-dive",
    description: "One or two competitors up close: their trend, what they push, their own channel, creators and offers, and their best posts.",
    grain: "week",
    slides: ["summary", "scoreboard", "trend", "content", "campaigns", "angles", "products", "posting", "closeups", "patterns", "moves", "evidence"],
    brands: "focus",
    recurring: false,
    roles: ["brand_kol"],
  },
  {
    key: "blank",
    name: "Blank deck",
    title: "Deck",
    description: "Start with the summary and add the slides you want from the library.",
    grain: "week",
    slides: ["summary", "scoreboard", "moves"],
    brands: "watchlist",
    recurring: false,
    roles: ["brand_kol"],
  },
  // ---- PR (DECISIONS, 3 Oct 2026): reputation, not creators
  {
    key: "reputation-weekly",
    name: "Weekly Reputation Report",
    title: "Weekly Reputation Report",
    description: "The week for management: status, the headline numbers, the issues and whether they are ours alone, the narratives, the competitors, who carried it, and what goes to customer service.",
    grain: "week",
    slides: ["summary"],
    brands: "focus",
    recurring: true,
    roles: ["pr"],
    family: "reputation",
    rep_slides: ["summary", "timeline", "issues", "narratives", "competitive", "voices", "service"],
  },
  {
    key: "reputation-monthly",
    name: "Monthly Reputation Review",
    title: "Monthly Reputation Review",
    description: "The month for the board: status day by day, the issues with a slide each, the narratives and reputation against the competitors.",
    grain: "month",
    slides: ["summary"],
    brands: "focus",
    recurring: true,
    roles: ["pr"],
    family: "reputation",
    rep_slides: ["summary", "timeline", "issues", "issue_detail", "narratives", "competitive", "voices"],
  },
  {
    key: "issue-postmortem",
    name: "Issue Post-mortem",
    title: "Issue Post-mortem",
    description: "After an issue: how it moved day by day, where it spread, what people said, whether the category saw it too, and what reached customer service.",
    grain: "week",
    slides: ["summary"],
    brands: "focus",
    recurring: false,
    roles: ["pr"],
    family: "reputation",
    rep_slides: ["summary", "timeline", "issue_detail", "competitive", "service"],
  },
  {
    key: "crisis-report",
    name: "Crisis Report",
    title: "Crisis Report",
    description: "For a case on the move, day by day: how it spread, the pace per hour, who is talking, the issues, the sister brands and boycott calls, where the anger is, and the posts still taking comments.",
    grain: "day",
    slides: ["summary"],
    brands: "focus",
    recurring: true,
    roles: ["pr"],
    family: "reputation",
    rep_slides: ["summary", "chronology", "pace", "motion", "issues", "exposure", "narratives", "anger", "moving", "voices"],
  },
  // ---- Social Media (DECISIONS, 3 Oct 2026): the brand's own accounts
  {
    key: "content-monthly",
    name: "Monthly Content Review",
    title: "Monthly Content Review",
    description: "The month on your own accounts: what worked and what did not, each account, formats and posting times, the best and weakest posts, the competitors' own channels and the community.",
    grain: "month",
    slides: ["summary"],
    brands: "focus",
    recurring: true,
    roles: ["social"],
    family: "social",
    social_slides: ["summary", "accounts", "formats", "best", "competitors", "community"],
  },
  {
    key: "content-teardown",
    name: "Competitor Content Teardown",
    title: "Competitor Content Teardown",
    description: "One competitor's own accounts, taken apart: pick the competitor as the brand. Their formats and timing, their best and weakest posts, and what their community says.",
    grain: "month",
    slides: ["summary"],
    brands: "focus",
    recurring: false,
    roles: ["social"],
    family: "social",
    social_slides: ["summary", "accounts", "formats", "best", "community"],
  },
];

/** The templates a role starts from. */
export const templatesFor = (role: RoleId) => DECK_TEMPLATES.filter((t) => t.roles.includes(role));

export const deckTemplate = (key: unknown) => DECK_TEMPLATES.find((t) => t.key === key) ?? null;
