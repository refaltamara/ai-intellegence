import { describe, expect, it } from "vitest";
import { WEEKLY_RULES } from "../../config/weekly";
import { assess, covered, evaluate } from "../flags";
import { checkNarrative, numbersIn, type Narrative } from "../narrative";
import type { WeekPoint, WeeklyReport } from "../types";
import { change, compact, pct, pts } from "../view";
import { isoWeek, weekLabel, weekStart } from "../weeks";

/** a week with a given share of panel posts and views, a given ER, and enough posts to clear the floor */
function wk(i: number, share: number, o: Partial<WeekPoint> = {}): WeekPoint {
  const posts = o.posts ?? 100;
  return {
    week: `2026-0${1 + Math.floor(i / 4)}-0${1 + (i % 4)}`, posts, creators: 50, owned_posts: 0, views: 5_000_000, owned_views: 0,
    posts_rated: posts, views_rated: 5_000_000, engagements: 100_000, cart_posts: 0, cart_known: 0, er: 2, posts_share: share, views_share: share, ...o,
  };
}
const history = [3.0, 3.2, 2.9, 3.1, 3.0, 2.8, 3.1, 3.0].map((s, i) => wk(i, s));

describe("the highlight rule", () => {
  it("flags a large, unusual move away from the brand's normal", () => {
    const f = assess("posts", history, wk(9, 4.5), WEEKLY_RULES);
    expect(f?.direction).toBe("up");
    expect(f!.z).toBeGreaterThan(WEEKLY_RULES.z);
    expect(f!.change).toBeCloseTo(50, 0);
    expect(f!.low).toBe(2.8);
    expect(f!.high).toBe(3.2);
  });

  it("leaves ordinary weeks grey", () => {
    expect(assess("posts", history, wk(9, 3.15), WEEKLY_RULES)).toBeNull();
    expect(evaluate("posts", history, wk(9, 3.15), WEEKLY_RULES).miss).toBe("within normal range");
  });

  it("ignores moves below the size floor", () => {
    const small = history.map((h) => ({ ...h, posts: 10 }));
    expect(evaluate("posts", small, wk(9, 4.5, { posts: 12 }), WEEKLY_RULES).miss).toBe("below size floor");
  });

  it("does not flag a week that is coming down from last week's spike", () => {
    const spiked = [...history.slice(0, 7), wk(8, 9.0)];
    // still well above the average, but inside a range that last week's spike widened
    const e = evaluate("posts", spiked, wk(9, 7.0), WEEKLY_RULES);
    expect(e.flag).toBeNull();
    expect(e.miss).not.toBeNull();
  });

  it("flags a move that is too small in points only when it clears the change floor", () => {
    const steady = [3.0, 3.01, 3.02, 3.0, 3.01, 3.02, 3.0, 3.01].map((s, i) => wk(i, s));
    // far outside a very tight range, yet only +10% against last week
    expect(evaluate("posts", steady, wk(9, 3.31), WEEKLY_RULES).miss).toBe("change too small");
  });

  it("judges engagement rate in points", () => {
    const f = assess("er", history, wk(9, 3.0, { er: 4.5 }), WEEKLY_RULES);
    expect(f?.metric).toBe("er");
    expect(f!.change).toBeCloseTo(2.5, 5);
    expect(assess("er", history.map((h) => ({ ...h, er: 2 + (h.posts_share! - 3) })), wk(9, 3, { er: 2.3 }), WEEKLY_RULES)).toBeNull();
  });

  it("needs enough history to judge", () => {
    expect(evaluate("posts", history.slice(0, 3), wk(9, 9), WEEKLY_RULES).miss).toBe("thin history");
  });

  it("counts a brand as covered only with posts in at least half the weeks", () => {
    const sparse = history.map((h, i) => ({ ...h, posts: i < 2 ? 10 : 0 }));
    expect(covered(sparse, wk(9, 0, { posts: 0 }))).toBe(false);
    expect(covered(history, wk(9, 3))).toBe(true);
  });
});

describe("display", () => {
  it("formats changes the way the deck shows them", () => {
    expect(change(418, 173)).toBe("+142%");
    expect(change(173, 289)).toBe("−40%");
    expect(change(34_468_258, 81_000)).toBe("×426");
    expect(change(5, 0)).toBe("new");
    expect(pts(6.2, 5.3)).toBe("+0.9 pt");
    expect(compact(34_468_258)).toBe("34.5M");
    expect(compact(185_300_000)).toBe("185M");
    expect(pct(0.03)).toBe("<0.1%");
    expect(pct(0)).toBe("0%");
  });

  it("names weeks Monday to Sunday", () => {
    expect(weekStart("2026-W26")).toBe("2026-06-22");
    expect(isoWeek("2026-06-01")).toBe("2026-W23");
    expect(weekLabel("2026-06-22")).toBe("22–28 Jun 2026");
    expect(weekLabel("2026-06-29")).toBe("29 Jun – 5 Jul 2026");
    expect(() => weekStart("2026-06-23")).toThrow(/not a Monday/);
  });
});

describe("the narrative may only cite the facts", () => {
  it("reads numbers but not dates, weeks, handles, hashtags or brand names", () => {
    const got = numbersIn("Glad2Glow and G2G on 22–28 Jun (W26, 2026): @chika_adelia16 drew 4.0M views, 35% of the week, #skintific1004 up 2.9 pt, ×426, 8-week range, 125 creators").map((n) => n.raw);
    expect(got).toEqual(["4.0M", "35%", "2.9 pt", "×426", "125"]);
  });

  const report = {
    week: { iso: "2026-W26" }, movers: [], platforms: ["tiktok"], watchlist: [], client_brands: [], near_misses: [], evidence: [],
    portfolio: { group: { key: "client-portfolio" }, cells: { tiktok: { covered: true, now: wk(9, 20.8, { posts: 1499 }), prev: wk(8, 26.046, { posts: 1900 }), history, flags: [] } } },
    panel: { tiktok: { now: { week: "", posts: 7217, views: 200_400_000 }, prev: { week: "", posts: 7295, views: 129_100_000 }, history: [], posts_change_pct: -1, views_change_pct: 55 } },
    rules: WEEKLY_RULES,
  } as unknown as WeeklyReport;
  const good: Narrative = {
    week: "2026-W26",
    summary: [
      { label: "New", stat: "0", stat_label: "moves beyond normal", text: "A quiet week on the watchlist." },
      { label: "Working", stat: "55%", stat_label: "more TikTok views in the panel", text: "Panel TikTok views rose 55%." },
      { label: "Worth testing", stat: "20.8%", stat_label: "Paragon's share of TikTok posts", text: "Paragon's share fell from 26.0% to 20.8%." },
    ],
    scoreboard_title: "A quiet week",
    movers_title: "Nothing moved beyond normal",
    drivers: [],
    actions: [{ title: "Win back TikTok share", detail: "Posts fell from 1,900 to 1,499.", brands: ["Wardah"], based_on: "Appendix" }],
  };

  it("accepts text whose numbers all come from the facts", () => {
    expect(checkNarrative(good, report)).toEqual([]);
  });

  it("rejects a number the facts do not contain", () => {
    const bad = { ...good, summary: [good.summary[0], good.summary[1], { ...good.summary[2], text: "Paragon's share fell to 19.4%." }] };
    expect(checkNarrative(bad, report).join()).toMatch(/19\.4%/);
  });

  it("rejects wordy text and a narrative for the wrong week", () => {
    const wordy = { ...good, week: "2026-W25", scoreboard_title: "This title goes on and on well past the twelve words a slide title is allowed to carry" };
    const problems = checkNarrative(wordy, report).join("\n");
    expect(problems).toMatch(/2026-W25/);
    expect(problems).toMatch(/scoreboard_title is \d+ words/);
  });
});
