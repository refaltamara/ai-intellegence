/**
 * The reference an "Ask why" link carries: what was clicked and the dashboard's
 * filters, never the numbers (src/dashboard/ask.ts re-reads those). Pure and
 * browser-safe, so client components can build links.
 */
import { TIER_BANDS } from "../config/thresholds";
import { parsePeriod } from "./period";

/** the Pulse's cards; kept here (not in src/pulse/) so browser code can build links without the data layer */
export const PULSE_CARDS = ["overview", "now", "trend", "anger", "reply", "spread", "stance", "commenters", "themes", "drivers", "seeding", "exposure", "sides", "watch"] as const;
export type PulseCard = (typeof PULSE_CARDS)[number];

/** "all" is every platform the workspace holds; the beauty panel holds TikTok and Instagram, listening workspaces Threads and X too. */
export type PlatformFilter = "all" | "tiktok" | "instagram" | "threads" | "x" | "youtube";
export const PLATFORMS: PlatformFilter[] = ["all", "tiktok", "instagram", "threads", "x", "youtube"];
export const PLATFORM_NAME: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };
export const PLATFORM_SHORT: Record<string, string> = { tiktok: "TT", instagram: "IG", threads: "TH", x: "X", youtube: "YT" };

export type AskTarget =
  | { k: "kpi"; metric: "posts" | "views" | "engagements" | "er" }
  | { k: "brand"; brand: string }
  | { k: "tier"; tier: string }
  | { k: "week"; brand: string; week: string }
  | { k: "creator"; creator: string }
  | { k: "post"; url: string }
  /** a card on a case's Pulse (src/pulse/ask.ts); the Pulse has no filters, so platform, brands and period are left empty */
  | { k: "pulse"; card: PulseCard };
export type AskRef = AskTarget & { platform: PlatformFilter; brands: string[]; period: string };
export type Fact = { label: string; value: string };
/** What the chat shows above the question and what the model is told. */
export type AskContext = {
  source: "dashboard" | "slide" | "pulse";
  title: string;
  scope: string;
  facts: Fact[];
  back: string;
  question: string;
  /** "Ask AI" on a weekly report slide: the slide as text and the week it covers (src/reports/slideAsk.ts) */
  slide?: { report_id: string; n: number; total: number; deck: string; week: { from: string; to: string; label: string; previous: string }; text: string };
};

/** base64url(JSON), the same in the browser and on the server */
export function encodeAsk(ref: AskRef): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ref));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeAsk(raw: string | null | undefined): AskRef | null {
  if (!raw || raw.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const bin = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    return validAsk(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))));
  } catch {
    return null;
  }
}

/** The chat link for a click on the dashboard. */
export function askHref(ref: AskRef): string {
  return `/?ask=${encodeAsk(ref)}`;
}

/** The chat link for a card on a case's Pulse. */
export function pulseAskHref(card: PulseCard): string {
  return askHref({ k: "pulse", card, platform: "all", brands: [], period: "" });
}

const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

/** Shape check only; whether the brand, creator or post exists is decided when it resolves. */
export function validAsk(v: unknown): AskRef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.k === "pulse") return (PULSE_CARDS as readonly string[]).includes(String(o.card)) ? { k: "pulse", card: o.card as PulseCard, platform: "all", brands: [], period: "" } : null;
  const platform = (PLATFORMS as string[]).includes(String(o.platform)) ? (o.platform as PlatformFilter) : null;
  const period = str(o.period, 10);
  const brands = Array.isArray(o.brands) ? o.brands.filter((b): b is string => typeof b === "string" && b.length <= 80).slice(0, 20) : null;
  if (!platform || !period || !parsePeriod(period) || !brands) return null;
  const base = { platform, period, brands };
  switch (o.k) {
    case "kpi":
      return ["posts", "views", "engagements", "er"].includes(String(o.metric)) ? { ...base, k: "kpi", metric: o.metric as "posts" } : null;
    case "brand":
      return str(o.brand, 80) ? { ...base, k: "brand", brand: o.brand as string } : null;
    case "tier":
      return TIER_BANDS.some((b) => b.tier === o.tier) ? { ...base, k: "tier", tier: o.tier as string } : null;
    case "week":
      return str(o.brand, 80) && typeof o.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.week) ? { ...base, k: "week", brand: o.brand as string, week: o.week } : null;
    case "creator":
      return typeof o.creator === "string" && /^[0-9a-f-]{36}$/.test(o.creator) ? { ...base, k: "creator", creator: o.creator } : null;
    case "post":
      return typeof o.url === "string" && /^https:\/\/\S{8,500}$/.test(o.url) ? { ...base, k: "post", url: o.url } : null;
    default:
      return null;
  }
}
