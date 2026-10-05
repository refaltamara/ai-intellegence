import { describe, expect, it } from "vitest";
import { ladder, levelFor, readPrFilters } from "../dashboard";
import { PR } from "../../roles/model";

const alert = PR.alert!;

describe("the status ladder", () => {
  it("needs enough comments to judge a day", () => {
    expect(levelFor(40, 49, 10, alert).level).toBe("calm");
  });
  it("calls watch, issue and crisis against the norm", () => {
    expect(levelFor(5, 100, 10, alert).level).toBe("calm");
    expect(levelFor(16, 100, 10, alert).level).toBe("watch");
    expect(levelFor(20, 100, 10, alert)).toEqual({ level: "issue", multiple: 2 });
    expect(levelFor(60, 200, 10, alert).level).toBe("crisis");
    // three times the norm but too few negative comments to be a crisis
    expect(levelFor(30, 100, 10, alert).level).toBe("issue");
  });
  it("marks calm days within a week of an issue as recovering", () => {
    const days = [
      { d: "2026-09-01", comments: 100, negative: 5, baseline_pct: 10 },
      { d: "2026-09-02", comments: 100, negative: 25, baseline_pct: 10 },
      { d: "2026-09-03", comments: 100, negative: 8, baseline_pct: 10 },
      ...Array.from({ length: 8 }, (_, i) => ({ d: `2026-09-${String(4 + i).padStart(2, "0")}`, comments: 100, negative: 8, baseline_pct: 10 })),
    ];
    const l = ladder(days, alert).map((x) => x.level);
    expect(l.slice(0, 3)).toEqual(["calm", "issue", "recovering"]);
    expect(l.at(-1)).toBe("calm");
  });
  it("reads filters with the client in focus by default", () => {
    expect(readPrFilters({}, ["dana", "gopay"], "gopay")).toEqual({ brand: "gopay", days: 7, platform: "all" });
    expect(readPrFilters({ brand: "dana", days: "30", platform: "x" }, ["dana", "gopay"], "gopay")).toEqual({ brand: "dana", days: 30, platform: "x" });
    expect(readPrFilters({ brand: "nope", days: "9" }, ["dana", "gopay"], null)).toEqual({ brand: "dana", days: 7, platform: "all" });
  });
});
