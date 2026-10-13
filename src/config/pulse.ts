/**
 * The Pulse's charts (Refal, 13 Oct 2026: "it just jumped, somehow there is sentiment, there isn't"). A share of an hour
 * or a day is drawn only on at least this many comments read (or posts with a stance): below it a percentage swings
 * between 0% and 100% on a handful of voices and says nothing.
 */
export const PULSE_MIN_READ = 20;
/** the hourly chart covers at most this many hours; a longer wave is shown by day */
export const PULSE_MAX_HOURS = 120;
