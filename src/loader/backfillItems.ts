/**
 * One row per real post for what was loaded before (DECISIONS, 10 Oct 2026, "One row per real thing"): each post's brand
 * rows are folded into one post_items row by the loader's own rule (src/loader/fold.ts), every brand row becomes its link
 * (item_id) and takes the post's fields, and says how we know (match) and who last judged its relevance (checked_by).
 * Comments get their post. Each step is one transaction with posts' writers held back, so a label
 * written meanwhile is not lost (one workspace and platform at a time). Safe to run again: a post already folded is left alone.
 * Run between migrations 0035 and 0036 (0036 requires every link to have its post, and adds the triggers).
 */
import { sql } from "../db/client";
import { ITEM_COLS, MATCH_SQL, foldSql } from "./fold";

const q = async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[];

export type ItemsReport = { workspace: string; platform: string; links: number; items_added: number; links_changed: number; changed: Record<string, number>; checked_by: number; comments: number };

const cols = ITEM_COLS.join(", ");
const differs = (a: string, b: string) => `(${ITEM_COLS.map((c) => `${a}.${c}`).join(", ")}) is distinct from (${ITEM_COLS.map((c) => `${b}.${c}`).join(", ")})`;

/** what folding changes on the links, per field: the links against their folded post, before the links are written */
const IMPACT_SQL = `
  select count(*)::int as links, ${ITEM_COLS.map((c) => `count(*) filter (where p.${c} is distinct from i.${c})::int as "${c}"`).join(", ")}
    from posts p join post_items i on i.workspace_id = p.workspace_id and i.platform = p.platform and i.url = p.url
   where p.workspace_id = $1 and p.platform = $2`;

const ITEMS_SQL = `
  with i as (
    insert into post_items (workspace_id, platform, url, ${cols}, source_file, load_id)
    select $1, f.platform, f.url, ${ITEM_COLS.map((c) => `f.${c}`).join(", ")}, f.source_file, f.load_id
      from (${foldSql({ table: "posts", where: (x) => `${x}.workspace_id = $1 and ${x}.platform = $2`, cols: ITEM_COLS, carry: ["source_file", "load_id"] })}) f
    on conflict (workspace_id, platform, url) do nothing
    returning 1
  ) select count(*)::int as n from i`;

const LINKS_SQL = `
  with u as (
    update posts p set item_id = i.id, match = coalesce(p.match, ${MATCH_SQL("p")}), ${ITEM_COLS.map((c) => `${c} = i.${c}`).join(", ")}
      from post_items i
     where p.workspace_id = $1 and p.platform = $2 and i.workspace_id = $1 and i.platform = $2 and i.url = p.url
       and (p.item_id is distinct from i.id or p.match is null or ${differs("p", "i")})
    returning 1
  ) select count(*)::int as n from u`;

/** who last judged a link's relevance: the newest relevance label's author (a rule, a model, a person) */
const CHECKED_SQL = `
  with c as (
    select distinct on (l.target_id) l.target_id, b.name as by
      from labels l join labellers b on b.id = l.labeller_id
     where l.workspace_id = $1 and l.target = 'post' and l.kind = 'relevant'
     order by l.target_id, l.labelled_at desc, l.id desc
  ), u as (
    update posts p set checked_by = c.by from c where p.id = c.target_id and p.workspace_id = $1 and p.platform = $2 and p.checked_by is distinct from c.by returning 1
  ) select count(*)::int as n from u`;

const COMMENTS_SQL = `
  with u as (
    update comments c set item_id = p.item_id from posts p
     where c.workspace_id = $1 and p.id = c.post_id and p.platform = $2 and c.item_id is distinct from p.item_id
    returning 1
  ) select count(*)::int as n from u`;

export async function backfillItems(only: string | null = null, log: (s: string) => void = () => {}): Promise<ItemsReport[]> {
  const parts = await q<{ id: string; platform: string }>(
    `select distinct workspace_id as id, platform from posts where $1::text is null or workspace_id = $1 order by 1, 2`, [only]);
  const out: ItemsReport[] = [];
  for (const { id, platform } of parts) {
    const started = Date.now();
    // writers (labeller, caption reading, loads) wait for this fold; readers carry on
    const r = (await sql.transaction([
      sql.query(`lock table posts in share row exclusive mode`),
      sql.query(ITEMS_SQL, [id, platform]),
      sql.query(IMPACT_SQL, [id, platform]),
      sql.query(LINKS_SQL, [id, platform]),
      sql.query(CHECKED_SQL, [id, platform]),
      sql.query(COMMENTS_SQL, [id, platform]),
    ])) as unknown as [unknown, { n: number }[], Record<string, number>[], { n: number }[], { n: number }[], { n: number }[]];
    const impact = r[2][0] ?? { links: 0 };
    const changed = Object.fromEntries(Object.entries(impact).filter(([k, v]) => k !== "links" && Number(v) > 0)) as Record<string, number>;
    const rep: ItemsReport = { workspace: id, platform, links: impact.links, items_added: r[1][0].n, links_changed: r[3][0].n, changed, checked_by: r[4][0].n, comments: r[5][0].n };
    out.push(rep);
    log(`${id} ${platform}: ${rep.links} links, ${rep.items_added} posts added, ${rep.links_changed} links written, ${rep.checked_by} checked_by, ${rep.comments} comments (${Math.round((Date.now() - started) / 1000)} s)`);
    if (Object.keys(changed).length) log(`  fields the fold changed on links: ${Object.entries(changed).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  return out;
}

/** links whose post fields differ from their post, and links without a post: both 0 when the core is in step */
export async function itemsCheck(only: string | null = null): Promise<{ workspace: string; links: number; items: number; unlinked: number; out_of_step: number; orphans: number }[]> {
  return q(
    `select w.id as workspace,
            (select count(*)::int from posts p where p.workspace_id = w.id) as links,
            (select count(*)::int from post_items i where i.workspace_id = w.id) as items,
            (select count(*)::int from posts p where p.workspace_id = w.id and p.item_id is null) as unlinked,
            (select count(*)::int from posts p join post_items i on i.id = p.item_id where p.workspace_id = w.id and ${differs("p", "i")}) as out_of_step,
            (select count(*)::int from post_items i where i.workspace_id = w.id and not exists (select 1 from posts p where p.item_id = i.id)) as orphans
       from workspaces w where $1::text is null or w.id = $1 order by w.id`,
    [only],
  );
}
