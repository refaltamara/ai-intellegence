/**
 * The weekly competitor report's rules (Refal, 29 Sep 2026). A brand-platform
 * move is highlighted only when it is unusual for that brand, large, and big
 * enough to matter; everything else is normal weekly noise and stays grey.
 * These are defaults: a workspace overrides them through `settings.weekly.rules`,
 * and every report records the rules it was made with.
 */
export type WeeklyRules = {
  /** weeks of the brand's own history that define "normal" */
  lookback_weeks: number;
  /** standard deviations from the brand's own average before a move counts as unusual */
  z: number;
  /** a share (of posts or views) must also move this much against last week, relative */
  min_change_pct: number;
  /** an engagement rate must also move this many points against last week */
  min_er_change_pts: number;
  /** size floor: posts this week or last */
  min_posts: number;
  /** size floor: views this week or last */
  min_views: number;
  /** a brand needs this many weeks with posts in its history before it can be judged */
  min_history_weeks: number;
  /**
   * "share" judges posts and views as a share of the whole panel, so a coverage
   * swing that lifts every brand is not read as one brand moving; "count" judges
   * the raw numbers.
   */
  basis: "share" | "count";
  /** at most this many brands get a "what's driving it" slide */
  max_movers: number;
  /** below this engagement rate, very high views read as paid distribution */
  boosted_er_pct: number;
  boosted_min_views: number;
  /** a panel-wide move this large gets a note: every brand's count moves with it */
  panel_swing_pct: number;
};

export const WEEKLY_RULES: WeeklyRules = {
  lookback_weeks: 8,
  z: 2,
  min_change_pct: 20,
  min_er_change_pts: 0.5,
  min_posts: 30,
  min_views: 1_000_000,
  min_history_weeks: 4,
  basis: "share",
  max_movers: 3,
  boosted_er_pct: 0.3,
  boosted_min_views: 5_000_000,
  panel_swing_pct: 30,
};

export function weeklyRules(overrides?: Partial<WeeklyRules> | null): WeeklyRules {
  return { ...WEEKLY_RULES, ...(overrides ?? {}) };
}
