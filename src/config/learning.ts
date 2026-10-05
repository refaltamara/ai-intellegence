/**
 * The learning loop's numbers (CMS plan, "The learning loop"; DECISIONS 5 Oct 2026).
 */
/** an insight across clients needs at least this many workspaces behind it, so no one client's choices show as such */
export const INSIGHT_FLOOR = 3;
/** insights read the signals of the last this many days */
export const INSIGHT_WINDOW_DAYS = 30;
/** a version is measured over this many days before and after it reached a workspace */
export const MEASURE_DAYS = 28;
/** an interim reading is shown from this many days after release */
export const MEASURE_INTERIM_DAYS = 14;
