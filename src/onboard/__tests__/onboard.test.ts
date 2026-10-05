import { describe, expect, it } from "vitest";
import { brandMatcher, isRelevant, names } from "../relevance";
import { handleOf, when } from "../listening";
import { stem, suggestBrands } from "../load";
import { DUMP_TABLES, tableOf } from "../storage";

describe("relevance rule", () => {
  const m = brandMatcher(["gopay", "go pay", "@gopayindonesia"], ["go pay attention"]);
  it("matches a term at the start of a word, any case", () => {
    expect(names(m, "Bayar pakai GoPay aja")).toBe(true);
    expect(names(m, "#gopaylater promo")).toBe(true);
    expect(names(m, "cek @gopayindonesia")).toBe(true);
  });
  it("does not match inside a word", () => {
    expect(names(m, "legopay is not a brand")).toBe(false);
  });
  it("takes never phrases out first", () => {
    expect(names(m, "Please go pay attention to this")).toBe(false);
    expect(names(m, "go pay attention, and bayar pakai gopay")).toBe(true);
  });
  it("matches a term in capitals only in capitals, as a whole word", () => {
    const d = brandMatcher(["DANA"]);
    expect(names(d, "Top up DANA sekarang")).toBe(true);
    expect(names(d, "dana darurat itu penting")).toBe(false);
    expect(names(d, "DANAMON bank")).toBe(false);
    expect(names(d, "(DANA)")).toBe(true);
  });
  it("counts owned posts and tagged accounts without a caption", () => {
    const hs = new Set(["gopayindonesia"]);
    const none = brandMatcher([]);
    expect(isRelevant({ owned: true, tagged: [], caption: null }, hs, none)).toBe(true);
    expect(isRelevant({ owned: false, tagged: ["GoPayIndonesia"], caption: null }, hs, none)).toBe(true);
    expect(isRelevant({ owned: false, tagged: ["someone"], caption: "nothing here" }, hs, none)).toBe(false);
  });
});

describe("dump parsing", () => {
  it("reads naive timestamps as UTC and converts offsets", () => {
    expect(when("2026-09-14 10:00:00")?.toISOString()).toBe("2026-09-14T10:00:00.000Z");
    expect(when("2026-09-14T10:00:00+0700")?.toISOString()).toBe("2026-09-14T03:00:00.000Z");
    expect(when("2026-09-14")?.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(when("")).toBeNull();
    expect(when("not a date")).toBeNull();
  });
  it("normalises handles", () => {
    expect(handleOf("@@GoPayIndonesia ")).toBe("gopayindonesia");
    expect(handleOf("")).toBeNull();
  });
  it("names a file's table by its prefix", () => {
    expect(tableOf("_content__20260925.csv")).toBe("_content_");
    expect(tableOf("dump/comment_sentiment_20260925101010.csv")).toBe("comment_sentiment");
    expect(tableOf("readme.txt")).toBeNull();
    expect(DUMP_TABLES).toContain(tableOf("content_tagged_user_20260925.csv"));
  });
});

describe("brand suggestions", () => {
  it("reduces handles to a family name", () => {
    expect(stem("@bankbca")).toBe("bca");
    expect(stem("dana.id")).toBe("dana");
    expect(stem("ovo_id")).toBe("ovo");
  });
  it("groups a family's handles under one brand, biggest first", () => {
    const s = suggestBrands([
      { handle: "ovo.id", platforms: ["instagram"], posts: 10 },
      { handle: "bankbca", platforms: ["tiktok"], posts: 50 },
      { handle: "ovo_id", platforms: ["tiktok"], posts: 5 },
    ]);
    expect(s.map((x) => x.id)).toEqual(["bca", "ovo"]);
    expect(s[1].handles.map((h) => h.handle)).toEqual(["ovo.id", "ovo_id"]);
    expect(s[0].name).toBe("BCA");
  });
});
