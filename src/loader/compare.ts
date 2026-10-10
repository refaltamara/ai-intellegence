/**
 * What a staged load would change in the core, without changing it (src/loader/): per column, how many rows would
 * differ from what the core holds, with examples. A load of files the core already holds should change nothing:
 * that is how the one loader was shown to write what the old loaders wrote (DECISIONS, 10 Oct 2026).
 */
import { sql } from "../db/client";
import { COMMENT_WRITE, POST_WRITE } from "./columns";
import { foldSql, isItemCol, itemColsOf } from "./fold";
import type { SourceKind } from "./types";

export type Diff = { rows: number; matched: number; missing: number; extra?: number; differs: Record<string, number>; examples: Record<string, unknown[]> };

const q = async <T>(text: string, params: unknown[]) => (await sql.query(text, params)) as T[];

/**
 * staged posts against the core: overwrite → the staged value; coalesce → the staged value where it has one. A post's own
 * fields are compared after folding its staged brand rows (fold.ts), as the promotion writes them; the rest per link.
 */
export async function comparePosts(loadId: string, ws: string, source: SourceKind): Promise<Diff> {
  const { cols, mode } = POST_WRITE[source];
  const fold = foldSql({
    table: "staging.posts", where: (x) => `${x}.load_id = $1 and not ${x}.stub`, cols: itemColsOf(source),
    creator: (x) => `(select c.id from creators c where c.workspace_id = $2 and c.platform = ${x}.platform and c.handle = ${x}.creator_key)`,
  });
  const src = (c: string) => (isItemCol(c) ? `f.${c}` : `s.${c}`);
  const want = (c: string) => (mode === "coalesce" ? `coalesce(${src(c)}, p.${c})` : src(c));
  // creator and flags are the load's, always (as the promotion writes them)
  const all = [...cols, "creator_id", "flags"];
  const expr = (c: string) => (c === "creator_id" || c === "flags" ? `(p.${c} is distinct from f.${c})` : `(${want(c)} is distinct from p.${c})`);
  const from = (select: string, join: "join" | "left join") => `with f as (${fold})
    select ${select} from staging.posts s join f on f.platform = s.platform and f.url = s.url
      ${join} posts p on p.workspace_id = $2 and p.platform = s.platform and p.url = s.url and p.brand_id = s.brand_id
     where s.load_id = $1 and not s.stub`;
  const head = (await q<Record<string, number>>(
    from(`count(*)::int as rows, count(p.id)::int as matched, count(*) filter (where p.id is null)::int as missing,
            ${all.map((c) => `count(*) filter (where p.id is not null and ${expr(c)})::int as "d_${c}"`).join(", ")}`, "left join"),
    [loadId, ws],
  ))[0];
  const differs: Record<string, number> = {};
  const examples: Record<string, unknown[]> = {};
  for (const c of all) {
    const n = head[`d_${c}`];
    if (!n) continue;
    differs[c] = n;
    examples[c] = await q(
      `${from(`s.platform, s.url, s.brand_id, ${c === "creator_id" || c === "flags" ? `f.${c}::text as staged, p.${c}::text as core` : `${want(c)}::text as staged, p.${c}::text as core`}`, "join")}
         and ${expr(c)} limit 4`,
      [loadId, ws],
    );
  }
  // stubs: a post only known from its comments is written only when the post is not there
  const stubs = (await q<{ n: number; missing: number }>(
    `select count(*)::int as n, count(*) filter (where p.id is null)::int as missing from staging.posts s
       left join posts p on p.workspace_id = $2 and p.platform = s.platform and p.url = s.url and p.brand_id = s.brand_id
      where s.load_id = $1 and s.stub`, [loadId, ws]))[0];
  if (stubs.n) differs.stub_posts_not_in_core = stubs.missing;
  // rows the core has from these files that the load did not stage
  const files = (await q<{ f: string }>(`select distinct source_file as f from staging.posts where load_id = $1 and source_file is not null`, [loadId])).map((r) => r.f);
  const extra = files.length ? (await q<{ n: number }>(
    `select count(*)::int as n from posts p where p.workspace_id = $2 and p.source_file = any($3::text[])
       and not exists (select 1 from staging.posts s where s.load_id = $1 and s.platform = p.platform and s.url = p.url and s.brand_id = p.brand_id)`,
    [loadId, ws, files]))[0].n : 0;
  return { rows: head.rows, matched: head.matched, missing: head.missing, extra, differs, examples };
}

/** staged creators against the core, after the source's merge rule */
export async function compareAccounts(loadId: string, ws: string, source: SourceKind): Promise<Diff> {
  // beauty: the later last-seen day wins (a tie to the load); listening and profile: the load's value where it has one
  const f = source === "beauty"
    ? `case when s.last_seen >= coalesce(c.last_seen, '1900-01-01') then s.followers_latest else c.followers_latest end`
    : `coalesce(s.followers_latest, c.followers_latest)`;
  const t = source === "beauty"
    ? `case when s.last_seen >= coalesce(c.last_seen, '1900-01-01') then s.tier_latest else c.tier_latest end`
    : `coalesce(s.tier_latest, c.tier_latest)`;
  const checks: Record<string, string> = {
    followers_latest: `${f} is distinct from c.followers_latest`,
    tier_latest: `${t} is distinct from c.tier_latest`,
    first_seen: `least(c.first_seen, s.first_seen) is distinct from c.first_seen`,
    last_seen: `greatest(c.last_seen, s.last_seen) is distinct from c.last_seen`,
    ...(source === "listening" ? { display_name: `coalesce(s.display_name, c.display_name) is distinct from c.display_name` } : {}),
  };
  const head = (await q<Record<string, number>>(
    `select count(*)::int as rows, count(c.id)::int as matched, count(*) filter (where c.id is null)::int as missing,
            ${Object.entries(checks).map(([k, e]) => `count(*) filter (where c.id is not null and ${e})::int as "d_${k}"`).join(", ")}
       from staging.accounts s left join creators c on c.workspace_id = $2 and c.platform = s.platform and c.handle = s.handle
      where s.load_id = $1`, [loadId, ws]))[0];
  const differs: Record<string, number> = {};
  const examples: Record<string, unknown[]> = {};
  for (const [k, e] of Object.entries(checks)) {
    if (!head[`d_${k}`]) continue;
    differs[k] = head[`d_${k}`];
    examples[k] = await q(
      `select s.platform, s.handle, s.followers_latest as s_f, c.followers_latest as c_f, s.first_seen::text as s_first, c.first_seen::text as c_first, s.last_seen::text as s_last, c.last_seen::text as c_last
         from staging.accounts s join creators c on c.workspace_id = $2 and c.platform = s.platform and c.handle = s.handle where s.load_id = $1 and ${e} limit 4`,
      [loadId, ws]);
  }
  return { rows: head.rows, matched: head.matched, missing: head.missing, differs, examples };
}

/** staged comments against the core: the post they hang under, and the columns the source writes */
export async function compareComments(loadId: string, ws: string, source: "listening" | "profile"): Promise<Diff> {
  const cols = COMMENT_WRITE[source];
  const want = (c: string) => source === "profile" && (c === "sentiment" || c === "sentiment_source")
    // a profile load keeps what our model decided (a label, or that it could not label) when the export brings none
    ? `case when k.sentiment_source like 'model%' and s.sentiment is null then k.${c} else s.${c} end`
    : `s.${c}`;
  const checks: Record<string, string> = {
    post: `(p.url is distinct from s.url or p.brand_id is distinct from s.brand_id)`,
    ...Object.fromEntries(cols.map((c) => [c, `(${want(c)} is distinct from k.${c})`])),
  };
  const head = (await q<Record<string, number>>(
    `select count(*)::int as rows, count(k.id)::int as matched, count(*) filter (where k.id is null)::int as missing,
            ${Object.entries(checks).map(([c, e]) => `count(*) filter (where k.id is not null and ${e})::int as "d_${c}"`).join(", ")}
       from staging.comments s
       left join comments k on k.workspace_id = $2 and k.platform_comment_id = s.platform_comment_id
       left join posts p on p.id = k.post_id
      where s.load_id = $1`, [loadId, ws]))[0];
  const differs: Record<string, number> = {};
  const examples: Record<string, unknown[]> = {};
  for (const [c, e] of Object.entries(checks)) {
    if (!head[`d_${c}`]) continue;
    differs[c] = head[`d_${c}`];
    examples[c] = await q(
      `select s.platform_comment_id, s.url as s_url, p.url as core_url, ${c === "post" ? "s.brand_id as staged, p.brand_id as core" : `${want(c)}::text as staged, k.${c}::text as core`}
         from staging.comments s join comments k on k.workspace_id = $2 and k.platform_comment_id = s.platform_comment_id
         left join posts p on p.id = k.post_id where s.load_id = $1 and ${e} limit 4`,
      [loadId, ws]);
  }
  return { rows: head.rows, matched: head.matched, missing: head.missing, differs, examples };
}

/** staged readings against post_snapshots */
export async function compareReadings(loadId: string, ws: string): Promise<Diff> {
  const cols = ["captured_at", "views", "likes", "comments_count", "shares", "saves"];
  const head = (await q<Record<string, number>>(
    `select count(*)::int as rows, count(x.post_id)::int as matched, count(*) filter (where x.post_id is null)::int as missing,
            ${cols.map((c) => `count(*) filter (where x.post_id is not null and s.${c} is distinct from x.${c})::int as "d_${c}"`).join(", ")}
       from staging.readings s
       left join posts p on p.workspace_id = $2 and p.platform = s.platform and p.url = s.url and p.brand_id = s.brand_id
       left join post_snapshots x on x.post_id = p.id and x.day_n = s.day_n
      where s.load_id = $1`, [loadId, ws]))[0];
  const differs = Object.fromEntries(cols.filter((c) => head[`d_${c}`]).map((c) => [c, head[`d_${c}`]]));
  return { rows: head.rows, matched: head.matched, missing: head.missing, differs, examples: {} };
}
