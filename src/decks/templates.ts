/**
 * The decks a team can start from (Decks, DECISIONS 2 Oct 2026). A template is
 * a grain and a set of slides from the library (src/competitor/slides.ts); the
 * team picks the brands, the client (optional) and the period. Every slide can
 * be added or removed afterwards.
 */
import type { Grain } from "../competitor/period";
import type { SlideKind } from "../competitor/slides";

export type DeckTemplate = {
  key: string;
  name: string;
  /** the title printed on the slides */
  title: string;
  description: string;
  grain: Grain;
  slides: SlideKind[];
  /** what the brand picker asks for */
  brands: "watchlist" | "focus";
  recurring: boolean;
};

export const DECK_TEMPLATES: DeckTemplate[] = [
  {
    key: "weekly-pulse",
    name: "Weekly Competitor Pulse",
    title: "Weekly Competitor Pulse",
    description: "The watchlist week on week: who moved and why, creator tiers, products, posting, close-ups, patterns and the moves to make.",
    grain: "week",
    slides: ["summary", "scoreboard", "movers", "drivers", "tiers", "products", "posting", "closeups", "patterns", "moves", "portfolio", "evidence"],
    brands: "watchlist",
    recurring: true,
  },
  {
    key: "monthly-review",
    name: "Monthly review",
    title: "Monthly Competitor Review",
    description: "Month on month: the scoreboard, each brand's trend, the movers, top creators, tiers, products and close-ups.",
    grain: "month",
    slides: ["summary", "scoreboard", "trend", "movers", "drivers", "creators", "tiers", "products", "closeups", "moves", "portfolio", "evidence"],
    brands: "watchlist",
    recurring: true,
  },
  {
    key: "campaign-tracker",
    name: "Campaign tracker",
    title: "Campaign Tracker",
    description: "Follow a push week by week: the trend, the posts and creators carrying it, when it posts, and the patterns behind it.",
    grain: "week",
    slides: ["summary", "trend", "creators", "content", "posting", "patterns", "moves", "evidence"],
    brands: "focus",
    recurring: true,
  },
  {
    key: "creator-scouting",
    name: "Creator scouting",
    title: "Creator Scouting",
    description: "Who to brief next: the creators bringing the views, first-timers, tiers, the content that works, and affiliate and seeding patterns.",
    grain: "month",
    slides: ["summary", "creators", "content", "tiers", "patterns", "moves", "evidence"],
    brands: "focus",
    recurring: false,
  },
  {
    key: "competitor-deep-dive",
    name: "Competitor deep-dive",
    title: "Competitor Deep-dive",
    description: "One or two competitors up close: their trend, what they push, their own channel, creators and offers, and their best posts.",
    grain: "week",
    slides: ["summary", "scoreboard", "trend", "content", "products", "posting", "closeups", "patterns", "moves", "evidence"],
    brands: "focus",
    recurring: false,
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
  },
];

export const deckTemplate = (key: unknown) => DECK_TEMPLATES.find((t) => t.key === key) ?? null;
