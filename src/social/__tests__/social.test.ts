import { describe, expect, it } from "vitest";
import { checkSocial, cleanSocialSlides, plainSocial, socialRecord, socialSheet, socialSlideTexts, type SocialReport } from "../deck";
import { readSocialFilters } from "../dashboard";
import { cleanSpec } from "../../decks/spec";
import { templatesFor } from "../../decks/templates";
import { ROLES, SOCIAL, workspaceRoles } from "../../roles/model";
import { plainText } from "../../reputation/deck";

const post = (i: number, eng: number, idx: number) => ({ url: `https://www.instagram.com/p/${i}/`, platform: "instagram", handle: "gopayindonesia", format: i % 2 ? "Video" : "Carousel", caption: "Lagi-lagi Mpok Saroh 😭 🇮🇩", posted_at: "2026-09-02", views: i % 2 ? 1_300_000 : null, engagements: eng, comments: 283, index: idx, neg_pct: 47 });

function report(): SocialReport {
  return {
    as_of: "2026-09-25", settled: "2026-09-22",
    focus: { id: "gopay", name: "GoPay", is_client: true }, brands: [{ id: "gopay", name: "GoPay" }, { id: "dana", name: "DANA" }], platforms: ["instagram", "tiktok"],
    filters: { brand: "gopay", days: 30, platform: "all", from: "2026-09-01", to: "2026-09-30", prev_from: "2026-08-01", prev_to: "2026-08-31" },
    comparable: false,
    kpis: { posts: { now: 227, prev: 1 }, engagements: { now: 171748, prev: 3768 }, median_eng: { now: 30, prev: 3768 }, video_views: { now: 934, prev: 3_100_000 }, comments: { now: 2629, prev: 74 }, neg_pct: { now: 19.7, prev: 64.9 }, reply_rate: { now: 0, prev: 0 } },
    accounts: [{ platform: "instagram", handle: "gopayindonesia", posts: 198, per_week: 46.2, median_eng: 34, median_views: 982, er: 3.95, comments: 2335, neg_pct: 19.7, replies: 0 }],
    formats: [{ format: "Video", posts: 101, post_share: 44.5, eng_share: 74.1, median_eng: 53, median_views: 972 }, { format: "Photo", posts: 81, post_share: 35.7, eng_share: 6.3, median_eng: 5, median_views: null }],
    timing: [{ dow: 1, band: "Morning", posts: 9, median_eng: 310 }, { dow: 3, band: "Evening", posts: 2, median_eng: null }],
    best: [post(1, 91193, 2682.1)], weakest: [post(2, 0, 0)],
    curve: [{ day: 0, share: 0.002 }, { day: 1, share: 0.529 }, { day: 2, share: 0.794 }, { day: 3, share: 0.891 }], watch: [],
    competitors: [{ id: "gopay", name: "GoPay", is_focus: true, posts: 227, per_week: 53, median_eng: 30, median_views: 972, comments: 2629, neg_pct: 19.7, top: null }, { id: "dana", name: "DANA", is_focus: false, posts: 28, per_week: 6.5, median_eng: 59, median_views: 2059, comments: 2552, neg_pct: 0.9, top: { url: "https://x.com/dana/status/1", platform: "x", engagements: 537, caption: "Bayar Indihome pakai DANA" } }],
    topics: [{ topic: "Transaction Issue", comments: 835, share: 31.8, neg_pct: 12.9, intent_pct: 2.4 }],
    quotes: { positive: [{ text: "Keren banget orang ganjur, 1orang tapi beras", translation: null, likes: 338, platform: "instagram", url: "https://www.instagram.com/p/1/", sentiment: "positive" }], negative: [] },
    capture: [], notes: ["Follower counts are a single capture per account, so audience growth is not shown yet."],
    title: "Monthly Content Review", grain: "month",
    period: { key: "2026-09", grain: "month", from: "2026-09-01", to: "2026-09-30", label: "September 2026", short: "Sep" },
    previous: { key: "2026-08", grain: "month", from: "2026-08-01", to: "2026-08-31", label: "August 2026", short: "Aug" },
    slides: ["summary", "accounts", "formats", "best", "competitors", "community"],
  };
}

describe("the Social Media role", () => {
  it("is a role a workspace can offer, with the same three features", () => {
    expect(ROLES.social).toBe(SOCIAL);
    expect(workspaceRoles("category", ["pr", "brand_kol", "social"])).toEqual(["pr", "brand_kol", "social"]);
    for (const k of ["dashboard", "decks", "chats"] as const) expect(SOCIAL.nav).toContain(k);
    expect(templatesFor("social").map((t) => t.key)).toEqual(SOCIAL.deck_templates);
  });
  it("reads its filters with 30 days by default", () => {
    expect(readSocialFilters({}, ["dana", "gopay"], "gopay")).toEqual({ brand: "gopay", days: 30, platform: "all" });
    expect(readSocialFilters({ days: "90", brand: "dana", platform: "tiktok" }, ["dana", "gopay"], "gopay")).toEqual({ brand: "dana", days: 90, platform: "tiktok" });
    expect(readSocialFilters({ days: "14" }, ["gopay"], null).days).toBe(30);
  });
  it("a Social spec needs a known brand and keeps known slides in order", () => {
    expect(cleanSpec({ grain: "month", social: { focus: "dana", slides: ["community", "nope", "formats"] } }, new Set(["gopay", "dana"]))).toMatchObject({ grain: "month", social: { focus: "dana", platform: "all", slides: ["summary", "formats", "community"] } });
    expect(cleanSocialSlides([])).toEqual(["summary"]);
  });
  it("the plain words pass the check, and an invented number does not", () => {
    const r = report();
    const n = plainSocial(r);
    expect(checkSocial(n, r)).toEqual([]);
    expect(n.summary.worked).toContain("74%");
    expect(checkSocial({ ...n, formats: "Video grew 12.5% this month." }, r).join(" ")).toMatch(/12.5%/);
  });
  it("draws one slide per kind, with text for Ask AI and no characters the fonts lack", () => {
    const r = report();
    const n = plainSocial(r);
    expect(socialRecord(r, n)).toHaveLength(6);
    const texts = socialSlideTexts(r, n).map((t) => t.text).join(" ");
    expect(texts).not.toMatch(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u);
    expect(socialSheet(r)).toContain("Video: 45%; 74%");
    expect(plainText("fypシ 🇮🇩 ok")).toBe("fyp ok");
  });
});
