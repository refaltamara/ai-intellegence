import { describe, expect, it } from "vitest";
import { applyPaneState, describeExclusion, describeParams, describeRerun, humanAction, nextState, paneOf, paneTitle, rowKey } from "../pane";

const rows = [
  { creator_id: "c1", creator_handle: "ana", views: 900, evidence_ids: ["ev_01"] },
  { creator_id: "c2", creator_handle: "budi", views: 500, evidence_ids: ["ev_02"] },
  { creator_id: "c3", creator_handle: "cici", views: 700, evidence_ids: ["ev_03"] },
  { creator_id: "c4", creator_handle: "dewi", views: null, evidence_ids: [] },
];

describe("paneOf", () => {
  const base = { id: "t1", name: "run_skill", status: "ok", skill: "discovery", title: "Creator discovery", params_resolved: { tiers: ["nano", "micro"], platform: "tiktok", window: { from: "2026-04-01", to: "2026-06-30" } } };
  it("opens a table for rows, a chart for three or more points, nothing for a sentence", () => {
    expect(paneOf({ ...base, rows })?.kind).toBe("table");
    expect(paneOf({ ...base, rows: [], chart: { type: "line", x: ["w1", "w2", "w3"], series: [] } })?.kind).toBe("chart");
    expect(paneOf({ ...base, rows: [], chart: { type: "line", x: ["w1", "w2"], series: [] } })).toBeNull();
    expect(paneOf({ ...base, rows: [] })).toBeNull();
    expect(paneOf({ ...base, status: "unavailable", rows })).toBeNull();
  });
  it("keeps a handful of query figures inline", () => {
    expect(paneOf({ id: "q", name: "query_metrics", status: "ok", rows: rows.slice(0, 2) })).toBeNull();
    expect(paneOf({ id: "q", name: "query_metrics", status: "ok", rows })?.kind).toBe("table");
  });
  it("titles tabs in plain language, never the skill name", () => {
    const t = paneTitle({ ...base, rows });
    expect(t).toBe("Creator discovery · nano, micro · TikTok · Apr–Jun 26");
    expect(t.startsWith("discovery")).toBe(false);
  });
  it("agent drafts and files have their own kinds", () => {
    expect(paneOf({ id: "d", name: "create_agent_draft", status: "ok", draft: { name: "x" } })?.kind).toBe("agent_draft");
    expect(paneOf({ id: "f", name: "export_run", status: "ok", file: { url: "/x" } })?.kind).toBe("file");
  });
});

describe("applyPaneState", () => {
  it("removes exclusions, filters, sorts with nulls last and keeps the skill's order otherwise", () => {
    expect(applyPaneState(rows, { excluded: ["c2"] }, "creator_id").map((r) => r.creator_handle)).toEqual(["ana", "cici", "dewi"]);
    expect(applyPaneState(rows, { filter: "ci" }, "creator_id").map((r) => r.creator_handle)).toEqual(["cici"]);
    expect(applyPaneState(rows, { sort: { key: "views", dir: "asc" } }, "creator_id").map((r) => r.creator_handle)).toEqual(["budi", "cici", "ana", "dewi"]);
    expect(applyPaneState(rows, {}, "creator_id").map((r) => r.creator_handle)).toEqual(["ana", "budi", "cici", "dewi"]);
  });
  it("falls back to the row's position when the diff key is missing", () => {
    expect(rowKey({ a: 1 }, "creator_id", 3)).toBe("#3");
    expect(rowKey({ brand_a: "x", brand_b: "y" }, "brand_a|brand_b", 0)).toBe("x|y");
  });
});

describe("deltas the model repeats", () => {
  it("describes an exclusion with counts, names and the top three", () => {
    const after = nextState({ excluded: [] }, { run_id: "r", action: "exclude_rows", ids: ["c1"], human: "" });
    const lines = describeExclusion(rows, { excluded: [] }, after, "creator_id");
    expect(lines[0]).toBe("Rows shown: 4 before, 3 now (4 in the full list).");
    expect(lines[1]).toBe("Removed: @ana.");
    expect(lines[2]).toBe("Top three in the list's own order: @budi, @cici, @dewi (before: @ana, @budi, @cici).");
  });
  it("describes a re-run with overlap and what is new", () => {
    const fresh = [rows[2], { creator_id: "c9", creator_handle: "eka", views: 1 }];
    const lines = describeRerun(rows, fresh, 120, 40, "creator_id");
    expect(lines[0]).toBe("Matched 120 before, 40 now; the list shows 2 rows (was 4).");
    expect(lines[1]).toBe("1 of the 2 rows were already in the previous list; 1 are new (first: @eka).");
  });
  it("phrases actions and merges state", () => {
    expect(humanAction("exclude_rows", 3, "creators")).toBe("You excluded 3 creators");
    expect(nextState({ excluded: ["a"] }, { run_id: "r", action: "include_rows", ids: ["a"], human: "" }).excluded).toEqual([]);
    expect(nextState({ excluded: ["a", "b"] }, { run_id: "r", action: "clear_exclusions", human: "" }).excluded).toEqual([]);
  });
});

describe("describeParams", () => {
  it("reads like a filter line", () => {
    const s = describeParams({ tiers: ["nano"], platform: "tiktok", window: { from: "2026-04-01", to: "2026-06-30" }, used_by: ["skintific"], exclude_used_by: ["wardahofficial"], rank_by: "views", limit: 50, brands: "all", min_views: 1000 }, { wardahofficial: "Wardah", skintific: "Skintific" });
    expect(s).toBe("Nano · TikTok · 1 Apr 2026 to 30 Jun 2026 · used by Skintific · excluding anyone who posted for Wardah · ranked by views · at least 1,000 views · top 50");
  });
});
