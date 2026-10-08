import { describe, expect, it } from "vitest";
import { historyTurns } from "../../chat/loop";
import { contextPreamble } from "../ask";
import { askHref, decodeAsk, encodeAsk, pulseAskHref, validAsk, type AskContext, type AskRef } from "../askref";
import { caveatsFor, change, filterQuery, readContentQuery, readFilters, unescapeUnicode } from "../data";
import { daysCovered, monthOf, parsePeriod, periodOptions, shiftPeriod, weekOf } from "../period";

describe("periods", () => {
  it("parses months and ISO weeks, and rejects the rest", () => {
    expect(parsePeriod("2026-06")).toMatchObject({ grain: "month", from: "2026-06-01", to: "2026-06-30", label: "June 2026" });
    expect(parsePeriod("2026-W26")).toMatchObject({ grain: "week", from: "2026-06-22", to: "2026-06-28" });
    for (const bad of ["2026-13", "2026-W54", "June", "", null, "2026-6"]) expect(parsePeriod(bad)).toBeNull();
  });
  it("steps back across a year and across month lengths", () => {
    expect(shiftPeriod(parsePeriod("2026-01")!, -1).key).toBe("2025-12");
    expect(shiftPeriod(parsePeriod("2026-03")!, -1).to).toBe("2026-02-28");
    expect(shiftPeriod(parsePeriod("2026-W01")!, -1).key).toBe("2025-W52");
  });
  it("finds the month and week of a day", () => {
    expect(monthOf("2026-06-30").key).toBe("2026-06");
    expect(weekOf("2026-06-30").from).toBe("2026-06-29");
    expect(weekOf("2026-06-28").from).toBe("2026-06-22");
  });
  it("offers only periods that overlap the data, newest first", () => {
    const o = periodOptions("2026-01-01", "2026-06-30");
    expect(o.months.map((p) => p.key)).toEqual(["2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01"]);
    expect(o.weeks).toHaveLength(12);
    expect(o.weeks[0].from).toBe("2026-06-29");
  });
  it("says when a period is only partly covered", () => {
    expect(daysCovered(parsePeriod("2026-06")!, "2026-01-01", "2026-06-15")).toEqual({ days: 15, of: 30 });
    expect(daysCovered(parsePeriod("2026-04")!, "2026-04-05", "2026-06-30")).toEqual({ days: 26, of: 30 });
  });
});

describe("filters", () => {
  const ctx = { asOf: "2026-06-30", brands: [{ id: "skintific_official" }, { id: "wardahofficial" }] };
  it("defaults to all platforms, all brands and the latest month", () => {
    const f = readFilters({}, ctx);
    expect(f).toMatchObject({ platform: "all", brands: [] });
    expect(f.period.key).toBe("2026-06");
  });
  it("drops unknown brands and platforms", () => {
    const f = readFilters({ platform: "myspace", brands: "skintific_official,nope", period: "2026-W26" }, ctx);
    expect(f.platform).toBe("all");
    expect(f.brands).toEqual(["skintific_official"]);
    expect(filterQuery(f)).toBe("brands=skintific_official&period=2026-W26");
  });
  it("bounds the content query", () => {
    expect(readContentQuery({ sort: "er", page: "999", q: "x".repeat(200) })).toMatchObject({ sort: "er", page: 40 });
    expect(readContentQuery({ sort: "drop table" }).sort).toBe("views");
  });
});

describe("changes and caveats", () => {
  it("reads a change from nothing as new, and nothing to nothing as no change", () => {
    expect(change(10, 0)).toEqual({ pct: null, isNew: true });
    expect(change(0, 0)).toBeNull();
    expect(change(150, 100)).toEqual({ pct: 50, isNew: false });
    expect(change(5, null)).toBeNull();
  });
  it("warns about a partly captured previous period and a changing roster", () => {
    const may = parsePeriod("2026-05")!;
    const apr = parsePeriod("2026-04")!;
    const out = caveatsFor([
      { platform: "tiktok", bucket: "2026-05-01", days: 31, brands: 48 },
      { platform: "tiktok", bucket: "2026-04-01", days: 23, brands: 40 },
    ], may, apr, { days: 31, of: 31 });
    expect(out.join(" ")).toContain("23 of 30 days of April 2026");
    expect(out.join(" ")).toContain("48 brands in May 2026 and 40 in April 2026");
  });
  it("shows escaped emoji as emoji", () => {
    expect(unescapeUnicode("Arms up \\ud83e\\ude77 yes")).toBe("Arms up \u{1FA77} yes");
  });
});

describe("Ask why references", () => {
  const ref: AskRef = { k: "brand", brand: "skintific_official", platform: "tiktok", brands: [], period: "2026-06" };
  it("round-trips through a URL", () => {
    expect(decodeAsk(encodeAsk(ref))).toEqual(validAsk(ref));
    expect(askHref(ref).startsWith("/?ask=")).toBe(true);
    const post: AskRef = { k: "post", url: "https://www.tiktok.com/@a/video/1", platform: "all", brands: ["x"], period: "2026-W26" };
    expect(decodeAsk(encodeAsk(post))).toEqual(validAsk(post));
  });
  it("rejects anything that is not a known shape", () => {
    expect(decodeAsk("not base64!")).toBeNull();
    expect(validAsk({ ...ref, k: "sql" })).toBeNull();
    expect(validAsk({ ...ref, period: "2026-13" })).toBeNull();
    expect(validAsk({ ...ref, platform: "myspace" })).toBeNull();
    expect(validAsk({ ...ref, platform: "x" })?.platform).toBe("x"); // X and Threads are real platforms in listening workspaces
    expect(validAsk({ k: "tier", tier: "giant", platform: "all", brands: [], period: "2026-06" })).toBeNull();
    expect(validAsk({ k: "creator", creator: "1; drop", platform: "all", brands: [], period: "2026-06" })).toBeNull();
    expect(validAsk({ k: "post", url: "javascript:alert(1)", platform: "all", brands: [], period: "2026-06" })).toBeNull();
  });
  it("puts the figures in front of the question, in the turn and in the replayed history", () => {
    const c: AskContext = { source: "dashboard", title: "Skintific", scope: "TikTok · June 2026 · all brands", facts: [{ label: "Views", value: "335M (+450%)" }], back: "/dashboard?period=2026-06", question: "Why?" };
    expect(contextPreamble(c)).toContain("Views: 335M (+450%)");
    const { messages } = historyTurns([{ role: "user", content_json: { text: "Why did it jump?", context: c } }, { role: "assistant", content_json: { text: "Because." } }]);
    expect(String(messages[0].content)).toContain("looking at: Skintific");
    expect(String(messages[0].content)).toContain("Why did it jump?");
  });
});

describe("Ask CeMO from the Pulse", () => {
  it("carries only the card, and refuses any other", () => {
    const ref = decodeAsk(pulseAskHref("themes").split("ask=")[1]);
    expect(ref).toEqual({ k: "pulse", card: "themes", platform: "all", brands: [], period: "" });
    expect(validAsk({ k: "pulse", card: "drop table" })).toBeNull();
    expect(validAsk({ k: "pulse", card: "now", brands: ["x"], period: "2026-06", numbers: [1] })).toEqual({ k: "pulse", card: "now", platform: "all", brands: [], period: "" });
  });
  it("tells CeMO the figures came from the Pulse", () => {
    const c: AskContext = { source: "pulse", title: "How it is going", scope: "Posts through 2026-10-08 06:00", facts: [{ label: "Last six hours", value: "112 comments about the case" }], back: "/pulse", question: "Is it cooling down?" };
    const text = contextPreamble(c);
    expect(text).toContain("from the Pulse");
    expect(text).toContain("Last six hours: 112 comments about the case");
    expect(text).not.toContain("from the dashboard");
  });
});
