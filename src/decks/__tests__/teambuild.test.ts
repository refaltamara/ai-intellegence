import PptxGenJS from "pptxgenjs";
import { describe, expect, it } from "vitest";
import { mentionPatterns } from "../../query/builder";
import type { Finding } from "../../competitor/types";
import { cleanChange, previewDeckChange } from "../changes";
import { cleanFindings, cleanSpec, type DeckSpec } from "../spec";
import { teamLine, teamShape, teamSheet, teamSlide } from "../teamSlide";

const rep: DeckSpec = { title: "Kahf Crisis Report", grain: "day", platforms: [], client: null, watchlist: [], slides: ["summary"], rep: { focus: "kahf", platform: "all", slides: ["summary", "pace", "issues", "voices"] } };
const deck = { workspace_id: "test", name: "Kahf Crisis Report", spec: rep, recurring: true };

const finding = (rows: Record<string, unknown>[], columns: Finding["columns"]): Finding => ({ key: "t1", title: "Comments mentioning halal", question: "comments that mention halal per day", status: "ok", columns, rows, rows_total: rows.length, data_window: { from: "2026-10-06", to: "2026-10-07" } });

describe("mentions filter", () => {
  it("keeps words, drops wildcards and short words, caps at twelve", () => {
    expect(mentionPatterns(["Halal", "%_", "x", "boikot"])).toEqual(["%halal%", "%boikot%"]);
    expect(mentionPatterns(Array.from({ length: 20 }, (_, i) => `word${i}`))).toHaveLength(12);
  });
});

describe("deck changes", () => {
  it("adds and drops the role's own slides, says what stays", async () => {
    const p = await previewDeckChange(deck, cleanChange({ add_slides: ["exposure"], remove_slides: ["voices"] }), null);
    expect(p.spec.rep!.slides).toEqual(["summary", "pace", "issues", "exposure"]);
    expect(p.lines.map((l) => l.sign)).toEqual(["+", "−", "="]);
    expect(p.changed).toBe(true);
  });
  it("refuses what the deck cannot carry, and keeps the summary", async () => {
    const p = await previewDeckChange(deck, cleanChange({ add_slides: ["scoreboard", "pace"], remove_slides: ["summary"] }), null);
    expect(p.changed).toBe(false);
    expect(p.dropped).toHaveLength(3);
  });
  it("keeps day on day for PR decks only", async () => {
    const bk = { ...deck, spec: { ...rep, rep: undefined, grain: "week" as const, slides: ["summary", "scoreboard"] as DeckSpec["slides"] } };
    const p = await previewDeckChange(bk, cleanChange({ grain: "day" }), null);
    expect(p.spec.grain).toBe("week");
    expect(p.dropped[0]).toMatch(/PR decks/);
    const q = await previewDeckChange(deck, cleanChange({ grain: "week", recurring: false, name: "Kahf weekly" }), null);
    expect(q.spec.grain).toBe("week");
    expect(q.lines.map((l) => l.text)).toEqual(["Day on day → Week on week", "Name: Kahf Crisis Report → Kahf weekly", "Stops repeating"]);
  });
  it("drops a team slide by its recipe key", async () => {
    const withTeam = { ...deck, spec: { ...rep, findings: [{ key: "t1", skill: "recipe:s-halal", params: {}, question: "q", title: "Halal" }] } };
    const p = await previewDeckChange(withTeam, cleanChange({ remove_slides: ["s-halal"] }), null);
    expect(p.spec.findings).toBeUndefined();
    expect(p.lines[0]).toMatchObject({ sign: "−", text: "Halal" });
  });
});

describe("specs keep a PR deck's team slides", () => {
  it("cleanSpec carries findings on rep and social decks", () => {
    const s = cleanSpec({ ...rep, findings: [{ key: "t1", skill: "recipe:s-halal", title: "Halal", after: "issues", by: "Raissa" }, { key: "t1", skill: "recipe:dup" }] }, new Set(["kahf"]));
    expect("error" in s).toBe(false);
    expect((s as DeckSpec).findings).toEqual([{ key: "t1", skill: "recipe:s-halal", params: {}, question: "", title: "Halal", after: "issues", by: "Raissa" }]);
    expect(cleanFindings([{ skill: "DROP TABLE" }])).toEqual([]);
  });
});

describe("team slides", () => {
  const time = finding([{ day: "2026-10-06", count_comments: 1 }, { day: "2026-10-07", count_comments: 34 }], [{ key: "day", label: "Day", format: "text" }, { key: "count_comments", label: "Comments", format: "int" }]);
  const split = finding([{ sentiment: "negative", count_comments: 10 }, { sentiment: "neutral", count_comments: 20 }, { sentiment: "positive", count_comments: 5 }], [{ key: "sentiment", label: "Sentiment", format: "text" }, { key: "count_comments", label: "Comments", format: "int" }]);
  it("picks its shape from the rows", () => {
    expect(teamShape(time)).toBe("time");
    expect(teamShape(split)).toBe("split");
    expect(teamShape({ columns: time.columns, rows: [] })).toBe("table");
  });
  it("names the peak and the biggest part from the rows themselves", () => {
    expect(teamLine(time)).toBe("35 comments in all; the most on 7 Oct (34).");
    expect(teamLine(split)).toBe("neutral: 57.1% of 35 comments.");
  });
  it("draws, and prints its rows on the fact sheet", () => {
    const pres = new PptxGenJS();
    expect(() => teamSlide(pres, time, { frame: () => undefined, period: "6–7 Oct 2026", foot: () => undefined })).not.toThrow();
    const sheet = teamSheet([time]).join("\n");
    expect(sheet).toMatch(/TEAM SLIDES/);
    expect(sheet).toMatch(/Comments 34/);
  });
});
