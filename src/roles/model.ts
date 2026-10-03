/**
 * Role models (DECISIONS, 3 Oct 2026). A workspace is a dataset; a role is how the
 * product behaves on it: the first screen, the places in the sidebar, the decks it
 * offers, how CeMO thinks and what it drafts. Every role gets the same three
 * features (Dashboard, Decks, Chats); the model behind them differs.
 *
 * The product team owns these definitions and versions them. A workspace offers one
 * or more roles (`settings.roles`); later the CMS edits the workspace side, and what
 * people do inside a role (decks kept, questions asked, alerts tuned) feeds the next
 * version. Pure: no data access here, so client components may import it.
 */

export type RoleId = "pr" | "brand_kol";
export type NavKey = "dashboard" | "weekly" | "decks" | "pulse" | "chats" | "reports";
export type Tone = "blue" | "violet" | "mint" | "coral" | "sun";

export type RoleModel = {
  id: RoleId;
  /** bumped whenever the product team changes the model */
  version: number;
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
};

export const PR: RoleModel = {
  id: "pr",
  version: 1,
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
  deck_templates: ["reputation-weekly", "issue-postmortem"],
  skill_order: ["comments", "conversation", "posts"],
  alert: { negative_multiple: 2, min_comments: 50, baseline_days: 28 },
};

export const BRAND_KOL: RoleModel = {
  id: "brand_kol",
  version: 1,
  label: "Brand & KOL team",
  short: "Brand & KOL",
  description: "Competitors, creators and campaigns across the category: who is winning, with whom, and what to do next.",
  tone: "blue",
  home: "/dashboard",
  nav: ["dashboard", "weekly", "decks", "chats"],
  voice: "",
  deck_templates: [],
};

export const ROLES: Record<RoleId, RoleModel> = { pr: PR, brand_kol: BRAND_KOL };

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
