import { describe, expect, it } from "vitest";
import { defaultDiffConfig, diffResults, rowKey, shouldDeliver } from "../diff";
import { relativizeParams } from "../promote";
import { humanize, nextRunAt, validateCron } from "../schedule";

describe("diff", () => {
  const prev = [
    { creator_id: "a", creator_handle: "a", posts: 3 },
    { creator_id: "b", creator_handle: "b", posts: 5 },
    { creator_id: "c", creator_handle: "c", posts: 1 },
  ];
  const cur = [
    { creator_id: "a", creator_handle: "a", posts: 3 },
    { creator_id: "c", creator_handle: "c", posts: 4 },
    { creator_id: "d", creator_handle: "d", posts: 2 },
  ];
  it("reports new, gone, unchanged on diff_key", () => {
    const d = diffResults(prev, cur, "creator_id");
    expect(d.new.map((e) => e.key)).toEqual(["d"]);
    expect(d.gone.map((e) => e.key)).toEqual(["b"]);
    expect(d.changed).toEqual([]);
    expect(d.unchanged).toBe(2);
  });
  it("flags watched metrics beyond thresholds", () => {
    const d = diffResults(prev, cur, "creator_id", { watch: { posts: { pct: 50 } } });
    expect(d.changed.map((e) => e.key)).toEqual(["c"]);
    expect(d.changed[0].changes?.[0]).toMatchObject({ field: "posts", from: 1, to: 4, unit: "pct", delta: 300 });
  });
  it("first run is a baseline with everything new and no delivery when only_if_changed", () => {
    const d = diffResults(null, cur, "creator_id");
    expect(d.first_run).toBe(true);
    expect(d.new.length).toBe(3);
    expect(shouldDeliver(d, true)).toBe(true);
  });
  it("delivers only when something moved", () => {
    const same = diffResults(cur, cur, "creator_id");
    expect(shouldDeliver(same, true)).toBe(false);
    expect(shouldDeliver(same, false)).toBe(true);
  });
  it("alert skills deliver when state flips on", () => {
    const cfg = defaultDiffConfig("waves", { alert_state: "in_wave" });
    const d = diffResults([{ brand_id: "x", in_wave: false }], [{ brand_id: "x", in_wave: true }], "brand_id", cfg);
    expect(d.changed.length).toBe(1);
    expect(shouldDeliver(d, true, cfg)).toBe(true);
    const quiet = diffResults([{ brand_id: "x", in_wave: true }], [{ brand_id: "x", in_wave: true }], "brand_id", cfg);
    expect(shouldDeliver(quiet, true, cfg)).toBe(false);
  });
  it("keys compare rows by brand and source", () => {
    expect(rowKey({ brand_id: "a", source: "earned" }, "brand_id")).toBe("a|earned");
    expect(rowKey({ brand_id: "a", tier: "nano" }, "brand_id")).toBe("a|nano");
  });
});

describe("promotion", () => {
  it("turns absolute windows, months and weeks into relative windows", () => {
    expect(relativizeParams({ window: { from: "2026-06-01", to: "2026-06-30" } }).params).toEqual({ window: { last_n_days: 30 } });
    expect(relativizeParams({ month: "2026-06", brand: "x" }).params).toEqual({ brand: "x", window: { last_n_days: 30 } });
    expect(relativizeParams({ week: "2026-W24" }).params).toEqual({ window: { last_n_days: 7 } });
    expect(relativizeParams({ window: { last_n_days: 14 }, brands: "all" }).params).toEqual({ window: { last_n_days: 14 } });
  });
});

describe("schedule", () => {
  it("computes the next Monday 07:00 in Jakarta", () => {
    const next = nextRunAt("0 7 * * 1", "Asia/Jakarta", new Date("2026-09-02T09:00:00Z"));
    expect(next.toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });
  it("humanizes common shapes and validates", () => {
    expect(humanize("0 7 * * 1")).toBe("Weekly · Monday 07:00 WIB");
    expect(humanize("0 8 * * *")).toBe("Daily · 08:00 WIB");
    expect(validateCron("0 7 * * 1")).toBeNull();
    expect(validateCron("nope")).not.toBeNull();
  });
});
