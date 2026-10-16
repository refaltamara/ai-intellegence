import { describe, expect, it } from "vitest";
import { cleanDraft } from "../describe";
import type { DeckOptions } from "../page";

const o = {
  brands: [{ id: "wardah", name: "Wardah" }, { id: "skintific", name: "Skintific" }, { id: "hanasui", name: "Hanasui" }],
  templates: [
    { key: "weekly-pulse", name: "Weekly Competitor Pulse", title: "Weekly Competitor Pulse", description: "", grain: "week", slides: ["summary", "scoreboard", "movers"], brands: "watchlist", recurring: true, roles: ["brand_kol"] },
    { key: "monthly-review", name: "Monthly Review", title: "Monthly Review", description: "", grain: "month", slides: ["summary", "trend"], brands: "watchlist", recurring: true, roles: ["brand_kol"] },
    { key: "weekly-rep", name: "Weekly Reputation Report", title: "Weekly Reputation Report", description: "", grain: "week", slides: ["summary"], brands: "focus", recurring: true, roles: ["pr"], family: "reputation", rep_slides: ["summary", "issues"] },
  ],
  slides: [{ kind: "summary", title: "Summary", description: "", pages: "1" }, { kind: "scoreboard", title: "Scoreboard", description: "", pages: "1" }, { kind: "trend", title: "Trend", description: "", pages: "1" }, { kind: "creators", title: "Top creators", description: "", pages: "1" }],
  rep_slides: [{ kind: "summary", title: "Summary", description: "" }, { kind: "issues", title: "Issues", description: "" }, { kind: "amplifiers", title: "Amplifiers", description: "" }],
  social_slides: [],
  platforms: ["tiktok", "instagram"],
  focus: "wardah",
  team_skills: [{ key: "halal-comments", title: "Halal comments", description: "", badge: "Fair" }],
  periods: { day: [], week: [], month: [] }, runs: [], client: null, starter: null, data_through: "2026-10-15", data_from: "2026-07-01",
} as unknown as DeckOptions;

describe("a deck laid out from a description (16 Oct 2026)", () => {
  it("keeps only what the options hold, summary first", () => {
    const d = cleanDraft({ template: "monthly-review", name: "Q4 brands", grain: "month", brands: ["wardah", "nope", "skintific"], platforms: ["tiktok", "x"], slides: ["creators", "ghost", "trend"], skills: ["halal-comments", "other"] }, o, "brand");
    expect(d).toMatchObject({ template: "monthly-review", name: "Q4 brands", grain: "month", brands: ["wardah", "skintific"], platforms: ["tiktok"], slides: ["summary", "creators", "trend"], skills: ["halal-comments"], focus: null });
  });
  it("falls back to the family's first template and its slides", () => {
    const d = cleanDraft({ template: "made-up", grain: "day", slides: ["ghost"] }, o, "brand");
    expect(d.template).toBe("weekly-pulse");
    // a brand deck never goes by day
    expect(d.grain).toBe("week");
    expect(d.slides).toEqual(["summary", "scoreboard", "movers"]);
    expect(d.platforms).toEqual(["tiktok", "instagram"]);
  });
  it("a PR deck takes one brand, a platform and the reputation library; it may go by day", () => {
    const d = cleanDraft({ template: "weekly-rep", grain: "day", focus: "hanasui", platform: "tiktok", slides: ["issues", "amplifiers"], brands: ["wardah"] }, o, "reputation");
    expect(d).toMatchObject({ template: "weekly-rep", grain: "day", focus: "hanasui", platform: "tiktok", slides: ["summary", "issues", "amplifiers"], brands: [], platforms: [] });
    expect(cleanDraft({ template: "weekly-rep", focus: "nope", platform: "myspace" }, o, "reputation")).toMatchObject({ focus: "wardah", platform: "all", slides: ["summary", "issues"] });
  });
});
