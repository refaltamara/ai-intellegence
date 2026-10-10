/**
 * Writing a load into staging (schema "staging", src/db/schema.ts): the rows an adapter mapped, kept apart from the
 * core until the checks pass. A load is thrown away whole (discard), and its rows are cleared 30 days after it went
 * live or was held (clearOld).
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import type { SourceKind, Staged } from "./types";

const CHUNK = 1000;

const POST_COLS: [string, string][] = [
  ["platform", "text"], ["url", "text"], ["brand_id", "text"], ["platform_post_id", "text"], ["creator_handle", "text"], ["creator_key", "text"],
  ["source", "text"], ["collection", "text"], ["account_type", "text"], ["posted_at", "timestamptz"], ["month", "date"], ["caption", "text"],
  ["hashtags", "text[]"], ["tagged_handles", "text[]"], ["is_paid", "boolean"], ["has_cart", "boolean"], ["is_reseller", "boolean"],
  ["followers_at_post", "int"], ["tier", "text"], ["universe", "text"], ["category_broad", "text"], ["product_category", "text"],
  ["content_format", "text"], ["content_type", "text"], ["product_name", "text"], ["product_url", "text"], ["price", "numeric"],
  ["price_original", "numeric"], ["discount_percent", "numeric"], ["views", "bigint"], ["likes", "int"], ["comments_count", "int"],
  ["shares", "int"], ["saves", "int"], ["engagements", "int"], ["engagements_lc", "int"], ["captured_days", "int"], ["relevant", "boolean"],
  ["stub", "boolean"], ["flags", "text[]"], ["source_file", "text"], ["read_at", "timestamptz"],
];
const READING_COLS: [string, string][] = [["platform", "text"], ["url", "text"], ["brand_id", "text"], ["day_n", "smallint"], ["captured_at", "timestamptz"], ["views", "bigint"], ["likes", "int"], ["comments_count", "int"], ["shares", "int"], ["saves", "int"]];
const ACCOUNT_COLS: [string, string][] = [["platform", "text"], ["handle", "text"], ["display_name", "text"], ["followers_latest", "int"], ["tier_latest", "text"], ["first_seen", "date"], ["last_seen", "date"]];
const COMMENT_COLS: [string, string][] = [
  ["platform", "text"], ["url", "text"], ["brand_id", "text"], ["platform_comment_id", "text"], ["author_handle", "text"], ["author_hash", "text"], ["text", "text"],
  ["posted_at", "timestamptz"], ["likes", "int"], ["views", "bigint"], ["sentiment", "text"], ["sentiment_source", "text"], ["sentiment_confidence", "numeric"],
  ["sentiment_detail", "text"], ["csat", "smallint"], ["theme", "text"], ["purchase_intent", "boolean"], ["translation", "text"], ["topic_id", "text"],
  ["flags", "text[]"], ["source_file", "text"],
];
const CAPTION_COLS: [string, string][] = [["platform", "text"], ["url", "text"], ["caption", "text"], ["hashtags", "text[]"]];
const TOPIC_COLS: [string, string][] = [["id", "text"], ["label", "text"], ["sort_order", "int"], ["is_catch_all", "boolean"]];

/** insert rows into a staging table through jsonb_to_recordset, a chunk at a time, a few chunks side by side */
async function insertRows(table: string, cols: [string, string][], loadId: string, rows: unknown[]): Promise<number> {
  const names = cols.map(([c]) => c).join(", ");
  const types = cols.map(([c, t]) => `${c} ${t}`).join(", ");
  const q = `insert into staging.${table} (load_id, ${names}) select $2::uuid, ${names} from jsonb_to_recordset($1::jsonb) as r(${types})`;
  const chunks: unknown[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));
  for (let i = 0; i < chunks.length; i += 4) await Promise.all(chunks.slice(i, i + 4).map((c) => sql.query(q, [toJson(c), loadId])));
  return rows.length;
}

export async function openLoad(ws: string, source: SourceKind, files: unknown[], startedBy: string | null): Promise<string> {
  const r = (await sql.query(
    `insert into staging.loads (workspace_id, source, files, status, started_by) values ($1, $2, $3::jsonb, 'reading', $4) returning id`,
    [ws, source, toJson(files), startedBy],
  )) as { id: string }[];
  return r[0].id;
}

/** every staged row into staging; the load becomes 'staged' with what each file gave */
export async function writeStaged(loadId: string, st: Staged): Promise<Record<string, number>> {
  const counts = {
    posts: await insertRows("posts", POST_COLS, loadId, st.posts),
    readings: await insertRows("readings", READING_COLS, loadId, st.readings),
    accounts: await insertRows("accounts", ACCOUNT_COLS, loadId, st.accounts),
    comments: await insertRows("comments", COMMENT_COLS, loadId, st.comments),
    captions: await insertRows("captions", CAPTION_COLS, loadId, st.captions),
    topics: await insertRows("topics", TOPIC_COLS, loadId, st.topics),
  };
  await sql.query(
    `update staging.loads set status = 'staged', staged_at = now(), report = report || $2::jsonb where id = $1`,
    [loadId, toJson({ files: st.files, staged: counts, facts: st.facts })],
  );
  return counts;
}

export async function failLoad(loadId: string, error: string): Promise<void> {
  await sql.query(`update staging.loads set status = 'failed', error = $2 where id = $1`, [loadId, error.slice(0, 2000)]);
}

/** throw a load away whole: its staged rows go, the load row stays as a record of what happened */
export async function discardLoad(loadId: string, by: string | null): Promise<void> {
  for (const t of ["posts", "readings", "accounts", "comments", "captions", "topics"]) await sql.query(`delete from staging.${t} where load_id = $1`, [loadId]);
  await sql.query(`update staging.loads set status = 'discarded', decided_by = $2, decided_at = now(), cleared_at = now() where id = $1 and status <> 'live'`, [loadId, by]);
}

/** staged rows of loads that went live or were held more than `days` ago (DECISIONS: cleared 30 days after go-live) */
export async function clearOld(days = 30): Promise<number> {
  const old = (await sql.query(
    `select id from staging.loads where cleared_at is null and status in ('live','held','failed') and coalesce(live_at, decided_at, staged_at, created_at) < now() - make_interval(days => $1)`,
    [days],
  )) as { id: string }[];
  for (const { id } of old) {
    for (const t of ["posts", "readings", "accounts", "comments", "captions", "topics"]) await sql.query(`delete from staging.${t} where load_id = $1`, [id]);
    await sql.query(`update staging.loads set cleared_at = now() where id = $1`, [id]);
  }
  return old.length;
}
