/**
 * Credits (CMS plan, "Credits and billing"; DECISIONS 4 Oct 2026). Every price here is a
 * placeholder until a month of measured cost per action (model_calls) is in; pricing gets
 * its own discussion. Dashboards, filters, settings, approvals and exports cost nothing.
 */
export const CREDIT_PRICES = {
  /** a question to CeMO */
  question: 1,
  /** a Builder-mode turn: CeMO drafts and previews a change */
  builder_turn: 3,
  /** a creation CeMO drafts (skill, deck template, rule, extension definition) */
  creation: 3,
  /** a deck or report version written by the model */
  deck_version: 5,
  /** CeMO reading rows for an extension, per row (0.5 credits: 1,000 rows = 500 credits) */
  extension_row: 0.5,
} as const;

export type CreditKind = keyof typeof CREDIT_PRICES | "topup" | "pool" | "adjust";

/** rows CeMO reads as a sample before anyone approves an extension */
export const EXTENSION_SAMPLE_ROWS = 50;

/** the monthly pool a workspace gets when Fair has not set one */
export const DEFAULT_MONTHLY_POOL = 3000;

/** Builders are told once a month when use passes this share of what the month allows */
export const ALERT_AT = 0.8;

/** Fair's real cost per million tokens by model, in USD (placeholder, for the owners' margin view) */
export const MODEL_COST_USD: Record<string, { in: number; out: number; cache_read: number; cache_write: number }> = {
  "claude-sonnet-5-5": { in: 3, out: 15, cache_read: 0.3, cache_write: 3.75 },
};
export const DEFAULT_MODEL_COST = MODEL_COST_USD["claude-sonnet-5-5"];

/** what Fair charges for one credit, in USD (placeholder) */
export const CREDIT_PRICE_USD = 0.02;
