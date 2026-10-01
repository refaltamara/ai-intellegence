/** What a Pulse card can be, pure so client components can use it (the numbers are read in ./cards.ts). */
import type { PlatformFilter } from "../dashboard/askref";
import type { ContentSort } from "../dashboard/data";

export const CARD_KINDS = ["kpi", "rankings", "trend", "tiers", "creators", "content", "tier_mix", "products", "posting", "closeup", "patterns", "skill"] as const;
/** the kinds read from the report's landscape (src/competitor/landscape.ts): one query set per brand list and period */
export const LANDSCAPE_KINDS: readonly CardKind[] = ["tier_mix", "products", "posting", "closeup", "patterns"];
export type CardKind = (typeof CARD_KINDS)[number];
export type CardSize = "s" | "m" | "l";
export type Metric = "posts" | "views" | "engagements" | "er";
export type CardConfig = {
  platform: PlatformFilter;
  brands: string[];
  /** "latest-month", "latest-week", or a fixed "2026-06" / "2026-W26" */
  period: string;
  metric?: Metric;
  sort?: ContentSort;
  by?: "views" | "comments";
  limit?: number;
  q?: string;
};
export type CardRow = { id: string; pulse_id: string; kind: CardKind; title: string | null; config: CardConfig; size: CardSize; position: number; skill_run_id: string | null };

/** What each kind is called, what it shows, its default size, and whether it needs the brand panel. */
export const KIND_INFO: Record<CardKind, { label: string; hint: string; size: CardSize; panel: boolean }> = {
  kpi: { label: "Headline number", hint: "Content, views, engagement or engagement rate, against the period before", size: "s", panel: true },
  rankings: { label: "Brand rankings", hint: "Brands by views, with growth and unusual moves", size: "l", panel: true },
  trend: { label: "Mentions over time", hint: "Weekly content or views per brand, twelve weeks", size: "l", panel: true },
  tiers: { label: "Creator tiers", hint: "Nano to mega: creators, content, reach", size: "l", panel: true },
  creators: { label: "Top creators", hint: "By views or by comments; brand accounts left out", size: "m", panel: true },
  content: { label: "Trending content", hint: "Posts by views, engagement or engagement rate", size: "l", panel: true },
  tier_mix: { label: "Tier mix by brand", hint: "Each brand's content and views by creator tier: who wins views where", size: "l", panel: true },
  products: { label: "What creators push", hint: "Product categories named in captions, and what sits in the TikTok cart", size: "l", panel: true },
  posting: { label: "Posting pattern", hint: "Posts per day, each brand's peak, promo and double-date captions, time of day", size: "l", panel: true },
  closeup: { label: "Brand close-up", hint: "One brand: what it pushed, its own channel, its creators, its offers", size: "m", panel: true },
  patterns: { label: "Patterns", hint: "Clippers, seeding tags, one creator carrying a brand, affiliate bursts", size: "l", panel: true },
  skill: { label: "Pinned analysis", hint: "An answer from Chats, kept here and refreshed on demand", size: "m", panel: false },
};

export const METRIC_LABEL: Record<Metric, string> = { posts: "Total content", views: "Views", engagements: "Engagement", er: "Engagement rate" };

