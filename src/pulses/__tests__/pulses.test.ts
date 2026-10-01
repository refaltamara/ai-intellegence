import { describe, expect, it } from "vitest";
import { parsePeriod, periodSetting } from "../../dashboard/period";
import type { SkillResult } from "../../skills/types";
import { cleanConfig, resolvePeriod, skillTable } from "../cards";
import { CARD_KINDS, KIND_INFO } from "../kinds";
import { TEMPLATES, templateCards } from "../templates";

const known = new Set(["skintific_official", "glad2glow_id"]);

describe("card settings", () => {
  it("keeps what a kind understands and drops the rest", () => {
    const c = cleanConfig("kpi", { platform: "tiktok", brands: ["skintific_official", "nope", "skintific_official"], period: "2026-W26", metric: "er", sort: "views", limit: 99 }, known);
    expect(c).toEqual({ platform: "tiktok", brands: ["skintific_official"], period: "2026-W26", metric: "er" });
  });

  it("falls back to safe defaults", () => {
    expect(cleanConfig("content", { platform: "x", period: "last year", sort: "drop table", limit: 999 }, known)).toEqual({ platform: "all", brands: [], period: "latest-month", sort: "views", q: "", limit: 12 });
    expect(cleanConfig("creators", null, known)).toMatchObject({ by: "views", limit: 8 });
    expect(cleanConfig("trend", { metric: "er" }, known).metric).toBe("posts");
    expect(cleanConfig("closeup", { brands: ["skintific_official", "glad2glow_id"] }, known).brands).toEqual(["skintific_official"]);
  });

  it("every kind has a label and a default size, and only pinned analyses work without a brand panel", () => {
    for (const k of CARD_KINDS) expect(KIND_INFO[k].label).toBeTruthy();
    expect(CARD_KINDS.filter((k) => !KIND_INFO[k].panel)).toEqual(["skill"]);
  });
});

describe("periods on a card", () => {
  it("latest-month and latest-week move with the data; a fixed period stays", () => {
    expect(resolvePeriod("latest-month", "2026-06-30").key).toBe("2026-06");
    expect(resolvePeriod("latest-week", "2026-06-30").from).toBe("2026-06-22");
    expect(resolvePeriod("2026-05", "2026-06-30").key).toBe("2026-05");
  });

  it("a Dashboard view is saved as moving when it shows the newest period", () => {
    expect(periodSetting(parsePeriod("2026-06")!, "2026-06-30")).toBe("latest-month");
    expect(periodSetting(parsePeriod("2026-W26")!, "2026-06-30")).toBe("latest-week");
    expect(periodSetting(parsePeriod("2026-05")!, "2026-06-30")).toBe("2026-05");
  });
});

describe("report-depth cards", () => {
  it("the report's points of view are card kinds of their own", () => {
    for (const k of ["tier_mix", "products", "posting", "closeup", "patterns"] as const) {
      expect(CARD_KINDS).toContain(k);
      expect(KIND_INFO[k].panel).toBe(true);
    }
    expect(TEMPLATES.find((t) => t.key === "competitor-deep-dive")!.cards.map((c) => c.kind)).toEqual(["rankings", "tier_mix", "products", "posting", "patterns", "closeup"]);
  });
});

describe("templates", () => {
  it("apply the brands and platform picked at creation to every card, and pass their own checks", () => {
    for (const t of TEMPLATES) {
      const cards = templateCards(t, { brands: ["glad2glow_id"], platform: "instagram" });
      for (const c of cards) {
        const cfg = cleanConfig(c.kind, c.config, known);
        expect(cfg.brands).toEqual(["glad2glow_id"]);
        expect(cfg.platform).toBe("instagram");
      }
    }
    expect(TEMPLATES.find((t) => t.key === "blank")!.panel).toBe(false);
  });
});

describe("a pinned analysis", () => {
  it("shows its first rows and plain columns only", () => {
    const result = { rows: [{ brand_id: "a", posts: 3, views: 10, evidence_ids: ["ev_1"], top_posts: [{}], url: "https://x" }, { brand_id: "b", posts: 1, views: 2 }] } as unknown as SkillResult;
    const t = skillTable(result, 1);
    expect(t.columns).toEqual(["brand_id", "posts", "views"]);
    expect(t.rows).toEqual([{ brand_id: "a", posts: 3, views: 10 }]);
  });
});
