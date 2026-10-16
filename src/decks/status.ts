/**
 * What a deck is doing (Refal, 16 Oct 2026): the Decks list says, for every deck, whether it is still being made
 * and until when, so people can tell the ones they monitor from the ones that are done.
 *
 *   monitoring  a new version every day, week or month, until its end date or until stopped
 *   paused      it repeats, but a person paused it: no new versions until resumed
 *   ended       it repeated until its end date, and that date has passed: no more versions
 *   one-off     made once (or by hand); no schedule
 *
 * Pure, so the list (a client component) and the cron share one reading.
 */
import type { DeckGrain } from "../competitor/period";

export type DeckState = "monitoring" | "paused" | "ended" | "one-off";

export type DeckSchedule = { recurring: boolean; grain: DeckGrain; ends_on: string | null; paused_at: string | null; next_run_at: string | null };

const EVERY: Record<DeckGrain, string> = { day: "every day", week: "every week", month: "every month" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-12-31" → "31 Dec 2026" */
export const dateLabel = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : d;
};

export function deckState(d: DeckSchedule): DeckState {
  if (!d.recurring) return "one-off";
  if (d.paused_at) return "paused";
  if (d.ends_on && !d.next_run_at) return "ended";
  return "monitoring";
}

/** The status cell: a short word, and the line under it ("every week until 31 Dec 2026", "next on 19 Oct"). */
export function deckStatus(d: DeckSchedule): { state: DeckState; label: string; detail: string } {
  const state = deckState(d);
  const until = d.ends_on ? `until ${dateLabel(d.ends_on)}` : "until stopped";
  const next = d.next_run_at ? `; next look ${dateLabel(d.next_run_at.slice(0, 10))}` : "";
  if (state === "monitoring") return { state, label: "Monitoring", detail: `${EVERY[d.grain]} ${until}${next}` };
  if (state === "paused") return { state, label: "Paused", detail: `${EVERY[d.grain]} ${until}; no new versions until resumed` };
  if (state === "ended") return { state, label: "Ended", detail: `ran ${EVERY[d.grain]} until ${dateLabel(d.ends_on!)}` };
  return { state, label: "One-off", detail: "made when asked; no schedule" };
}

/**
 * When a recurring deck looks next, given the first day of the period it would make then: no look when it is
 * paused, or when that period starts after its end date (it has ended).
 */
export function lookAgain(d: Pick<DeckSchedule, "recurring" | "ends_on" | "paused_at">, nextFrom: string | null, at: string): string | null {
  if (!d.recurring || d.paused_at) return null;
  if (d.ends_on && nextFrom && nextFrom > d.ends_on) return null;
  return at;
}

/** A plain YYYY-MM-DD that is a real day, or null. */
export function cleanEndDate(v: unknown): string | null | "invalid" {
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "invalid";
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v ? "invalid" : v;
}
