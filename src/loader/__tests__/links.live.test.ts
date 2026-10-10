/**
 * Migration 0036's triggers keep a post and its links in step. The migration's own functions run against temporary copies
 * of posts, post_items and comments, in one transaction on the live database; nothing touches the real tables, and the
 * copies and functions are dropped before it ends.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sql } from "../../db/client";

const dir = "src/db/migrations";
const stmts = readFileSync(`${dir}/${readdirSync(dir).find((f) => f.startsWith("0036_"))}`, "utf8").split("--> statement-breakpoint").map((s) => s.trim());
const fns = stmts.filter((s) => s.includes("CREATE OR REPLACE FUNCTION")).map((s) => s.replace(/CREATE OR REPLACE FUNCTION "(\w+)"/, "CREATE FUNCTION pg_temp.$1"));
const triggers = stmts.filter((s) => s.startsWith("CREATE TRIGGER")).map((s) => s.replace(/EXECUTE FUNCTION "(\w+)"/, "EXECUTE FUNCTION pg_temp.$1"));
const fnNames = fns.map((s) => s.match(/pg_temp\.(\w+)/)![1]);

const W = "maudy-ayunda";
const link = (url: string, brand: string, views: number, caption = "cap") =>
  `insert into posts (workspace_id, platform, url, brand_id, source, collection, posted_at, month, views, likes, caption)
   values ('${W}', 'x', '${url}', '${brand}', 'earned', 'keyword', '2026-09-01T00:00:00Z', '2026-09-01', ${views}, 1, '${caption}')`;

type Row = Record<string, unknown>;

describe("links and their post (migration 0036, temporary copies)", () => {
  it("keeps a post and its links in step", async () => {
    const steps: [string, string][] = [
      ["new", link("u1", "a", 100)],
      ["second", link("u1", "b", 50)],
      ["after_second", `select brand_id, views, (select count(*) from post_items)::int as posts from posts order by brand_id`],
      ["label", `update posts set stance = 'positive', stance_source = 'model', relevant = false where brand_id = 'b'`],
      ["after_label", `select brand_id, stance, relevant, (select stance from post_items) as post_stance from posts order by brand_id`],
      ["post_change", `update post_items set views = 200, likes = 7`],
      ["after_post_change", `select brand_id, views, likes from posts order by brand_id`],
      ["comment", `insert into comments (workspace_id, post_id, platform_comment_id) select '${W}', id, 'c1' from posts where brand_id = 'b'`],
      ["after_comment", `select (c.item_id = p.item_id) as same from comments c join posts p on p.id = c.post_id`],
      ["both", `update posts set caption = case when brand_id = 'a' then 'from a' else 'from b' end, views = case when brand_id = 'a' then 300 else 250 end`],
      ["after_both", `select brand_id, caption, views, stance from posts order by brand_id`],
      ["reload", `insert into posts (workspace_id, platform, url, brand_id, source, collection, posted_at, month, views, likes, caption)
         values ('${W}', 'x', 'u1', 'a', 'earned', 'keyword', '2026-09-01T00:00:00Z', '2026-09-01', 5, 1, 'stale')
         on conflict (workspace_id, platform, url, brand_id) do update set views = excluded.views, caption = excluded.caption
         where (posts.views, posts.caption) is distinct from (excluded.views, excluded.caption)`],
      ["after_reload", `select brand_id, views, caption from posts order by brand_id`],
      ["drop_one", `delete from comments; delete from posts where brand_id = 'b'`],
      ["after_drop_one", `select count(*)::int as posts from post_items`],
      ["drop_last", `delete from posts`],
      ["after_drop_last", `select count(*)::int as posts from post_items`],
    ];
    const qs = [
      `create temp table post_items (like public.post_items including all) on commit drop`,
      `create temp table posts (like public.posts including all) on commit drop`,
      `create temp table comments (like public.comments including all) on commit drop`,
      ...fns, ...triggers,
      ...steps.flatMap(([, q]) => q.split("; ")),
      `drop table pg_temp.comments, pg_temp.posts, pg_temp.post_items`,
      ...fnNames.map((n) => `drop function pg_temp.${n}()`),
    ];
    const res = (await sql.transaction(qs.map((t) => sql.query(t)))) as unknown as Row[][];
    // results of the steps, in order (a step with two statements answers twice)
    const at = (name: string) => {
      let i = 3 + fns.length + triggers.length;
      for (const [n, q] of steps) { if (n === name) return res[i]; i += q.split("; ").length; }
      throw new Error(name);
    };
    // a second brand's link takes the post's fields: one post, both links at its 100 views
    expect(at("after_second")).toEqual([{ brand_id: "a", views: "100", posts: 1 }, { brand_id: "b", views: "100", posts: 1 }]);
    // a label written through one link reaches the post and the other link; relevance stays with its brand
    expect(at("after_label")).toEqual([{ brand_id: "a", stance: "positive", relevant: null, post_stance: "positive" }, { brand_id: "b", stance: "positive", relevant: false, post_stance: "positive" }]);
    // a change to the post reaches every link
    expect(at("after_post_change")).toEqual([{ brand_id: "a", views: "200", likes: 7 }, { brand_id: "b", views: "200", likes: 7 }]);
    // a comment is on its link's post
    expect(at("after_comment")).toEqual([{ same: true }]);
    // one statement changing two links differently: the link with the most views speaks for the post; other fields keep
    expect(at("after_both")).toEqual([{ brand_id: "a", caption: "from a", views: "300", stance: "positive" }, { brand_id: "b", caption: "from a", views: "300", stance: "positive" }]);
    // a link written again with old numbers takes its post's: the loader writes the post first
    expect(at("after_reload")).toEqual([{ brand_id: "a", views: "300", caption: "from a" }, { brand_id: "b", views: "300", caption: "from a" }]);
    // a post stays while it has a link, and goes with its last
    expect(at("after_drop_one")).toEqual([{ posts: 1 }]);
    expect(at("after_drop_last")).toEqual([{ posts: 0 }]);
  }, 120_000);
});
