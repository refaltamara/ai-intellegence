import { readFileSync } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { recipients } from "../../delivery/email";
import { checkNarrative, type Narrative } from "../narrative";
import { drawPdf, niceAxis, recordDeck } from "../pdfdeck";
import { blocksFor, latestCompleteWeek, validContract, weeklyEmail } from "../scheduled";
import type { WeeklyReport } from "../types";
import { factSheet, plainNarrative, writeNarrative } from "../write";

const fixture = (w: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", `paragon-${w}.facts.json`), "utf8")) as WeeklyReport;
const busy = fixture("2026-W23"); // three movers
const quiet = fixture("2026-W26"); // none
const sample = JSON.parse(readFileSync(path.join(process.cwd(), "data/weekly/paragon/2026-W23.json"), "utf8")) as Narrative;

/** A stand-in for the Messages API that answers with the given narratives in turn. */
function fakeModel(answers: (Partial<Narrative> | null)[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  const create = async (p: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
    calls.push(JSON.parse(JSON.stringify(p)));
    const a = answers[Math.min(i++, answers.length - 1)];
    const content = a ? [{ type: "tool_use", id: `tu_${i}`, name: "write_weekly_report", input: a }] : [{ type: "text", text: "Here you go." }];
    return { content } as unknown as Anthropic.Message;
  };
  return { create, calls };
}

describe("the words of a scheduled report", () => {
  it("the fact sheet prints the numbers the deck prints, and names the mover keys", () => {
    const s = factSheet(busy);
    expect(s).toContain('drivers[].key must be exactly: "timephoria", "g2g", "skintific"');
    expect(s).toContain("11.2%");
    expect(factSheet(quiet)).toContain("quiet week");
    expect(s).toContain("CREATOR TIERS");
    expect(s).toContain('closeups[].key must be exactly, in order: "hanasui", "esqa"');
    expect(s).toContain("#brighteninggelmask");
  });

  it("the plain narrative always passes the check, busy week or quiet", () => {
    for (const r of [busy, quiet]) expect(checkNarrative(plainNarrative(r), r)).toEqual([]);
    expect(plainNarrative(quiet).summary[0].stat).toBe("Quiet");
  });

  it("keeps the model's narrative when it passes on the first try", async () => {
    const m = fakeModel([sample]);
    const w = await writeNarrative(busy, { create: m.create });
    expect(w).toMatchObject({ by: "model", attempts: 1, problems: [] });
    expect(w.narrative.summary[0].stat).toBe("11.2%");
  });

  it("sends the problems back and keeps the corrected draft", async () => {
    const wrong = { ...sample, summary: [{ ...sample.summary[0], text: "Timephoria's share hit 987.6% of views." }, sample.summary[1], sample.summary[2]] };
    const m = fakeModel([wrong, sample]);
    const w = await writeNarrative(busy, { create: m.create });
    expect(w).toMatchObject({ by: "model", attempts: 2 });
    const retry = m.calls[1].messages[m.calls[1].messages.length - 1];
    expect(JSON.stringify(retry)).toContain("987.6%");
    expect(JSON.stringify(retry)).toContain("is_error");
  });

  it("falls back to the plain narrative after three failures, or when the model never calls the tool", async () => {
    const bad = { ...sample, scoreboard_title: "A title that is far too long for any slide in this deck, by a lot of words" };
    const w = await writeNarrative(busy, { create: fakeModel([bad]).create });
    expect(w.by).toBe("fallback");
    expect(w.attempts).toBe(3);
    expect(w.problems.join()).toMatch(/scoreboard_title/);
    expect(checkNarrative(w.narrative, busy)).toEqual([]);
    expect((await writeNarrative(busy, { create: fakeModel([null]).create })).by).toBe("fallback");
  });

  it("falls back when the model errors", async () => {
    const w = await writeNarrative(busy, { create: async () => { throw new Error("overloaded"); } });
    expect(w.by).toBe("fallback");
    expect(w.problems.join()).toMatch(/overloaded/);
  });
});

describe("the PDF is the deck's layout", () => {
  it("records one page per slide: summary, scoreboard, movers, drivers, the landscape, the moves, two appendices", () => {
    // busy: 3 drivers + tiers, products, posting, 1 close-up slide, patterns → 12 slides and 2 appendix pages
    expect(recordDeck(busy, sample)).toHaveLength(14);
    // quiet: no drivers, 2 close-up slides → 10 slides and 2 appendix pages
    expect(recordDeck(quiet, plainNarrative(quiet))).toHaveLength(12);
  });

  it("a report from before the landscape keeps its old shape", () => {
    const { landscape: _l, ...old } = busy;
    expect(recordDeck(old as WeeklyReport, { ...sample, actions: sample.actions.slice(0, 3) })).toHaveLength(6 + busy.movers.length);
  });

  it("draws a PDF with those pages", async () => {
    const pdf = await drawPdf(recordDeck(busy, sample), { title: "test" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBe(14);
  }, 20_000);

  it("chart axes end just above the tallest bar", () => {
    expect(niceAxis(11.2)).toEqual({ max: 12, step: 2 });
    expect(niceAxis(3.8)).toEqual({ max: 4, step: 1 });
    expect(niceAxis(0.37).max).toBeCloseTo(0.4);
  });
});

describe("scheduling", () => {
  it("reports the last full week the data covers", () => {
    expect(latestCompleteWeek("2026-06-30")).toBe("2026-06-22"); // a Tuesday: the week before
    expect(latestCompleteWeek("2026-06-28")).toBe("2026-06-22"); // a Sunday: that week
  });

  it("checks the contract and binds it to the workspace", () => {
    expect(validContract({ client: { name: "X", brands: [] }, watchlist: [] }, "ws")).toMatch(/client/);
    const c = validContract({ workspace: "other", client: { name: "X", brands: [{ name: "A", brand_ids: ["a"] }] }, watchlist: [{ name: "B", group: "core", brand_ids: ["b"] }] }, "ws");
    expect(typeof c === "object" && c.workspace).toBe("ws");
  });

  it("reads recipient lists and rejects anything that is not an address", () => {
    expect(recipients("a@x.com, b@y.co; a@x.com")).toEqual(["a@x.com", "b@y.co"]);
    expect(recipients("a@x.com, not-an-email")).toBeNull();
    expect(recipients("")).toBeNull();
  });

  it("the email carries the summary, the movers and the actions, escaped", () => {
    const b = blocksFor(busy, { ...sample, actions: [{ ...sample.actions[0], title: "<script>x</script>" }] }, "model", []);
    const e = weeklyEmail(b, "https://app.example/reports/1", ["deck.pptx", "deck.pdf"]);
    expect(e.html).toContain("11.2%");
    expect(e.html).toContain("Timephoria");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("deck.pptx");
    expect(e.text).toContain("What Paragon should do");
  });
});
