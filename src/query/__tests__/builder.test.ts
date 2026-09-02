import { describe, expect, it } from "vitest";
import { queryMetrics } from "../builder";

const live = !!process.env.DATABASE_URL;
const d = live ? describe : describe.skip;

d("query_metrics builder (live)", () => {
  it("rejects unknown metrics, dimensions, filters and order_by", async () => {
    expect((await queryMetrics({ entity: "posts", metrics: ["sum_views; drop table posts"] as any }, "beauty-id")).status).toBe("error");
    expect((await queryMetrics({ entity: "posts", metrics: ["sum_views"], group_by: ["caption"] as any }, "beauty-id")).status).toBe("error");
    expect((await queryMetrics({ entity: "posts", metrics: ["sum_views"], filters: { raw: "1=1" } }, "beauty-id")).status).toBe("error");
    expect((await queryMetrics({ entity: "posts", metrics: ["sum_views"], order_by: "posted_at" }, "beauty-id")).status).toBe("error");
  }, 60_000);
  it("returns rows with evidence for a valid grouped query", async () => {
    const r = await queryMetrics({ entity: "posts", metrics: ["count_posts", "sum_views", "share_of_voice"], group_by: ["brand_id"], filters: { platform: "instagram", date_from: "2026-03-01", date_to: "2026-03-31" }, limit: 5 }, "beauty-id");
    expect(r.status).toBe("ok");
    expect(r.rows.length).toBe(5);
    expect(r.evidence.length).toBe(5);
    expect(typeof r.rows[0].count_posts).toBe("number");
  }, 60_000);
});
