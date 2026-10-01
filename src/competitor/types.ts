/** The weekly competitor report, as data: every number the deck shows lives here. */
import type { WeeklyRules } from "../config/weekly";
import type { Landscape } from "./landscape";

export type Platform = "tiktok" | "instagram";
export type Metric = "posts" | "views" | "er";

/** A row of the report: one watched brand (or a group such as "Maybelline / L'Oréal"), a client brand, or the client's portfolio. */
export type Group = {
  key: string;
  name: string;
  short?: string;
  kind: "core" | "when_relevant" | "client" | "client_brand";
  brand_ids: string[];
  /** names the contract asks for that the panel does not track yet */
  untracked?: string[];
};

/** One group, one platform, one week. Distinct posts, so a post tagging two brands of a group counts once. */
export type WeekPoint = {
  week: string;
  posts: number;
  creators: number;
  owned_posts: number;
  views: number;
  owned_views: number;
  /** posts with views > 0 and their views and engagements: the engagement-rate base */
  posts_rated: number;
  views_rated: number;
  engagements: number;
  cart_posts: number;
  cart_known: number;
  /** engagements / views, % (platform-native engagements) */
  er: number | null;
  /** % of all posts in the panel on this platform that week */
  posts_share: number | null;
  /** % of all views in the panel on this platform that week */
  views_share: number | null;
};

export type Flag = {
  metric: Metric;
  direction: "up" | "down";
  /** standard deviations from the brand's own average over the lookback */
  z: number;
  /** the judged value: a share (%) or a count under basis "share"/"count"; ER in % */
  value: number;
  previous: number;
  mean: number;
  low: number;
  high: number;
  /** relative % change against last week, or points for ER */
  change: number;
  unit: "share" | "count" | "er";
};

export type Cell = {
  covered: boolean;
  now: WeekPoint | null;
  prev: WeekPoint | null;
  /** the lookback weeks, oldest first, zero-filled where the brand had no posts */
  history: WeekPoint[];
  flags: Flag[];
};

export type GroupResult = { group: Group; cells: Partial<Record<Platform, Cell>> };

export type PanelPoint = { week: string; posts: number; views: number };
export type Panel = { now: PanelPoint; prev: PanelPoint; history: PanelPoint[]; posts_change_pct: number | null; views_change_pct: number | null };

export type EvidencePost = {
  ref: string;
  url: string;
  platform: Platform;
  group: string;
  creator_handle: string | null;
  source: string;
  tier: string | null;
  followers: number | null;
  posted_at: string;
  views: number | null;
  er: number | null;
  content_format: string | null;
  has_cart: boolean | null;
  product_name: string | null;
  caption: string | null;
};

export type Share = { now: number | null; prev: number | null };

export type Mover = {
  key: string;
  name: string;
  platform: Platform;
  flag: Flag;
  /** the brand's other highlighted moves this week, any platform */
  other_flags: { platform: Platform; flag: Flag }[];
  now: WeekPoint;
  prev: WeekPoint;
  who: {
    creators: number;
    creators_prev: number;
    /** creators posting for the brand this week who had not in the lookback weeks */
    new_creators: number;
    new_creator_share: number | null;
    /** last week's share of new creators, against its own lookback */
    new_creator_share_prev: number | null;
    tier_mix: { tier: string; posts: number; share: number; share_prev: number }[];
    top_creators: { handle: string; tier: string | null; followers: number | null; posts: number; views: number }[];
  };
  what: {
    top_posts: EvidencePost[];
    /** % of the brand's views this week that came from its single biggest post */
    top_post_view_share: number | null;
    formats: { format: string; posts: number; share: number; share_prev: number }[];
  };
  campaign: { tags: { tag: string; creators: number; posts: number; views: number; brand_share: number | null }[] };
  /** brand-account posts; null where the platform's data has no owned accounts */
  owned: { posts: Share; views: Share } | null;
  /** yellow-cart share; TikTok only */
  action: { cart_share: Share; products: { name: string; posts: number; views: number }[] } | null;
  distribution: { boosted: boolean; er: number | null; views: number };
};

export type WeeklyReport = {
  version: 1;
  title: string;
  client: string;
  workspace_id: string;
  week: { from: string; to: string; label: string; iso: string };
  previous_week: { from: string; to: string; label: string };
  history_weeks: string[];
  rules: WeeklyRules;
  platforms: Platform[];
  panel: Partial<Record<Platform, Panel>>;
  watchlist: GroupResult[];
  portfolio: GroupResult;
  client_brands: GroupResult[];
  movers: Mover[];
  /** every other highlighted move on the watchlist, in score order */
  flagged: { key: string; name: string; platform: Platform; flag: Flag }[];
  /** the unflagged moves closest to the line, with the reason each is not news */
  near_misses: { key: string; name: string; platform: Platform; metric: Metric; z: number | null; value: number | null; previous: number | null; miss: string | null }[];
  notes: { kind: "coverage" | "method"; text: string }[];
  evidence: EvidencePost[];
  /** the week beyond the highlighted moves: tiers, products, posting, close-ups, patterns (reports made before 1 Oct 2026 have none) */
  landscape?: Landscape;
  data_as_of: string;
  generated_at: string;
};
