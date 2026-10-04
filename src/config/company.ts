/**
 * Limits on what a client keeps on one team (CMS plan, "What client changes may and may
 * not do"). A workspace may carry its own in settings.limits, set by Fair in the CMS.
 */
export const CREATION_LIMITS = {
  skill: 30,
  deck_template: 20,
  rule: 20,
  fact: 50,
  term: 50,
} as const;

/** a Member's open creations (draft, waiting, sent back) on one team */
export const MEMBER_OPEN_LIMIT = 15;

export const RULE_MAX_CHARS = 300;
export const FACT_MAX_CHARS = 300;
export const TERM_MAX_CHARS = 40;
