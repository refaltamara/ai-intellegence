import { describe, expect, it } from "vitest";
import { panelFilters, panelWindow, validatePanel, type PanelSpec } from "../panelSpec";
import { endsPartway, panelColumns } from "../panels";
import { arrange } from "../sections";

const line: PanelSpec = {
  key: "pn-affiliates", title: "TikTok affiliates, week on week", description: "Posts with a cart on TikTok", chart: "line", width: "full",
  query: { entity: "posts", metrics: ["count_posts", "sum_views"], group_by: ["week"], filters: { platform: ["tiktok"], has_cart: true }, order_by: "week asc", change: true },
  span: { n: 8, unit: "week" },
};

describe("Dashboard panels (16 Oct 2026)", () => {
  it("checks the chart against the query", () => {
    expect(validatePanel(line)).toEqual([]);
    expect(validatePanel({ ...line, chart: "number" })).toContain("chart number: no group_by (one figure).");
    expect(validatePanel({ ...line, query: { ...line.query, group_by: ["platform"] } })).toEqual(expect.arrayContaining(["query.change: only for a panel over time (group by day, week or month).", "chart line: needs a day, week or month in group_by."]));
    expect(validatePanel({ ...line, chart: "stacked" })).toContain("chart stacked: group by the time and one more (sentiment, platform, brand…).");
    expect(validatePanel({ ...line, query: { ...line.query, filters: { date_from: "2026-01-01" } } })).toContain("query.filters: leave dates out; the Dashboard's period sets them.");
    expect(validatePanel({ ...line, span: { n: 99, unit: "week" } })).toContain("span: 2 to 120 days, 52 weeks or 24 months.");
    expect(validatePanel({ ...line, chart: "pie" as never })[0]).toMatch(/^chart: one of/);
  });
  it("looks back its span from the Dashboard's last day, in whole weeks or months", () => {
    // 30 Sep 2026 is a Wednesday: eight weeks back to the Monday seven weeks before
    expect(panelWindow(line, { from: "2026-09-01", to: "2026-09-30" })).toEqual({ from: "2026-08-10", to: "2026-09-30" });
    expect(panelWindow({ span: { n: 6, unit: "month" } }, { from: "2026-09-01", to: "2026-09-30" })).toEqual({ from: "2026-04-01", to: "2026-09-30" });
    expect(panelWindow({ span: { n: 30, unit: "day" } }, { from: "2026-09-01", to: "2026-09-30" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(panelWindow({}, { from: "2026-09-01", to: "2026-09-30" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("takes the Dashboard's platform and brands unless its own query fixes them", () => {
    expect(panelFilters(line, { from: "2026-09-01", to: "2026-09-30", platform: "instagram", brands: ["wardah"] })).toEqual({ platform: ["tiktok"], has_cart: true, brand_id: ["wardah"], date_from: "2026-08-10", date_to: "2026-09-30" });
    const plain = { query: { entity: "comments" as const, metrics: ["count_comments"] } };
    expect(panelFilters(plain, { from: "2026-10-01", to: "2026-10-15", platform: "all", brands: [] })).toEqual({ date_from: "2026-10-01", date_to: "2026-10-15" });
    expect(panelFilters(plain, { from: "2026-10-01", to: "2026-10-15", platform: "threads", brands: [] })).toEqual({ platform: ["threads"], date_from: "2026-10-01", date_to: "2026-10-15" });
  });
  it("says when the last week or month is not whole yet", () => {
    expect(endsPartway("week", "2026-09-30")).toBe(true);
    expect(endsPartway("week", "2026-10-04")).toBe(false); // a Sunday
    expect(endsPartway("month", "2026-09-30")).toBe(false);
    expect(endsPartway("month", "2026-10-15")).toBe(true);
    expect(endsPartway(undefined, "2026-10-15")).toBe(false);
  });
  it("labels the columns in the query's order, each measure with its change", () => {
    const cols = panelColumns(line, [{ week: "2026-09-21", count_posts: 307, sum_views: 18096173, count_posts_change_pct: 79.5, sum_views_change_pct: 13 }]);
    expect(cols.map((c) => `${c.key}:${c.format}`)).toEqual(["week:text", "count_posts:int", "count_posts_change_pct:change_pct", "sum_views:compact", "sum_views_change_pct:change_pct"]);
    expect(cols[2].label).toBe("Posts: change");
  });
  it("places the team's panels among the sections: where the order puts them, a new one last, hidden ones aside", () => {
    const p = [{ key: "p:pn-affiliates", label: "Affiliates", width: "full" as const }, { key: "p:pn-new", label: "New", width: "half" as const }];
    const a = arrange("brand_kol", { order: ["p:pn-affiliates", "rankings"], hidden: ["p:pn-new"] }, false, p);
    expect(a.shown.map((s) => s.key)).toEqual(["p:pn-affiliates", "rankings", "mix", "tiers", "trend", "creators", "content"]);
    expect(a.hidden.map((s) => s.key)).toEqual(["p:pn-new"]);
    // a panel that is gone (removed) drops out of a saved order
    expect(arrange("brand_kol", { order: ["p:pn-gone", "rankings"] }, false, []).shown[0].key).toBe("rankings");
  });
});
