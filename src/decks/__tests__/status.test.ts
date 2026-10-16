import { describe, expect, it } from "vitest";
import { cleanEndDate, dateLabel, deckState, deckStatus, lookAgain } from "../status";
import { followingFrom } from "../generate";

const base = { recurring: true, grain: "week" as const, ends_on: null, paused_at: null, next_run_at: "2026-10-19T00:00:00Z" };

describe("deck status (16 Oct 2026)", () => {
  it("reads monitoring, paused, ended and one-off", () => {
    expect(deckState(base)).toBe("monitoring");
    expect(deckState({ ...base, paused_at: "2026-10-16T03:00:00Z" })).toBe("paused");
    expect(deckState({ ...base, ends_on: "2026-10-11", next_run_at: null })).toBe("ended");
    expect(deckState({ ...base, recurring: false, next_run_at: null })).toBe("one-off");
    // an end date still ahead keeps it monitoring
    expect(deckState({ ...base, ends_on: "2026-12-31" })).toBe("monitoring");
  });
  it("says how often, until when and when it looks next", () => {
    expect(deckStatus(base).detail).toBe("every week until stopped; next look 19 Oct 2026");
    expect(deckStatus({ ...base, grain: "month", ends_on: "2026-12-31", next_run_at: "2026-11-01T00:00:00Z" }).detail).toBe("every month until 31 Dec 2026; next look 1 Nov 2026");
    expect(deckStatus({ ...base, ends_on: "2026-10-11", next_run_at: null })).toMatchObject({ label: "Ended", detail: "ran every week until 11 Oct 2026" });
    expect(dateLabel("2026-01-05")).toBe("5 Jan 2026");
  });
  it("stops looking when paused, or when the next period starts after the end date", () => {
    expect(lookAgain({ recurring: true, ends_on: null, paused_at: null }, "2026-10-19", "T")).toBe("T");
    expect(lookAgain({ recurring: true, ends_on: "2026-10-25", paused_at: null }, "2026-10-19", "T")).toBe("T");
    expect(lookAgain({ recurring: true, ends_on: "2026-10-18", paused_at: null }, "2026-10-19", "T")).toBeNull();
    expect(lookAgain({ recurring: true, ends_on: null, paused_at: "x" }, "2026-10-19", "T")).toBeNull();
    expect(lookAgain({ recurring: false, ends_on: null, paused_at: null }, "2026-10-19", "T")).toBeNull();
  });
  it("the next period starts the day after this one ends", () => {
    expect(followingFrom("week", { from: "2026-10-05", to: "2026-10-11" })).toBe("2026-10-12");
    expect(followingFrom("month", { from: "2026-09-01", to: "2026-09-30" })).toBe("2026-10-01");
    expect(followingFrom("day", { from: "2026-10-14", to: "2026-10-14" })).toBe("2026-10-15");
  });
  it("takes a real day or nothing as the end date", () => {
    expect(cleanEndDate("2026-12-31")).toBe("2026-12-31");
    expect(cleanEndDate(null)).toBeNull();
    expect(cleanEndDate("")).toBeNull();
    expect(cleanEndDate("2026-02-30")).toBe("invalid");
    expect(cleanEndDate("31/12/2026")).toBe("invalid");
  });
});
