/**
 * Every number has one definition (DECISIONS, 10 Oct 2026; the design doc's "Definitions" table). One versioned list,
 * used the same way by every role, screen, deck, chat and the connector: a role chooses which it shows and its defaults,
 * never redefines one. A definition never changes in place: a new meaning or new SQL is a new version, and
 * src/definitions/__tests__/catalog.test.ts holds each version to its fingerprint. The daily totals record the catalog
 * version they were counted with (daily_totals.definitions).
 */
import { createHash } from "node:crypto";

export type Unit = "posts" | "views" | "engagement" | "share" | "rate" | "accounts" | "band";

export type Definition = {
  key: string;
  version: number;
  name: string;
  /** what it means, in the words screens, decks and About sheets use */
  means: string;
  unit: Unit;
  /** the SQL it is counted with, over a row `x` of post_items or post_d7 (a reading), where it is one expression */
  sql?: (x: string) => string;
};

/** likes + comments + shares + saves, where the platform reports them; empty when it reports none */
const engagement = (x: string) =>
  `(case when coalesce(${x}.likes, ${x}.comments_count, ${x}.shares, ${x}.saves) is null then null else coalesce(${x}.likes, 0) + coalesce(${x}.comments_count, 0) + coalesce(${x}.shares, 0) + coalesce(${x}.saves, 0) end)`;
/** likes + comments, the engagement every platform reports */
const engagementLc = (x: string) =>
  `(case when ${x}.likes is null and ${x}.comments_count is null then null else coalesce(${x}.likes, 0) + coalesce(${x}.comments_count, 0) end)`;

const LIST: Definition[] = [
  { key: "post", version: 1, unit: "posts", name: "Post",
    means: "One post on one platform, whatever brands it is about (a post about two brands is one post, linked to each). A reply that arrives as a post counts as a comment." },
  { key: "link", version: 1, unit: "posts", name: "Brand post",
    means: "A post's link to one brand. A brand's numbers count its links, so a post about two brands counts for both; a panel total counts each post once." },
  { key: "case_post", version: 1, unit: "posts", name: "Case post",
    means: "A post a case brought in that the panel's own setup did not catch. It counts in that case's numbers and never in the panel's everyday numbers, creators or tiers; a post the panel also caught counts in both. Every panel query keeps relevant is not false and brought_in_by = 'panel' together." },
  { key: "views_d7", version: 2, unit: "views", name: "Views (day 7)",
    means: "Views in the reading nearest 7 days after posting. A post that went up less than 7 days before the data's latest reading counts its latest reading so far, and a period holding such posts is shown as \"so far\": its views will still grow.",
    sql: (x) => `${x}.views` },
  { key: "views_latest", version: 1, unit: "views", name: "Views (latest)",
    means: "Views in the latest reading, with its age beside it.",
    sql: (x) => `${x}.views` },
  { key: "engagement", version: 1, unit: "engagement", name: "Engagement",
    means: "Likes + comments + shares + saves, where the platform reports them.",
    sql: engagement },
  { key: "engagement_lc", version: 1, unit: "engagement", name: "Engagement (comparable)",
    means: "Likes + comments, for comparing across platforms.",
    sql: engagementLc },
  { key: "engagement_rate", version: 2, unit: "rate", name: "Engagement rate",
    means: "Engagement ÷ views, both from the same reading, over the posts that can carry a rate: views over 0 (so a video reporting 0 views is out) and engagement no more than views.",
    sql: (x) => `(${x}.views > 0 and ${engagement(x)} is not null and ${engagement(x)} <= ${x}.views)` },
  { key: "engagement_rate_lc", version: 2, unit: "rate", name: "Engagement rate (comparable)",
    means: "Engagement (comparable) ÷ views, both from the same reading, for comparing across platforms, over the posts that can carry a rate: views over 0 (so a video reporting 0 views is out) and engagement no more than views.",
    sql: (x) => `(${x}.views > 0 and ${engagementLc(x)} is not null and ${engagementLc(x)} <= ${x}.views)` },
  { key: "flagged", version: 2, unit: "posts", name: "Flagged",
    means: "A post the load warned about: an account reporting 0 followers, or a video reporting 0 views. It counts as a post, and a measure leaves it out only where the warning bears on it: a reported 0 followers is no follower count (no tier, nothing per follower), and a video's 0 views is no views (nothing per view, no views median).",
    sql: (x) => `(${x}.flags is not null)` },
  { key: "share_of_voice", version: 1, unit: "share", name: "Share of voice",
    means: "How much is said: a brand's posts ÷ all panel brands' posts, same period, counting links. Always shown beside share of views." },
  { key: "share_of_views", version: 1, unit: "share", name: "Share of views",
    means: "How much is seen: a brand's Views (day 7) ÷ all panel brands', same period, counting links. It leads on brand panels." },
  { key: "share_of_engagement", version: 1, unit: "share", name: "Share of engagement",
    means: "How much people respond: a brand's Engagement (comparable) ÷ all panel brands', same period, counting links." },
  { key: "negative_share", version: 1, unit: "rate", name: "Negative share",
    means: "Negative ÷ labelled comments, on topic, without the brand's own replies." },
  { key: "tier", version: 1, unit: "band", name: "Tier",
    means: "The creator's follower band at the post's date: nano to mega, bands in src/config/thresholds.ts." },
  { key: "creators", version: 1, unit: "accounts", name: "Creators",
    means: "Distinct accounts with at least one linked earned post in the period. A brand's own accounts and commenters are not creators." },
  { key: "commenters", version: 1, unit: "accounts", name: "Commenters",
    means: "Distinct comment authors in the period; never counted as creators." },
  { key: "affiliator", version: 1, unit: "accounts", name: "Affiliator",
    means: "A creator with at least one post with a cart (TikTok Shop) in the period; all their posts in that period count as affiliator posts. Worked out per period (the day, week or month shown), never stored: one cart post makes them an affiliator for the whole period." },
  { key: "viewership_mix", version: 1, unit: "views", name: "Viewership mix",
    means: "A brand's views split three ways, same period: its own accounts, affiliators, and other creators." },
];

export const DEFINITIONS: ReadonlyMap<string, Definition> = new Map(LIST.map((d) => [d.key, d]));

/** a definition's fingerprint: its meaning and its SQL, as they stand */
export const fingerprint = (d: Definition) => createHash("sha1").update(`${d.means}\u0001${d.sql ? d.sql("x") : ""}`).digest("hex").slice(0, 10);

/** each definition's version, as recorded with its fingerprint (a change without a new version fails the catalog test) */
export const RECORDED: Record<string, { version: number; fingerprint: string }> = {
  post: { version: 1, fingerprint: "322fbbacc6" },
  link: { version: 1, fingerprint: "f85cc110f4" },
  case_post: { version: 1, fingerprint: "e20057a9b3" },
  views_d7: { version: 2, fingerprint: "e69a97442f" },
  views_latest: { version: 1, fingerprint: "7f706dce75" },
  engagement: { version: 1, fingerprint: "b585cd40db" },
  engagement_lc: { version: 1, fingerprint: "eefee2edef" },
  engagement_rate: { version: 2, fingerprint: "0491a9a2e0" },
  engagement_rate_lc: { version: 2, fingerprint: "ebe950ec1c" },
  flagged: { version: 2, fingerprint: "c5b0c668c5" },
  share_of_voice: { version: 1, fingerprint: "c79df4779a" },
  share_of_views: { version: 1, fingerprint: "8c8a573993" },
  share_of_engagement: { version: 1, fingerprint: "e13ffae824" },
  negative_share: { version: 1, fingerprint: "d850178680" },
  tier: { version: 1, fingerprint: "b867d0e429" },
  creators: { version: 1, fingerprint: "744831f9d0" },
  commenters: { version: 1, fingerprint: "60996d3a5f" },
  affiliator: { version: 1, fingerprint: "15cbe17d0b" },
  viewership_mix: { version: 1, fingerprint: "2fa0559ef5" },
};

/** the catalog's version: each definition's key and version, so any new version of any definition makes a new catalog */
export const CATALOG_VERSION = `v1:${createHash("sha1").update(LIST.map((d) => `${d.key}@${d.version}`).join(",")).digest("hex").slice(0, 8)}`;

export function def(key: string): Definition {
  const d = DEFINITIONS.get(key);
  if (!d) throw new Error(`no definition ${key}`);
  return d;
}

/**
 * Each post's reading at day 7 (definition views_d7: the latest so far for a post under 7 days old), joined to a link
 * `p` as `d`: views, likes, comments_count, shares and saves from one reading, and `d.so_far`.
 */
export const d7Join = (p = "p", d = "d7") => `left join post_d7 ${d} on ${d}.item_id = ${p}.item_id`;

/** the two views a screen or an answer can count */
export type ViewsDef = "views_d7" | "views_latest";

/**
 * Which views each role reads where it counts views in Chats, as its own screens do (a role chooses which definitions it
 * shows, never redefines one): Brand & KOL compares at day 7; PR reads reach, how far a post has spread by now (step 4,
 * third part); Social reads its own accounts by their latest reading, on its dashboard, in decks and in Chats (Refal, 10 Oct).
 */
export const ROLE_VIEWS: Record<string, ViewsDef> = { brand_kol: "views_d7", pr: "views_latest", social: "views_latest" };

/** a definition's SQL over row `x` */
export function sqlOf(key: string, x: string): string {
  const d = def(key);
  if (!d.sql) throw new Error(`${key} is counted over a period, not a row`);
  return d.sql(x);
}
