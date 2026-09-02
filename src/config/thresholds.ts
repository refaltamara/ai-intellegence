/**
 * Tier bands and affiliate rules. Single source of truth for TypeScript;
 * etl/config.py mirrors these values for the Python loader. Keep both in sync
 * (tests/config-sync compares them).
 *
 * Bands follow docs/DECISIONS.md (Refal, 2 Sep 2026). Followers 0 or null → tier null.
 */
export type Tier = "nano" | "micro" | "mid" | "macro" | "mega";

export const TIER_BANDS: ReadonlyArray<{ tier: Tier; label: string; min: number; max: number | null }> = [
  { tier: "nano", label: "Nano", min: 1, max: 10_000 },
  { tier: "micro", label: "Micro", min: 10_001, max: 50_000 },
  { tier: "mid", label: "Mid-Tier", min: 50_001, max: 500_000 },
  { tier: "macro", label: "Macro", min: 500_001, max: 1_000_000 },
  { tier: "mega", label: "Mega & Celebrities", min: 1_000_001, max: null },
];

export function tierForFollowers(followers: number | null | undefined): Tier | null {
  if (followers == null || !Number.isFinite(followers) || followers <= 0) return null;
  for (const b of TIER_BANDS) {
    if (followers >= b.min && (b.max == null || followers <= b.max)) return b.tier;
  }
  return null;
}

/** Affiliate rule (post-level, DECISIONS): a post with has_cart = true is an affiliate post;
 *  a creator with >= min_cart_posts affiliate posts in the window is an affiliator. */
export const AFFILIATE_RULE = {
  min_cart_posts: 1,
  // Optional stricter settings kept from the PRD for skills that want them.
  strict: { posts_in_month: 30, cart_pct: 50 },
  strict_alt: { posts_in_month: 15, cart_pct: 80 },
} as const;

/** Source timestamps are assumed to be Asia/Jakarta local time (open item in DECISIONS). */
export const SOURCE_TZ = "Asia/Jakarta";
export const DEFAULT_WORKSPACE_ID = "beauty-id";
