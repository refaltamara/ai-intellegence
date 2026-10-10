/**
 * The checks every load passes before it reaches the core (src/loader/checks.ts; DECISIONS, 10 Oct 2026). A broken
 * load is held with a report; a warning lets the load in, flags the rows and tells data ops and the scraper team.
 * Thresholds were set against the four workspaces loaded so far, so none of their loads would have been held:
 *   comments before their post: Kahf 0%, Fintech 1.6%, Maudy 2.5% (more than an hour early); a time zone read wrong
 *     moves nearly every comment, so 10% holds
 *   one post under several urls: Beauty 0.02%; 1% holds
 *   posts set aside as not about their brand: Fintech 27%; 50% holds
 */
export const LOAD_CHECKS = {
  /** a post dated this far in the future means a date read wrong */
  futureSlackHours: 24,
  /** nothing before this year is social listening data */
  oldestYear: 2010,
  /** comments more than an hour before their post: warn above, hold above */
  commentsEarly: { warn: 0.03, hold: 0.1 },
  /** the posts' average hour of day moving this far from the workspace's earlier posts means a time zone read wrong */
  hourShiftHours: 4,
  hourShiftMinPosts: 300,
  /** a file where this share of posts sits at midnight carries dates without times: the hour check skips it */
  dateOnlyShare: 0.9,
  /** posts set aside as not about their brand (listening) */
  setAsideShare: 0.5,
  /** contents a profile's rules drop (no keyword, link spam) */
  droppedByRuleShare: 0.7,
  /** the same post id under different urls */
  duplicateIdShare: 0.01,
  /** a file of at least this many rows that yields nothing is broken */
  emptyFileMinRows: 20,
} as const;

/** content types that are videos: a video reporting 0 views is flagged (an image has no views to report) */
export const VIDEO_TYPES = new Set(["video", "reel", "reels"]);

/** who hears about held loads and warnings, besides Fair's data ops (accounts with the data_ops duty) */
export const SCRAPER_TEAM = (process.env.SCRAPER_TEAM_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
