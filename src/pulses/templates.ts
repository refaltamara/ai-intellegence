/** Starting points for a new Pulse: a few points of view on the brand panel, or a blank board. */
import type { PlatformFilter } from "../dashboard/askref";
import type { CardConfig, CardKind, CardSize } from "./cards";

export type Template = { key: string; name: string; description: string; panel: boolean; cards: { kind: CardKind; size: CardSize; title?: string; config: Partial<CardConfig> }[] };

export const TEMPLATES: Template[] = [
  {
    key: "competitor-weekly", name: "Competitor weekly", panel: true,
    description: "Last week for the brands you watch: headline numbers, rankings, mentions and the posts that travelled.",
    cards: [
      { kind: "kpi", size: "s", config: { metric: "views", period: "latest-week" } },
      { kind: "kpi", size: "s", config: { metric: "posts", period: "latest-week" } },
      { kind: "kpi", size: "s", config: { metric: "er", period: "latest-week" } },
      { kind: "rankings", size: "l", config: { period: "latest-week", limit: 10 } },
      { kind: "trend", size: "l", config: { period: "latest-week", metric: "posts" } },
      { kind: "content", size: "l", config: { period: "latest-week", sort: "views", limit: 6 } },
    ],
  },
  {
    key: "campaign-tracker", name: "Campaign tracker", panel: true,
    description: "One launch or push this month: volume over time, who carried it, and the content that worked.",
    cards: [
      { kind: "kpi", size: "s", config: { metric: "posts", period: "latest-month" } },
      { kind: "kpi", size: "s", config: { metric: "views", period: "latest-month" } },
      { kind: "kpi", size: "s", config: { metric: "engagements", period: "latest-month" } },
      { kind: "trend", size: "l", config: { period: "latest-month", metric: "views" } },
      { kind: "creators", size: "m", title: "Who carried it", config: { period: "latest-month", by: "views", limit: 8 } },
      { kind: "creators", size: "m", title: "Who got people talking", config: { period: "latest-month", by: "comments", limit: 8 } },
      { kind: "content", size: "l", config: { period: "latest-month", sort: "engagement", limit: 6 } },
    ],
  },
  {
    key: "creator-scouting", name: "Creator scouting", panel: true,
    description: "Where the reach and the conversation come from: tiers, the strongest creators, and posts that over-perform.",
    cards: [
      { kind: "tiers", size: "l", config: { period: "latest-month" } },
      { kind: "creators", size: "m", config: { period: "latest-month", by: "views", limit: 10 } },
      { kind: "creators", size: "m", config: { period: "latest-month", by: "comments", limit: 10 } },
      { kind: "content", size: "l", title: "Posts that over-perform", config: { period: "latest-month", sort: "er", limit: 6 } },
    ],
  },
  { key: "blank", name: "Blank", panel: false, description: "Start empty; add cards here or pin answers from Chats.", cards: [] },
];

/** A template's cards with the brands and platform picked at creation applied to every card. */
export function templateCards(t: Template, pick: { brands: string[]; platform: PlatformFilter }): Template["cards"] {
  return t.cards.map((c) => ({ ...c, config: { ...c.config, brands: pick.brands, platform: pick.platform } }));
}
