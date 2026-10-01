import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkNarrative, numbersIn, type Narrative } from "../narrative";
import type { WeeklyReport } from "../types";
import { closeupPicks, closeupLines, displayedNumbers, tierLegend } from "../view";
import { plainNarrative } from "../write";

const fixture = (w: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", `paragon-${w}.facts.json`), "utf8")) as WeeklyReport;
const busy = fixture("2026-W23");
const quiet = fixture("2026-W26");
const sample = (w: string) => JSON.parse(readFileSync(path.join(process.cwd(), `data/weekly/paragon/${w}.json`), "utf8")) as Narrative;

describe("the landscape slides", () => {
  it("close-ups go to watched brands that did not move: one slide on a busy week, two on a quiet one", () => {
    expect(closeupPicks(busy).map((s) => s.map((c) => c.key))).toEqual([["hanasui", "esqa"]]);
    const q = closeupPicks(quiet);
    expect(q).toHaveLength(2);
    expect(q.flat().some((c) => c.client)).toBe(false);
    expect(q.flat().every((c) => c.posts >= 30)).toBe(true);
  });

  it("a close-up reads its own channel, creators and offers from the facts", () => {
    const hanasui = busy.landscape!.closeups.find((c) => c.key === "hanasui")!;
    const lines = closeupLines(hanasui);
    expect(lines.map((l) => l.label)).toEqual(["Pushing", "Own channel", "Creators", "Offers"]);
    expect(lines[1].text).toContain("86% of the brand's TikTok views");
  });

  it("tier legend comes from the configured bands", () => {
    expect(tierLegend().map((t) => t.label)).toEqual(["Nano under 10K", "Micro 10K–50K", "Mid-tier 50K–500K", "Macro 500K–1.0M", "Mega 1.0M+"]);
  });

  it("the sample narratives for both weeks pass the check, landscape included", () => {
    expect(checkNarrative(sample("2026-W23"), busy)).toEqual([]);
    expect(checkNarrative(sample("2026-W26"), quiet)).toEqual([]);
  });

  it("the plain narrative fills every landscape field and stays within the rules", () => {
    for (const r of [busy, quiet]) {
      const n = plainNarrative(r);
      expect(n.tiers && n.products && n.posting && n.actions_title).toBeTruthy();
      expect(n.actions.length).toBeGreaterThanOrEqual(3);
      expect(n.actions.every((a) => a.priority)).toBe(true);
      expect(checkNarrative(n, r)).toEqual([]);
    }
  });

  it("rejects a landscape number the facts do not hold, and a missing priority", () => {
    const n = sample("2026-W23");
    const bad = { ...n, tiers: { ...n.tiers!, takeaway: "Mid-tier is 7% of Paragon's creator posts but 61.5% of its views." }, actions: [{ ...n.actions[0], priority: undefined }, ...n.actions.slice(1)] };
    const problems = checkNarrative(bad, busy);
    expect(problems.join()).toMatch(/tiers.takeaway: "61.5%"/);
    expect(problems.join()).toMatch(/actions\[0\]\.priority/);
  });

  it("double dates and clock times are not numbers to check; values with units still are", () => {
    expect(numbersIn("Run it from payday into 7.7, peaking at 19:00").map((x) => x.raw)).toEqual([]);
    expect(numbersIn("views rose to 1.1M and 2.2 pt").map((x) => x.raw)).toEqual(["1.1M", "2.2 pt"]);
  });

  it("every landscape number is in the pool the check uses", () => {
    const pool = displayedNumbers(busy);
    const p = busy.landscape!.patterns[0];
    expect(pool.views).toContain(p.views);
    expect(pool.percent).toContain(p.views_share);
  });
});
