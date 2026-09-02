import { describe, expect, it } from "vitest";
import { diffResults } from "../../agents/diff";
import { fallbackHeadline } from "../headline";
import { pickColumns, renderHtml, renderMarkdown, whatChangedLines } from "../render";
import type { SkillResult } from "../../skills/types";

const result: SkillResult = {
  skill: "compare", status: "ok", params_resolved: {}, summary: { window: "last 30 days" },
  rows: [{ brand_id: "a", source: "earned", posts: 10, share_of_voice_pct: 3.2, evidence_ids: ["ev_01"] }, { brand_id: "b", source: "earned", posts: 4, share_of_voice_pct: 1.1, evidence_ids: ["ev_02"] }],
  evidence: [{ id: "ev_01", type: "aggregate", ref: "x", label: "a" }, { id: "ev_02", type: "aggregate", ref: "y", label: "b" }],
  meta: { matched: 2, returned: 2, data_window: { from: "2026-06-01", to: "2026-06-30" }, freshness: "2026-06-30T16:59:00Z", caveats: ["c1"], sql_hash: "h", duration_ms: 1 },
  diff_key: "brand_id",
};

describe("report rendering", () => {
  const prev = [{ brand_id: "a", source: "earned", posts: 5, share_of_voice_pct: 1.0 }, { brand_id: "c", source: "earned", posts: 1, share_of_voice_pct: 0.5 }];
  const diff = diffResults(prev, result.rows, "brand_id", { watch: { share_of_voice_pct: { pts: 1 }, posts: { pct: 50 } } });

  it("lists new, changed and gone in that order with deltas", () => {
    const lines = whatChangedLines(diff, "brand_id");
    expect(lines[0]).toMatch(/^NEW b/);
    expect(lines[1]).toMatch(/^CHANGED a: share_of_voice_pct 1 → 3.20 \(\+2.2 pts\), posts 5 → 10 \(\+100%\)/);
    expect(lines[2]).toMatch(/^GONE c/);
  });
  it("renders markdown with the prototype sections", () => {
    const md = renderMarkdown({ title: "Weekly read — 3 changes", result, diff, headline: "Lead [ev_01]." });
    expect(md).toContain("# Weekly read — 3 changes");
    expect(md).toContain("Lead [ev_01].");
    expect(md).toContain("## What changed");
    expect(md).toContain("## Table");
    expect(md).toContain("| brand_id | source | posts | share_of_voice_pct |");
    expect(md).toContain("## Caveats");
    expect(pickColumns(result.rows)).toEqual(["brand_id", "source", "posts", "share_of_voice_pct"]);
  });
  it("renders html with escaped content and a report link", () => {
    const html = renderHtml({ title: "T <b>", result, diff, appUrl: "https://x.test/reports/1", headline: "H" });
    expect(html).toContain("T &lt;b&gt;");
    expect(html).toContain("What changed");
    expect(html).toContain('href="https://x.test/reports/1"');
  });
  it("fallback headline states the run and the diff without a model", () => {
    const s = fallbackHeadline(result, diff);
    expect(s.generated_by).toBe("fallback");
    expect(s.headline).toContain("/compare over 2026-06-01 to 2026-06-30");
    expect(s.headline).toContain("1 new, 1 gone, 1 changed, 0 unchanged");
    expect(fallbackHeadline(result, diffResults(null, result.rows, "brand_id")).headline).toContain("first run");
  });
});
