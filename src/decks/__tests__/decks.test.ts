import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { weeklyRules } from "../../config/weekly";
import { checkNarrative } from "../../competitor/narrative";
import { recordDeck, slideTexts } from "../../competitor/pdfdeck";
import { deckPeriod, latestComplete, periodWords, seriesLabel } from "../../competitor/period";
import { cleanSlides, deckSlides } from "../../competitor/slides";
import type { WeeklyReport } from "../../competitor/types";
import { deckSystem, factSheet, plainNarrative } from "../../competitor/write";
import { findingColumns, periodParams } from "../findings";
import { nextRun, retryRun } from "../generate";
import { brandLabel, cleanSpec } from "../spec";
import { DECK_TEMPLATES } from "../templates";

const fixture = (w: string) => JSON.parse(readFileSync(path.join(__dirname, "../../competitor/__tests__/fixtures", `paragon-${w}.facts.json`), "utf8")) as WeeklyReport;

/** The W23 facts as a deck: picked slides, optionally without its client or by month. */
function asDeck(slides: string[], o: { client?: boolean; month?: boolean } = {}): WeeklyReport {
  const r = fixture("2026-W23");
  const d: WeeklyReport = { ...r, slides: cleanSlides(slides) };
  if (o.client === false) Object.assign(d, { client: "", client_brands: [], landscape: r.landscape ? { ...r.landscape, closeups: r.landscape.closeups.filter((c) => !c.client), tiers: { ...r.landscape.tiers, rows: r.landscape.tiers.rows.filter((t) => !t.client) } } : undefined });
  if (o.month) Object.assign(d, { grain: "month" });
  return d;
}

describe("deck periods", () => {
  it("reads a week from any day in it, and a month from YYYY-MM or a day", () => {
    expect(deckPeriod("week", "2026-06-24")).toMatchObject({ key: "2026-W26", from: "2026-06-22", to: "2026-06-28" });
    expect(deckPeriod("week", "2026-W26").from).toBe("2026-06-22");
    expect(deckPeriod("month", "2026-06")).toMatchObject({ key: "2026-06", from: "2026-06-01", to: "2026-06-30", label: "June 2026" });
    expect(deckPeriod("month", "2026-02-14").to).toBe("2026-02-28");
    expect(() => deckPeriod("month", "June")).toThrow();
  });
  it("the latest period is the last one the data fully covers", () => {
    expect(latestComplete("week", "2026-06-30").key).toBe("2026-W26");
    expect(latestComplete("week", "2026-06-28").key).toBe("2026-W26");
    expect(latestComplete("month", "2026-06-30").key).toBe("2026-06");
    expect(latestComplete("month", "2026-06-29").key).toBe("2026-05");
  });
  it("names the period the same way everywhere", () => {
    expect(periodWords("month")).toMatchObject({ this: "this month", last: "last month", over: "MoM" });
    expect(periodWords().span(8)).toBe("8-week");
    expect(seriesLabel("month", "2026-06-01")).toBe("Jun");
    expect(seriesLabel("week", "2026-06-22")).toBe("22 Jun");
  });
  it("a month is judged on its own lookback and size floors", () => {
    const m = weeklyRules(null, "month");
    expect(m.lookback_weeks).toBe(3);
    expect(m.min_posts).toBeGreaterThan(weeklyRules().min_posts);
    expect(weeklyRules({ lookback_weeks: 5 }, "month").lookback_weeks).toBe(5);
  });
  it("a recurring deck looks again at 07:00 WIB on the next Monday or the 1st", () => {
    expect(nextRun("week", new Date("2026-10-01T10:00:00Z"))).toBe("2026-10-05T00:00:00.000Z");
    expect(nextRun("week", new Date("2026-10-05T03:00:00Z"))).toBe("2026-10-12T00:00:00.000Z");
    expect(nextRun("month", new Date("2026-10-01T10:00:00Z"))).toBe("2026-11-01T00:00:00.000Z");
    expect(retryRun(new Date("2026-10-01T10:00:00Z"))).toBe("2026-10-02T00:00:00.000Z");
  });
});

describe("the slide library", () => {
  it("keeps known slides in deck order, the summary always first", () => {
    expect(cleanSlides(["evidence", "nonsense", "trend", "scoreboard"])).toEqual(["summary", "scoreboard", "trend", "evidence"]);
  });
  it("the weekly report keeps its fixed set; a deck drops what it cannot show", () => {
    expect(deckSlides(fixture("2026-W23"))).toEqual(["summary", "scoreboard", "movers", "drivers", "tiers", "products", "posting", "closeups", "patterns", "moves", "portfolio", "evidence"]);
    const d = asDeck(["scoreboard", "trend", "creators", "findings", "portfolio", "moves"], { client: false });
    expect(deckSlides(d)).toEqual(["summary", "scoreboard", "trend", "moves"]);
  });
  it("every template starts with the summary and only known slides", () => {
    for (const t of DECK_TEMPLATES) expect(cleanSlides(t.slides)).toEqual(t.slides);
  });
});

describe("a deck's words", () => {
  it("the plain words fill exactly the slides the deck carries, and pass the check", () => {
    const d = asDeck(["scoreboard", "trend", "movers", "drivers", "tiers", "moves", "evidence"]);
    const n = plainNarrative(d);
    expect(checkNarrative(n, d)).toEqual([]);
    expect(n.trends?.map((t) => t.platform)).toEqual(["tiktok", "instagram"]);
    expect(n.actions.length).toBeGreaterThanOrEqual(3);
    expect(n.actions.every((a) => a.priority)).toBe(true);
  });
  it("asks only for the fields of the slides it carries", () => {
    const d = asDeck(["trend", "moves"], { client: false });
    const sys = deckSystem(d);
    expect(sys).toContain("- trends:");
    expect(sys).toContain("- actions_title:");
    expect(sys).not.toContain("- drivers:");
    expect(sys).not.toContain("- closeups:");
    expect(sys).not.toContain("portfolio_note");
    expect(sys).toContain("the team reading it");
    expect(checkNarrative({ ...plainNarrative(d), trends: [] }, d).some((p) => p.startsWith("trends must follow"))).toBe(true);
  });
  it("says month where the deck runs by month", () => {
    const d = asDeck(["scoreboard", "movers", "moves"], { month: true });
    const n = plainNarrative(d);
    const text = slideTexts(d, n).map((s) => s.text).join("\n");
    expect(text).toContain("last month");
    expect(text).not.toContain("last week");
    expect(factSheet(d)).toContain("against last month");
  });
  it("draws one page per slide, a trend page per platform", () => {
    const d = asDeck(["scoreboard", "trend", "moves", "evidence"]);
    expect(recordDeck(d, plainNarrative(d)).length).toBe(1 + 1 + 2 + 1 + 1);
  });
  it("without a client: no portfolio, no 'prepared for', moves for the team", () => {
    const d = asDeck(["scoreboard", "moves", "portfolio", "evidence"], { client: false });
    const texts = slideTexts(d, plainNarrative(d));
    expect(texts.length).toBe(4);
    expect(texts.map((t) => t.text).join("\n")).not.toContain("Prepared for");
  });
});

describe("deck specs", () => {
  const known = new Set(["skintific_official", "officialhanasui", "wardahofficial"]);
  it("keeps known brands and needs one to watch", () => {
    expect(cleanSpec({ watchlist: [{ name: "X", brand_ids: ["nope"] }] }, known)).toEqual({ error: "pick at least one brand to watch" });
    const s = cleanSpec({ grain: "month", watchlist: [{ name: "Skintific", brand_ids: ["skintific_official", "nope"] }], slides: ["trend"] }, known);
    expect(s).toMatchObject({ grain: "month", client: null, slides: ["summary", "trend"], watchlist: [{ name: "Skintific", brand_ids: ["skintific_official"], group: "core" }] });
  });
  it("a brand cannot be both the client's and watched", () => {
    const s = cleanSpec({ client: { name: "Paragon", brands: [{ name: "Wardah", brand_ids: ["wardahofficial"] }] }, watchlist: [{ name: "Wardah", brand_ids: ["wardahofficial"] }] }, known);
    expect("error" in s && s.error).toMatch(/both/);
  });
  it("reads account-style brand names as brands", () => {
    expect(brandLabel("Officialhanasui")).toBe("Hanasui");
    expect(brandLabel("Wardah")).toBe("Wardah");
  });
});

describe("findings from Chats", () => {
  it("moves the analysis to the deck's period", () => {
    expect(periodParams("top-content", { window: { last_n_days: 30 }, month: "2026-04", brands: ["x"] }, { from: "2026-06-22", to: "2026-06-28" })).toEqual({ brands: ["x"], window: { from: "2026-06-22", to: "2026-06-28" } });
  });
  it("shows what a row is about, then its measures, the link last", () => {
    const cols = findingColumns([{ rank: 1, post_id: "p", url: "https://x", platform: "tiktok", creator_handle: "a", tier: "mid", posted_at: "2026-06-24", views: 10, likes: 2, engagements: 3, er_pct: 1.2, evidence_ids: [] }]);
    expect(cols.map((c) => c.key)).toEqual(["creator_handle", "platform", "tier", "views", "engagements", "er_pct", "url"]);
    expect(cols.find((c) => c.key === "er_pct")!.format).toBe("pct");
    expect(findingColumns([{ brand_a: "a", brand_b: "b", shared_creators: 3, jaccard: 0.06 }]).map((c) => c.format)).toEqual(["text", "text", "int", "num"]);
  });
});

describe("slides read from captions", () => {
  const captions = {
    floor: 10_000,
    coverage: { posts: 1200, read: 800, views: 90_000_000, read_views: 81_000_000, read_views_share: 90 },
    events: [
      { key: "skintific", name: "Skintific", client: false, event: "launch", event_name: "Green Cushion launch", posts: 42, creators: 30, owned_posts: 4, views: 12_400_000, first_seen: "2026-06-02", new: true, posts_prev: 0, top: { handle: "rina", url: "https://x/1", views: 2_100_000 } },
      { key: "g2g", name: "Glad2Glow", client: false, event: "sale_event", event_name: "6.6 sale", posts: 18, creators: 12, owned_posts: 6, views: 3_300_000, first_seen: "2026-05-28", new: false, posts_prev: 9, top: null },
    ],
    products: [
      { key: "skintific", name: "Skintific", client: false, product: "Green Cushion", posts: 60, creators: 41, views: 15_000_000, posts_prev: 12, hook: "transformation", hook_views_share: 55, angle: "oily skin all-day cover", offer_share: 20, top: { handle: "rina", url: "https://x/1", views: 2_100_000 } },
    ],
    offers: [{ key: "g2g", name: "Glad2Glow", client: false, read: 120, offer_posts: 41, offer_share: 34, top_offer: "bundle", top_offer_posts: 20 }],
  };
  const withCaptions = (slides: string[]) => ({ ...asDeck(slides), captions }) as WeeklyReport;
  it("are carried when the deck picked them and the captions hold something", () => {
    expect(deckSlides(withCaptions(["campaigns", "angles", "moves"]))).toEqual(["summary", "campaigns", "angles", "moves"]);
    expect(deckSlides(asDeck(["campaigns", "angles", "moves"]))).toEqual(["summary", "moves"]);
  });
  it("draw a page each and their plain words pass the check", () => {
    const d = withCaptions(["campaigns", "angles", "moves"]);
    const n = plainNarrative(d);
    expect(checkNarrative(n, d)).toEqual([]);
    expect(n.campaigns?.takeaway).toContain("Green Cushion launch");
    const texts = slideTexts(d, n);
    expect(texts.length).toBe(4);
    expect(texts[1].text).toContain("Green Cushion launch");
    expect(texts[1].text).toContain("34% of posts, mostly bundle");
    expect(texts[2].text).toContain("oily skin all-day cover");
  });
  it("the fact sheet prints the caption facts and the words may cite them", () => {
    const d = withCaptions(["campaigns", "angles"]);
    const sheet = factSheet(d);
    expect(sheet).toContain('Launch "Green Cushion launch": 42 posts (4 from brand accounts), 30 creators, 12.4M views; first seen 2 Jun (new this week)');
    expect(sheet).toContain("90% of their views");
    const n = { ...plainNarrative(d), campaigns: { title: "Skintific launched Green Cushion", takeaway: "42 posts and 12.4M views; Glad2Glow ran a 6.6 sale with offers in 34% of posts." }, angles: { title: "Green Cushion won on before/after", takeaway: "55% of its 15.0M views came from before/after posts." } };
    expect(checkNarrative(n, d)).toEqual([]);
    expect(checkNarrative({ ...n, angles: { title: "x", takeaway: "88.88% of its views" } }, d).some((p) => p.includes(`"88.88%"`))).toBe(true);
  });
});
