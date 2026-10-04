/**
 * Role models (DECISIONS, 3 Oct 2026). A workspace is a dataset; a role is how the
 * product behaves on it: the first screen, the places in the sidebar, the decks it
 * offers, how CeMO thinks and what it drafts. Every role gets the same three
 * features (Dashboard, Decks, Chats); the model behind them differs.
 *
 * These constants are each role's 1.0 (Chorus, Atlas, Spark): the seed of
 * role_versions and the fallback when the tables are empty. What a request runs on is
 * the resolved role (src/roles/store.ts): the released Fair version, the company's
 * changes and the person's own settings, field by field under src/roles/policy.ts.
 * Pure: no data access here, so client components may import it.
 */

export type RoleId = "pr" | "brand_kol" | "social";
export type NavKey = "dashboard" | "weekly" | "decks" | "pulse" | "chats" | "reports";
export type Tone = "blue" | "violet" | "mint" | "coral" | "sun";

export type RoleModel = {
  id: RoleId;
  /** the name clients see on their team (DECISIONS, 4 Oct 2026): Chorus, Atlas, Spark */
  codename: string;
  /** major.minor; a release in role_versions carries it (src/roles/store.ts) */
  version: string;
  label: string;
  short: string;
  description: string;
  tone: Tone;
  home: string;
  nav: NavKey[];
  /** how CeMO works on this team, added to the workspace persona; {{client}} is the client brand */
  voice: string;
  /** Chats' empty screen; absent means the workspace's own words */
  hero_title?: string;
  hero_intro?: string;
  suggested?: string[];
  /** deck templates this team starts from (src/decks/templates.ts ids), in the order shown */
  deck_templates: string[];
  /** skill layers shown first in the composer's menu */
  skill_order?: string[];
  /** the alert that moves the status ladder; numbers only, applied in SQL (src/reputation/) */
  alert?: { negative_multiple: number; min_comments: number; baseline_days: number };
  /** Social Media: when an own post needs attention (src/social/); numbers only, applied in SQL */
  watch?: { underperform_pct: number; storm_negative: number; min_account_posts: number };
  /** the company's own rules for CeMO, under the product's fixed rules; set by a Builder, never by Fair's core */
  house_rules?: string[];
  /** a person's own defaults; a company may set them for everyone */
  prefs?: { days?: number; answer?: "short" | "full" };
};

export const PR: RoleModel = {
  id: "pr",
  codename: "Chorus",
  version: "1.0",
  label: "PR team",
  short: "PR",
  description: "What people say about you and your competitors, which issues are building, who is amplifying them, and when to respond.",
  tone: "coral",
  home: "/dashboard",
  nav: ["dashboard", "decks", "chats"],
  voice: [
    "On this team you are the comms advisor to {{client}}'s PR team. Think in conversations, narratives and issues, not creators or campaigns.",
    "Read every question from a reputation point of view: what people say about {{client}}, how fast it is moving, where it is spreading, who is amplifying it, whether it is about {{client}} alone or the whole category, and whether a response is needed.",
    "When the team asks, draft a holding statement, a short Q&A for spokespeople, replies for {{client}}'s own posts, or an escalation note for management. Use only what the data showed, quote real comments as evidence, and put anything the team must confirm in [square brackets]; never invent a fact, a figure or a promise.",
    "A service complaint (a payment that did not arrive, a refund, a blocked account) is for customer service: say so and point to the comments, rather than treating it as a reputation story.",
    "Never advise engaging trolls, political threads or pile-ons; say when silence is the better response.",
  ].join(" "),
  hero_title: "What are people saying about {{client}}?",
  hero_intro: "I've read every post and comment about {{brands}} brands on {{platforms}}. Ask me what is being said about you, which issues are building, who is driving them, or how you compare; I can also draft a holding statement. Every number I give you shows its evidence.",
  suggested: [
    "What are people saying about {{client}} this week?",
    "Is anything building into an issue for {{client}}?",
    "Which complaints are about {{client}} only, and which hit every brand?",
    "Draft a holding statement on the biggest negative issue this week",
  ],
  deck_templates: ["reputation-weekly", "reputation-monthly", "issue-postmortem"],
  skill_order: ["comments", "conversation", "posts"],
  alert: { negative_multiple: 2, min_comments: 50, baseline_days: 28 },
};

export const BRAND_KOL: RoleModel = {
  id: "brand_kol",
  codename: "Atlas",
  version: "1.0",
  label: "Brand & KOL team",
  short: "Brand & KOL",
  description: "Competitors, creators and campaigns across the category: who is winning, with whom, and what to do next.",
  tone: "blue",
  home: "/dashboard",
  nav: ["dashboard", "weekly", "decks", "chats"],
  voice: "",
  deck_templates: [],
};

export const SOCIAL: RoleModel = {
  id: "social",
  codename: "Spark",
  version: "1.0",
  label: "Social Media team",
  short: "Social",
  description: "Your own accounts: what you posted, what worked, which formats and times win, how the community answers, and how your channels compare with the competitors'.",
  tone: "mint",
  home: "/dashboard",
  nav: ["dashboard", "decks", "chats"],
  voice: [
    "On this team you are the content lead for {{client}}'s own social accounts. Think in posts, formats, timing and community, not creators or reputation crises.",
    "Judge a post against its own account's usual, not against other accounts: a photo on Instagram has no views, so read engagement there; read views where the platform reports them.",
    "When the team asks, draft captions, a content calendar, replies to comments on {{client}}'s posts, or a brief for the next post. Use only what the data showed and put anything to confirm in [square brackets].",
    "When a post draws complaints, say so plainly and point to customer service or PR rather than answering for them.",
  ].join(" "),
  hero_title: "How are {{client}}'s own accounts doing?",
  hero_intro: "I've read every post {{client}} and its competitors published on {{platforms}}, tracked day by day, with the comments under them. Ask me what worked, which formats and times win, or what to post next; every number I give you shows its evidence.",
  suggested: [
    "Which of {{client}}'s posts did best this month, and why?",
    "Which formats and posting times work for {{client}}?",
    "How do {{client}}'s own accounts compare with the competitors'?",
    "Draft next week's content calendar from what worked",
  ],
  deck_templates: ["content-monthly", "content-teardown"],
  skill_order: ["posts", "comments"],
  watch: { underperform_pct: 50, storm_negative: 20, min_account_posts: 5 },
};

export const ROLES: Record<RoleId, RoleModel> = { pr: PR, brand_kol: BRAND_KOL, social: SOCIAL };

export function isRoleId(v: unknown): v is RoleId {
  return typeof v === "string" && v in ROLES;
}

/** A one-person profile keeps its crisis view (Pulse boards, Reports) until it moves onto the reputation dashboard. */
const PROFILE_NAV: NavKey[] = ["dashboard", "pulse", "chats", "reports"];

/** The roles a workspace offers: its settings, else one by kind (a profile is watched by PR, a panel by Brand & KOL). */
export function workspaceRoles(kind: string, configured?: unknown): RoleId[] {
  const list = Array.isArray(configured) ? configured.filter(isRoleId) : [];
  if (list.length) return [...new Set(list)];
  return kind === "profile" ? ["pr"] : ["brand_kol"];
}

/** The sidebar for a role on a workspace. */
export function roleNav(role: RoleModel, kind: string): NavKey[] {
  return role.id === "pr" && kind === "profile" ? PROFILE_NAV : role.nav;
}

export function fillRole(t: string, client: string): string {
  return t.replace(/\{\{client\}\}/g, client);
}
