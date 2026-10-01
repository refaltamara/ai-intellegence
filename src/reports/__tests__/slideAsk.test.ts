import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { slideTexts } from "../../competitor/pdfdeck";
import type { Narrative } from "../../competitor/narrative";
import type { WeeklyReport } from "../../competitor/types";
import { contextPreamble } from "../../dashboard/ask";
import { validSlideRef } from "../slideAsk";

const busy = JSON.parse(readFileSync(path.join(__dirname, "../../competitor/__tests__/fixtures/paragon-2026-W23.facts.json"), "utf8")) as WeeklyReport;
const words = JSON.parse(readFileSync(path.join(process.cwd(), "data/weekly/paragon/2026-W23.json"), "utf8")) as Narrative;

describe("Ask AI on a weekly report slide", () => {
  it("every slide becomes text Ask AI can be told, chrome left out", () => {
    const s = slideTexts(busy, words);
    expect(s).toHaveLength(14);
    expect(s[9].title).toBe("Hanasui and ESQA: reach from their own TikTok accounts");
    expect(s[9].text).toContain("86% of the brand's TikTok views");
    expect(s[6].text).toContain("Mid-tier · 105 posts · 26.9M views (51%)");
    expect(s.every((x) => !x.text.includes("Fair · prepared for"))).toBe(true);
  });

  it("the browser sends only which report and slide", () => {
    expect(validSlideRef({ report_id: "b94cbe7a-6841-455c-9492-b38d20357c93", n: 10 })).toEqual({ report_id: "b94cbe7a-6841-455c-9492-b38d20357c93", n: 10 });
    expect(validSlideRef({ report_id: "x", n: 1 })).toBeNull();
    expect(validSlideRef({ report_id: "b94cbe7a-6841-455c-9492-b38d20357c93", n: 0 })).toBeNull();
  });

  it("CeMO is told the slide, the week to search, and to answer out loud", () => {
    const p = contextPreamble({
      source: "slide", title: "Hanasui and ESQA", scope: "", facts: [], back: "/weekly", question: "",
      slide: { report_id: "r", n: 10, total: 14, deck: "Weekly Competitor Pulse for Paragon", week: { from: "2026-06-01", to: "2026-06-07", label: "1–7 Jun 2026", previous: "25–31 May 2026" }, text: "20 TikTok posts from brand accounts brought 13.1M views" },
    });
    expect(p).toContain("slide 10 of 14");
    expect(p).toContain("window from 2026-06-01 to 2026-06-07");
    expect(p).toContain("13.1M views");
    expect(p).toMatch(/say out loud/);
  });
});
