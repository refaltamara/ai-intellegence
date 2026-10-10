import { describe, expect, it } from "vitest";
import { buildRepDeck, checkRep, cleanRepSlides, plainRep, plainText, repRecord, repSheet, repSlideTexts, type ReputationReport } from "../deck";
import { cleanSpec } from "../../decks/spec";
import { DECK_TEMPLATES, templatesFor } from "../../decks/templates";
import { PR } from "../../roles/model";

const q = (text: string) => ({ text, translation: null, likes: 12, platform: "threads", url: "https://www.threads.com/@a/post/x", sentiment: "negative", theme: "voucher issue" });
const post = { url: "https://www.threads.com/@a/post/x", platform: "threads", handle: "a", source: "earned", caption: "promo gopay 😭 gak masuk", posted_at: "2026-09-15", views: 58000, comments: 39, negative: 17 };

function report(): ReputationReport {
  const days = Array.from({ length: 30 }, (_, i) => ({ d: `2026-08-${String(22 + i).padStart(2, "0")}`.replace(/-08-(3[2-9]|[4-9]\d)/, (_, x) => `-09-${String(Number(x) - 31).padStart(2, "0")}`), comments: 500, negative: 40, neg_pct: 8, level: "calm" as const, norm: true }));
  return {
    as_of: "2026-09-25", settled: "2026-09-22", tz: "Asia/Jakarta", voice_posts: 0, hide: [], conversation: { now: { posts: { n: 0, negative: 0, neutral: 0, positive: 0, labelled: 0 }, comments: { n: 0, negative: 0, neutral: 0, positive: 0, labelled: 0 } }, prev: { posts: { n: 0, negative: 0, neutral: 0, positive: 0, labelled: 0 }, comments: { n: 0, negative: 0, neutral: 0, positive: 0, labelled: 0 } }, by_voice: [] },
    focus: { id: "gopay", name: "GoPay", is_client: true },
    brands: [{ id: "gopay", name: "GoPay" }, { id: "dana", name: "DANA" }],
    platforms: ["instagram", "threads"],
    filters: { brand: "gopay", days: 7, platform: "all", from: "2026-09-14", to: "2026-09-20", prev_from: "2026-09-07", prev_to: "2026-09-13" },
    status: { level: "calm", reason: "7.2% of 894 comments about GoPay were negative on 20 Sep, against a 28-day norm of 10.3% (0.7×).", day: days.at(-1)!, baseline: { neg_pct: 10.3, comments_per_day: 558, days: 28 }, multiple: 0.7, history: days, rule: "Issue: 2× the norm." },
    kpis: { mentions: { now: 853, prev: 618 }, reach: { now: 7_200_000, prev: 4_800_000 }, comments: { now: 5723, prev: 3533 }, neg_pct: { now: 7.9, prev: 9.3 }, intent_pct: { now: 7.5, prev: 7.1 } },
    issues: [{ split: { posts: { n: 0, negative: 0, neutral: 0, positive: 0, labelled: 0 }, comments: { n: 0, negative: 0, neutral: 0, positive: 0, labelled: 0 } },
      topic_id: "fintech-id:promo-cashback", topic: "Promo & Cashback", catch_all: false, negative: 88, negative_prev: 16, comments: 620, neg_pct: 14.2, stage: "building", first_day: "2026-09-14", peak_day: "2026-09-17",
      daily: [{ d: "2026-09-14", negative: 5 }, { d: "2026-09-15", negative: 30 }], platforms: [{ platform: "threads", negative: 70 }], themes: [{ theme: "voucher issue", n: 16 }],
      posts: [post], quotes: [q("kok aku gak dapet voucher nya 😭")], industry: { negative: 37, negative_prev: 62, neg_pct: 4.6, brands_up: [] }, scope: "only_us",
    }],
    rising: [], amplifiers: [{ handle: "writtenbyfeb", platform: "threads", tier: "nano", followers: 3613, posts: 1, views: 694000, comments: 94, neg_pct: 36.2, top_url: post.url, likes: 0, stanced: 0, against: 0 }],
    narratives: [{ split: { posts: { n: 0, negative: 0, neutral: 0, positive: 0, labelled: 0 }, comments: { n: 0, negative: 0, neutral: 0, positive: 0, labelled: 0 } }, topic_id: "fintech-id:promo-cashback", topic: "Promo & Cashback", catch_all: false, comments: 620, comments_prev: 248, share: 12.9, neg_pct: 14.2, neg_pct_prev: 3.6, quote: q("Klik banner mulai dr 5000 lalu pilih aja") }],
    own: [{ platform: "instagram", posts: 4, views: 1_300_000, comments: 17, neg_pct: 29.4, replies: 0, others_neg_pct: 12.5 }], own_worst: [post],
    service: { measured: true, total: 84, quotes: [q("saldo gopay saya hilang 600rb")] },
    competitive: [{ id: "gopay", name: "GoPay", is_focus: true, is_client: true, posts: 853, posts_prev: 618, sov: 31.1, views: 7_200_000, comments: 5723, neg_pct: 7.9, neg_pct_prev: 9.3, intent_pct: 7.5, top_issue: null }],
    coverage: [], off_topic_posts: 0, notes: [],
    title: "Weekly Reputation Report", grain: "week",
    period: { key: "2026-W38", grain: "week", from: "2026-09-14", to: "2026-09-20", label: "14–20 Sep 2026", short: "W38" },
    previous: { key: "2026-W37", grain: "week", from: "2026-09-07", to: "2026-09-13", label: "7–13 Sep 2026", short: "W37" },
    slides: ["summary", "timeline", "issues", "issue_detail", "narratives", "competitive", "voices", "service"],
  };
}

describe("PR decks", () => {
  it("each role starts from its own templates", () => {
    expect(templatesFor("pr").map((t) => t.key)).toEqual(PR.deck_templates);
    expect(templatesFor("brand_kol").every((t) => !t.family)).toBe(true);
    expect(DECK_TEMPLATES.every((t) => t.roles.length > 0)).toBe(true);
  });
  it("a PR spec needs a known brand and keeps known slides in order", () => {
    const known = new Set(["gopay", "dana"]);
    expect(cleanSpec({ grain: "month", rep: { focus: "gopay", platform: "x", slides: ["service", "nope", "issues"] } }, known)).toMatchObject({ grain: "month", watchlist: [], rep: { focus: "gopay", platform: "x", slides: ["summary", "issues", "service"] } });
    expect(cleanSpec({ rep: { focus: "ovo" } }, known)).toEqual({ error: "pick the brand this deck is about" });
    expect(cleanRepSlides(undefined)).toEqual(["summary"]);
  });
  it("the plain words pass the check, and an invented number does not", () => {
    const r = report();
    const n = plainRep(r);
    expect(checkRep(n, r)).toEqual([]);
    expect(n.summary.headline).toMatch(/Promo & Cashback complaints are ours alone/);
    const bad = { ...n, summary: { ...n.summary, happened: "Negative comments rose 37.5% this week." } };
    expect(checkRep(bad, r).join(" ")).toMatch(/37.5%/);
    const short = { ...n, issues: [] };
    expect(checkRep(short, r).join(" ")).toMatch(/issues must have 1/);
  });
  it("draws every slide, one per issue for the deep-dives, without emoji, with text for Ask AI", () => {
    const r = report();
    const n = plainRep(r);
    const slides = repRecord(r, n);
    expect(slides).toHaveLength(8);
    const texts = repSlideTexts(r, n);
    expect(texts[0].title).toMatch(/GoPay/);
    expect(texts.map((t) => t.text).join(" ")).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(repSheet(r)).toContain("Promo & Cashback: 88 negative comments");
    expect(plainText("promo 😭 gak masuk 🙏🏻")).toBe("promo gak masuk");
    expect(typeof buildRepDeck).toBe("function");
  });
});
