/**
 * The checkpoint holds broken loads and lets clean ones in with warnings (src/loader/checks.ts). Synthetic loads are staged
 * against a real workspace and thrown away after; nothing reaches the core.
 */
import { afterAll, describe, expect, it } from "vitest";
import { runChecks } from "../checks";
import { discardLoad, openLoad, writeStaged } from "../stage";
import { emptyStaged, type FileReport, type StagedComment, type StagedPost } from "../types";

const WS = "maudy-ayunda";
const made: string[] = [];
const T = new Date("2026-09-15T05:00:00Z");

function post(i: number, over: Partial<StagedPost> = {}): StagedPost {
  return {
    platform: "threads", url: `https://threads.com/@check.test/post/T${i}`, brand_id: "maudyayunda", platform_post_id: `T${i}`, creator_handle: "check.test", creator_key: "check.test",
    source: "earned", collection: "keyword", account_type: null, posted_at: T.toISOString(), month: "2026-09-01", caption: "test", hashtags: null, tagged_handles: null,
    is_paid: null, has_cart: null, is_reseller: null, followers_at_post: 10, tier: "nano", universe: null, category_broad: null, product_category: null, content_format: null,
    content_type: "post", product_name: null, product_url: null, price: null, price_original: null, discount_percent: null, views: null, likes: 1, comments_count: 1,
    shares: null, saves: null, engagements: 2, engagements_lc: 2, captured_days: null, relevant: null, stub: false, flags: null, source_file: "check_test.csv", ...over,
  };
}
function comment(i: number, at: Date): StagedComment {
  return {
    platform: "threads", url: `https://threads.com/@check.test/post/T${i}`, brand_id: "maudyayunda", platform_comment_id: `threads:check-test-${i}`, author_handle: "someone",
    author_hash: "x", text: "a comment", posted_at: at.toISOString(), likes: 0, views: null, sentiment: null, sentiment_source: null, sentiment_confidence: null,
    theme: null, purchase_intent: null, translation: null, topic_id: null, flags: null, source_file: "check_test_comments.csv",
  };
}
const file = (rows: number, over: Partial<FileReport> = {}): FileReport => ({ file: "check_test.csv", kind: "posts", platform: "threads", rows_in: rows, staged: rows, merged: 0, dropped: 0, drops: {}, ...over });

async function check(posts: StagedPost[], comments: StagedComment[], files: FileReport[], facts: Record<string, unknown> = {}) {
  const id = await openLoad(WS, "profile", [], "test");
  made.push(id);
  await writeStaged(id, { ...emptyStaged(), posts, comments, files, facts });
  const r = await runChecks(id);
  return { ...r, outcome: (key: string) => r.checks.find((c) => c.key === key)?.outcome };
}

describe("load checks (live database, staging only)", () => {
  afterAll(async () => { for (const id of made) await discardLoad(id, "test"); });

  it("lets a clean load in, its flagged rows as warnings", async () => {
    const r = await check([post(1), post(2, { flags: ["zero_followers"] }), post(3, { flags: ["zero_views"], content_type: "video", views: 0 })], [], [file(3)]);
    expect(r.held).toBe(false);
    expect(r.outcome("accounted")).toBe("pass");
    expect(r.outcome("flag_zero_followers")).toBe("warn");
    expect(r.outcome("flag_zero_views")).toBe("warn");
  }, 60_000);

  it("holds rows missing against the file", async () => {
    const r = await check([post(1), post(2)], [], [file(10, { staged: 2 })]);
    expect(r.held).toBe(true);
    expect(r.outcome("accounted")).toBe("hold");
  }, 60_000);

  it("holds brands and labels the setup does not know", async () => {
    const r = await check([post(1)], [], [file(2, { staged: 1, dropped: 1, drops: { "unknown brand slug 'somebrand'": { count: 1, examples: [] } } })], { unknown_labels: ["meh"] });
    expect(r.held).toBe(true);
    expect(r.outcome("unknown")).toBe("hold");
  }, 60_000);

  it("holds dates read wrong", async () => {
    const r = await check([post(1, { posted_at: "2031-01-01T00:00:00Z" }), post(2)], [], [file(2)]);
    expect(r.held).toBe(true);
    expect(r.outcome("dates")).toBe("hold");
  }, 60_000);

  it("holds comments that come hours before their posts (a time zone read wrong)", async () => {
    const posts = Array.from({ length: 20 }, (_, i) => post(i));
    const comments = Array.from({ length: 20 }, (_, i) => comment(i, new Date(T.getTime() - 7 * 3600_000)));
    const r = await check(posts, comments, [file(20), file(20, { file: "check_test_comments.csv", kind: "comments" })]);
    expect(r.held).toBe(true);
    expect(r.outcome("comments_early")).toBe("hold");
  }, 60_000);

  it("holds a file that yields nothing", async () => {
    const r = await check([post(1)], [], [file(1), file(50, { file: "empty.csv", staged: 0, dropped: 50, drops: { "empty text": { count: 50, examples: [] } } })]);
    expect(r.held).toBe(true);
    expect(r.outcome("empty")).toBe("hold");
  }, 60_000);
});
