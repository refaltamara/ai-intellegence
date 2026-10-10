/**
 * One post, its brands (src/loader/fold.ts): the fields copied between a post and its links are the same list in the
 * code, the schema and migration 0036's triggers, and the fold rule asks for every field it is given.
 */
import { readFileSync, readdirSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { postItems, posts } from "../../db/schema";
import { ITEM_COLS, ITEM_PICK, MATCH_SQL, foldSql, itemColsOf } from "../fold";

const dir = "src/db/migrations";
const sql0036 = readFileSync(`${dir}/${readdirSync(dir).find((f) => f.startsWith("0036_"))}`, "utf8");
const fn = (name: string) => {
  const start = sql0036.indexOf(`FUNCTION "${name}"`);
  expect(start, name).toBeGreaterThan(-1);
  return sql0036.slice(start, sql0036.indexOf("END $$", start));
};
const names = (t: Parameters<typeof getTableColumns>[0]) => Object.values(getTableColumns(t)).map((c) => c.name);

/** fields about a post and one brand: never copied between links */
const LINK_ONLY = ["brand_id", "source", "collection", "relevant", "match", "term", "checked_by", "brought_in_by", "account_type", "is_reseller", "has_cart",
  "universe", "category_broad", "product_category", "product_name", "product_url", "price", "price_original", "discount_percent"];

describe("post fields", () => {
  it("post_items holds exactly the post fields, with its key and lineage", () => {
    expect(names(postItems).sort()).toEqual([...ITEM_COLS, "id", "workspace_id", "platform", "url", "source_file", "load_id", "created_at"].sort());
  });

  it("every post field is on the links, and the link-only fields are on the links only", () => {
    const linkCols = names(posts);
    for (const c of [...ITEM_COLS, ...LINK_ONLY]) expect(linkCols, c).toContain(c);
    for (const c of LINK_ONLY) expect(names(postItems), c).not.toContain(c);
  });

  it("migration 0036's triggers copy every post field and no link-only field", () => {
    const link = fn("post_link_item"), toItem = fn("post_to_item"), toLinks = fn("item_to_links");
    for (const c of ITEM_COLS) {
      expect(link, `post_link_item ${c}`).toContain(`NEW.${c} := i.${c};`);
      expect(toItem, `post_to_item ${c}`).toContain(`    ${c} = CASE WHEN (x.nl).${c} IS DISTINCT FROM (x.ol).${c} THEN (x.nl).${c} ELSE i.${c} END`);
      expect(toLinks, `item_to_links ${c}`).toContain(` ${c} = n.${c}`);
    }
    for (const c of LINK_ONLY) {
      expect(link).not.toContain(`NEW.${c} :=`);
      expect(toItem).not.toContain(` ${c} = CASE`);
      expect(toLinks).not.toContain(` ${c} = n.${c}`);
    }
    expect(sql0036).toContain(`CREATE TRIGGER "posts_link_item" BEFORE INSERT ON "posts"`);
    expect(sql0036).toContain(`CREATE TRIGGER "comments_item" BEFORE INSERT OR UPDATE OF post_id ON "comments"`);
  });
});

describe("the fold", () => {
  it("takes every field it is given from its row, and the lineage from the reading", () => {
    const s = foldSql({ table: "posts", where: (x) => `${x}.workspace_id = $1`, cols: ITEM_COLS, carry: ["source_file"] });
    for (const c of ITEM_COLS) expect(s, c).toMatch(new RegExp(`\\b${c}\\b`));
    for (const p of new Set(Object.values(ITEM_PICK))) expect(s).toContain(`join posts g_${p} on g_${p}.platform = k.platform`);
    expect(s).toContain("g_reading.source_file as source_file");
    expect(s).toContain("g_creator.creator_id as creator_id");
    expect(s).toContain("g_time.posted_at as posted_at");
  });

  it("joins only the rows it needs, and names a staged row's creator from its handle", () => {
    const s = foldSql({ table: "staging.posts", where: (x) => `${x}.load_id = $1`, cols: ["views", "caption", "creator_id"], creator: (x) => `(select 1 from creators where handle = ${x}.creator_key)` });
    expect(s).not.toContain("g_stance");
    expect(s).not.toContain("g_tags");
    expect(s).toContain("(select 1 from creators where handle = g_creator.creator_key) as creator_id");
  });

  it("each source writes the post fields of its old columns, with creator and flags", () => {
    expect(itemColsOf("beauty")).toContain("content_format");
    expect(itemColsOf("beauty")).not.toContain("captured_days");
    expect(itemColsOf("listening")).toEqual(expect.arrayContaining(["captured_days", "tagged_handles", "is_paid", "creator_id", "flags", "read_at"]));
    for (const s of ["beauty", "listening", "profile"] as const) for (const c of itemColsOf(s)) expect(LINK_ONLY).not.toContain(c);
  });

  it("says how we know from the collection: owned, tagged, else keyword", () => {
    expect(MATCH_SQL("p")).toBe("case when p.source = 'owned' then 'owned' when p.collection = 'tagged' then 'tagged' else 'keyword' end");
  });
});
