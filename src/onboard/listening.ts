/**
 * The listening loader (CMS plan, "Workspace lifecycle: Load"), ported from
 * etl/load_listening.py so data ops can run it from the CMS: same rules, row for row.
 *
 *   _content_                 -> posts (one row per platform + url + brand; the capture tracked last wins)
 *   creator                   -> creators (tier from followers, src/config)
 *   brand                     -> grouped into the workspace's brands by their handles (brand_handles)
 *   content_hashtag           -> posts.hashtags
 *   content_tagged_user       -> posts.tagged_handles (one of the relevance signals)
 *   content_metric_snapshot   -> post_readings (day 0-30; post_snapshots is a view of them)
 *   _comment_ + comment_sentiment (is_latest) -> comments, labelled (sentiment_source 'listening')
 *   topic                     -> topics (the workspace's own taxonomy)
 *
 * A post is owned when its author is one of its brand's handles, and about its brand
 * (relevant) when it is owned, tags one of the brand's accounts, or its caption names it
 * (src/onboard/relevance.ts). A comment by one of the post's brand handles is the brand's
 * reply (sentiment_source 'subject', never counted). Re-running is idempotent.
 *
 * It runs as a job in slices (src/extensions/jobs.ts runs them): each slice reads the
 * stored files again, does as much as fits in its time, and saves where it stopped.
 */
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { tierForFollowers } from "../config/thresholds";
import { readStored } from "./storage";
import type { Contract, StoredFile } from "./contract";
import { brandMatcher, isRelevant } from "./relevance";

export type Row = Record<string, string | null>;
const PLATFORM: Record<string, string> = { tiktok: "tiktok", instagram: "instagram", threads: "threads", twitter: "x", x: "x", youtube: "youtube" };
const CONTENT_TYPE: Record<string, string> = { reel: "reel", video: "video", photo: "photo", image: "image", carousel: "carousel", text: "text" };
const TZ = "Asia/Jakarta";
export const platformOf = (v: unknown): string | null => PLATFORM[(String(v ?? "")).trim().toLowerCase()] ?? null;

// ----------------------------------------------------------------- reading
const cache = new Map<string, Row[]>();

export function parseCsv(text: string): Row[] {
  const rows = parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, bom: true }) as Record<string, string>[];
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === "" ? null : v])));
}

/** a table of the dump, parsed once per process (a CLI run reads each file once; a cron slice reads what it needs) */
export async function table(files: Record<string, StoredFile>, name: string): Promise<Row[]> {
  const f = files[name];
  if (!f) throw new Error(`The dump has no ${name} file.`);
  const hit = cache.get(f.url);
  if (hit) return hit;
  const rows = parseCsv(await readStored(f.url));
  cache.set(f.url, rows);
  return rows;
}
export const clearCache = () => cache.clear();
/** a table already parsed elsewhere (the one loader reads raw files itself, src/loader/adapters/listening.ts) */
export const primeTable = (url: string, rows: Row[]) => void cache.set(url, rows);

export const s = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
};
export const i = (v: unknown): number | null => {
  const t = s(v);
  if (t == null) return null;
  const f = Number(t);
  return Number.isFinite(f) ? Math.round(f) : null;
};
export const b = (v: unknown): boolean | null => {
  const t = s(v);
  return t == null ? null : t.toLowerCase() === "true";
};
/** a timestamp from the dump: naive ones are UTC (as the Python loader read them); "+0700" offsets kept */
export function when(v: unknown): Date | null {
  const t = s(v);
  if (!t) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(t);
  if (!m) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const tz = m[3] ? (m[3] === "Z" ? "Z" : m[3].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")) : "Z";
  const d = new Date(`${m[1]}T${m[2] ?? "00:00:00"}${tz}`);
  return Number.isNaN(d.getTime()) ? null : d;
}
export const handleOf = (v: unknown): string | null => {
  const t = s(v);
  const h = t ? t.replace(/^@+/, "").trim().toLowerCase() : null;
  return h || null;
};
const monthOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(d).slice(0, 7) + "-01";
const HASHTAG = /#([\p{L}\p{N}\p{M}_]+)/gu;
function captionTags(caption: string | null): string[] | null {
  if (!caption) return null;
  const out: string[] = [];
  for (const m of caption.matchAll(HASHTAG)) {
    const h = m[1].toLowerCase();
    if (!out.includes(h)) out.push(h);
  }
  return out.length ? out : null;
}
export const authorHash = (platform: string, handle: string | null) => createHash("sha256").update(`${platform}${handle ?? ""}`).digest("hex");

function engagements(platform: string, likes: number | null, comments: number | null, shares: number | null, saves: number | null, total: number | null): number {
  const l = likes ?? 0, c = comments ?? 0, sh = shares ?? 0, sv = saves ?? 0;
  if (platform === "tiktok") return l + c + sh + sv;
  if (platform === "instagram") return l + c;
  return total ?? l + c + sh;
}

// ---------------------------------------------------------------- the plan
export type PostRow = {
  platform: string; platform_post_id: string | null; creator_handle: string | null; brand_id: string; source: string; collection: string;
  posted_at: string; month: string; url: string; caption: string | null; hashtags: string[] | null; is_paid: boolean | null;
  followers_at_post: number | null; tier: string | null; content_type: string | null; views: number | null; likes: number | null;
  comments_count: number | null; shares: number | null; saves: number | null; engagements: number; engagements_lc: number;
  captured_days: number | null; relevant: boolean; tagged_handles: string[] | null; source_file: string; _cid: number;
};
export type Drops = Record<string, { count: number; examples: string[] }>;

/** The contract's handle lookups (listening brand rows are handles). */
export function lookups(k: Contract) {
  const byHandle = new Map<string, string>();
  const handles = new Map<string, Set<string>>();
  for (const [id, br] of Object.entries(k.brands)) {
    handles.set(id, new Set(br.handles.map((h) => h.toLowerCase())));
    for (const h of br.handles) byHandle.set(h.toLowerCase(), id);
  }
  const matchers = new Map(Object.entries(k.brands).map(([id, br]) => [id, brandMatcher([...br.terms, ...br.handles], br.never ?? [])]));
  return { byHandle, handles, matchers };
}

export async function buildPosts(k: Contract, files: Record<string, StoredFile>): Promise<{ rows: PostRow[]; keyOf: Map<number, string>; seen: Map<string, Map<string, Set<string>>>; drops: Drops; unmapped: string[] }> {
  const [content, brands, creators, tagsDf, snaps, tagged] = await Promise.all(["_content_", "brand", "creator", "content_hashtag", "content_metric_snapshot", "content_tagged_user"].map((t) => table(files, t)));
  const L = lookups(k);
  const brandName = new Map(brands.map((r) => [i(r.id), (s(r.name) ?? "").toLowerCase()]));
  const unmapped = [...new Set([...brandName.values()].filter((n) => !L.byHandle.has(n)))].sort();
  const cr = new Map(creators.map((r) => [i(r.id), r]));
  const tags = new Map<number, string[]>();
  for (const r of tagsDf) {
    const t = (s(r.hashtag) ?? "").replace(/^#/, "").toLowerCase();
    const cid = i(r.content_id);
    if (!t || cid == null) continue;
    const l = tags.get(cid) ?? [];
    if (!l.includes(t)) l.push(t);
    tags.set(cid, l);
  }
  const tagMap = new Map<number, Set<string>>();
  for (const r of tagged) {
    const h = handleOf(r.username);
    const cid = i(r.content_id);
    if (h && cid != null) tagMap.set(cid, (tagMap.get(cid) ?? new Set()).add(h));
  }
  const days = new Map<number, Set<number>>();
  for (const r of snaps) {
    const cid = i(r.content_id), d = i(r.day_index);
    if (cid != null && d != null) days.set(cid, (days.get(cid) ?? new Set()).add(d));
  }
  const drops: Drops = {};
  const drop = (reason: string, ex: unknown) => {
    const d = (drops[reason] ??= { count: 0, examples: [] });
    d.count += 1;
    if (d.examples.length < 5) d.examples.push(String(ex));
  };
  const best = new Map<string, { rank: [string, string, number]; r: Row; posted: Date }>();
  const members = new Map<string, number[]>();
  const seen = new Map<string, Map<string, Set<string>>>();
  const cmp = (a: [string, string, number], b2: [string, string, number]) => (a[0] !== b2[0] ? (a[0] > b2[0] ? 1 : -1) : a[1] !== b2[1] ? (a[1] > b2[1] ? 1 : -1) : a[2] - b2[2]);
  for (const r of content) {
    const platform = PLATFORM[(s(r.platform) ?? "").toLowerCase()];
    const url = s(r.url);
    const src = brandName.get(i(r.brand_id)) ?? "";
    const bid = L.byHandle.get(src);
    if (!platform || !url) { drop("no platform or url", r.id); continue; }
    if (!bid) { drop("brand not in the contract", src); continue; }
    const posted = when(r.date_posted);
    if (!posted) { drop("no date_posted", url); continue; }
    const byP = seen.get(bid) ?? new Map<string, Set<string>>();
    byP.set(platform, (byP.get(platform) ?? new Set()).add(src));
    seen.set(bid, byP);
    const key = `${platform}\u0001${url}\u0001${bid}`;
    const cid = i(r.id)!;
    members.set(key, [...(members.get(key) ?? []), cid]);
    const rank: [string, string, number] = [s(r.last_snapshot_at) ?? "", s(r.updated_at) ?? "", cid];
    const cur = best.get(key);
    if (!cur || cmp(rank, cur.rank) > 0) best.set(key, { rank, r, posted });
  }
  const rows: PostRow[] = [];
  const keyOf = new Map<number, string>();
  const file = files._content_.name;
  for (const [key, { r, posted }] of best) {
    const [platform, url, bid] = key.split("\u0001");
    for (const cid of members.get(key)!) keyOf.set(cid, key);
    const c = cr.get(i(r.creator_id));
    const who = c ? handleOf(c.username) : null;
    const followers = c ? i(c.followers) : null;
    const likes = i(r.likes), comments = i(r.comments_count), shares = i(r.shares), saves = i(r.saves);
    const vs = [i(r.video_view_count), i(r.video_play_count)].filter((v): v is number => v != null);
    const views = vs.length ? Math.max(...vs) : null;
    const owned = who != null && L.handles.get(bid)!.has(who);
    const cid = i(r.id)!;
    const tg = tagMap.get(cid);
    const relevant = isRelevant({ owned, tagged: tg ? [...tg] : [], caption: s(r.description) }, L.handles.get(bid)!, L.matchers.get(bid)!);
    rows.push({
      platform, platform_post_id: s(r.post_id) ?? s(r.shortcode), creator_handle: who, brand_id: bid, source: owned ? "owned" : "earned", collection: owned ? "owned" : "keyword",
      posted_at: posted.toISOString(), month: monthOf(posted), url, caption: s(r.description), hashtags: tags.get(cid) ?? captionTags(s(r.description)),
      is_paid: b(r.is_paid_partnership), followers_at_post: followers, tier: tierForFollowers(followers), content_type: CONTENT_TYPE[(s(r.content_type) ?? "").toLowerCase()] ?? null,
      views, likes, comments_count: comments, shares, saves, engagements: engagements(platform, likes, comments, shares, saves, i(r.engagement_total)),
      engagements_lc: (likes ?? 0) + (comments ?? 0), captured_days: days.get(cid)?.size ?? null, relevant, tagged_handles: tg ? [...tg].sort() : null, source_file: file, _cid: cid,
    });
  }
  return { rows, keyOf, seen, drops, unmapped };
}

export type SnapRow = { platform: string; url: string; brand_id: string; day_n: number; captured_at: string; views: number | null; likes: number | null; comments_count: number | null; shares: number | null; saves: number | null };

export async function buildSnapshots(files: Record<string, StoredFile>, kept: Map<number, string>): Promise<{ rows: SnapRow[]; drops: number }> {
  const snaps = await table(files, "content_metric_snapshot");
  const out = new Map<string, SnapRow>();
  let drops = 0;
  for (const r of snaps) {
    const key = kept.get(i(r.content_id) ?? -1);
    const day = i(r.day_index);
    if (!key || day == null || day < 0 || day > 30) { drops += 1; continue; }
    const [platform, url, brand_id] = key.split("\u0001");
    const vs = [i(r.video_view_count), i(r.video_play_count)].filter((v): v is number => v != null);
    const at = when(r.source_fetched_at) ?? when(r.snapshot_date);
    const row = { platform, url, brand_id, day_n: day, captured_at: at ? at.toISOString() : "", views: vs.length ? Math.max(...vs) : null, likes: i(r.likes), comments_count: i(r.comments_count), shares: i(r.shares), saves: i(r.saves) };
    const k2 = `${key}\u0001${day}`;
    const prev = out.get(k2);
    if (!prev || row.captured_at > prev.captured_at) out.set(k2, row);
  }
  return { rows: [...out.values()].filter((r) => r.captured_at), drops };
}

export type CommentRow = {
  platform: string; url: string; brand_id: string; platform_comment_id: string; author_handle: string | null; author_hash: string; text: string | null;
  posted_at: string | null; likes: number | null; sentiment: string | null; sentiment_source: string | null; confidence: number | null;
  /** the vendor's own label, before the sentiment map: counted in the load report, never stored (DECISIONS, 10 Oct 2026) */
  label: string | null; theme: string | null; purchase_intent: boolean | null; translation: string | null; topic_id: string | null;
};

export async function buildComments(k: Contract, files: Record<string, StoredFile>, keyOf: Map<number, string>, topicIds: Map<number, string>): Promise<{ rows: CommentRow[]; drops: Record<string, number>; unknownLabels: string[] }> {
  const [comments, labels] = await Promise.all([table(files, "_comment_"), table(files, "comment_sentiment")]);
  const L = lookups(k);
  const lab = new Map<number, Row>();
  for (const r of labels) if (b(r.is_latest)) lab.set(i(r.comment_id)!, r);
  const out = new Map<string, CommentRow>();
  const drops: Record<string, number> = {};
  const unknown = new Set<string>();
  const drop = (why: string) => { drops[why] = (drops[why] ?? 0) + 1; };
  for (const r of comments) {
    const key = keyOf.get(i(r.content_id) ?? -1);
    if (!key) { drop("post not loaded"); continue; }
    const ext = s(r.external_comment_id);
    if (!ext) { drop("no comment id"); continue; }
    const [platform, url, bid] = key.split("\u0001");
    const who = handleOf(r.commentor);
    const l = lab.get(i(r.id) ?? -1);
    const detail = l ? s(l.sentiment) : null;
    if (detail != null && !(detail in k.sentiment_map)) unknown.add(detail);
    const reply = who != null && L.handles.get(bid)!.has(who);
    const posted = when(r.commented_at);
    const row: CommentRow = {
      platform, url, brand_id: bid, platform_comment_id: ext, author_handle: who, author_hash: authorHash(platform, who), text: s(r.comment_text),
      posted_at: posted ? posted.toISOString() : null, likes: i(r.like_count),
      sentiment: reply ? null : detail != null ? k.sentiment_map[detail] ?? null : null,
      sentiment_source: reply ? "subject" : l ? "listening" : null,
      confidence: l && s(l.csat_confidence) ? Number(l.csat_confidence) : null, label: detail,
      theme: l ? s(l.theme) : null, purchase_intent: l ? b(l.purchase_intent) : null, translation: l ? s(l.translation) : null,
      topic_id: l ? topicIds.get(i(l.topic_id) ?? -1) ?? null : null,
    };
    const prev = out.get(ext);
    if (!prev) out.set(ext, row);
    else {
      drop("same comment on another capture");
      // a comment under a post captured for two brands lands once; the client's row wins, then the first seen
      if (prev.brand_id !== k.client && bid === k.client) out.set(ext, row);
    }
  }
  return { rows: [...out.values()], drops, unknownLabels: [...unknown].sort() };
}

export async function topicRows(ws: string, files: Record<string, StoredFile>): Promise<{ ids: Map<number, string>; rows: { id: string; label: string; sort_order: number; is_catch_all: boolean }[] }> {
  const t = await table(files, "topic");
  const ids = new Map<number, string>();
  const rows = t.map((r) => {
    const id = `${ws}:${s(r.slug)}`;
    ids.set(i(r.id)!, id);
    return { id, label: s(r.name) ?? id, sort_order: i(r.sort_order) ?? 0, is_catch_all: !!b(r.is_catch_all) };
  });
  return { ids, rows };
}

// ------------------------------------------------------------------ writing
const POST_COLS = ["platform_post_id", "creator_handle", "brand_id", "source", "collection", "posted_at", "month", "url", "caption", "hashtags", "is_paid", "followers_at_post", "tier", "content_type", "views", "likes", "comments_count", "shares", "saves", "engagements", "engagements_lc", "captured_days", "relevant", "tagged_handles", "source_file"];
const POST_TYPES = "platform_post_id text, creator_handle text, brand_id text, source text, collection text, posted_at timestamptz, month date, url text, caption text, hashtags text[], is_paid boolean, followers_at_post int, tier text, content_type text, views bigint, likes int, comments_count int, shares int, saves int, engagements int, engagements_lc int, captured_days int, relevant boolean, tagged_handles text[], source_file text";
const POST_SQL = `
  insert into posts (workspace_id, platform, load_id, creator_id, ${POST_COLS.join(", ")})
  select $2, r.platform, $3::uuid, c.id, ${POST_COLS.map((c) => `r.${c}`).join(", ")}
  from jsonb_to_recordset($1::jsonb) as r(platform text, ${POST_TYPES})
  left join creators c on c.workspace_id = $2 and c.platform = r.platform and c.handle = r.creator_handle
  on conflict (workspace_id, platform, url, brand_id) do update set load_id = excluded.load_id, creator_id = excluded.creator_id,
    ${POST_COLS.filter((c) => c !== "url" && c !== "brand_id").map((c) => `${c} = excluded.${c}`).join(", ")}
  returning 1`;
const SNAP_SQL = `
  insert into post_readings (post_id, read_at, age_hours, day_n, source, views, likes, comments_count, shares, saves)
  select p.id, r.captured_at, round(extract(epoch from (r.captured_at - p.posted_at)) / 3600)::int, r.day_n, 'listening', r.views, r.likes, r.comments_count, r.shares, r.saves
  from jsonb_to_recordset($1::jsonb) as r(platform text, url text, brand_id text, day_n smallint, captured_at timestamptz, views bigint, likes int, comments_count int, shares int, saves int)
  join posts p on p.workspace_id = $2 and p.platform = r.platform and p.url = r.url and p.brand_id = r.brand_id
  on conflict (post_id, read_at, day_n) do update set views = excluded.views, likes = excluded.likes,
    comments_count = excluded.comments_count, shares = excluded.shares, saves = excluded.saves
  returning 1`;
const COMMENT_SQL = `
  insert into comments (workspace_id, post_id, platform, platform_comment_id, author_handle, author_hash, text, posted_at, likes,
                        sentiment, sentiment_source, sentiment_confidence, theme, purchase_intent, translation, topic_id, classified_at)
  select $2, p.id, r.platform, r.platform_comment_id, r.author_handle, r.author_hash, r.text, r.posted_at, r.likes,
         r.sentiment, r.sentiment_source, r.confidence, r.theme, r.purchase_intent, r.translation, r.topic_id, now()
  from jsonb_to_recordset($1::jsonb) as r(platform text, url text, brand_id text, platform_comment_id text, author_handle text, author_hash text, text text,
       posted_at timestamptz, likes int, sentiment text, sentiment_source text, confidence numeric, theme text,
       purchase_intent boolean, translation text, topic_id text)
  join posts p on p.workspace_id = $2 and p.platform = r.platform and p.url = r.url and p.brand_id = r.brand_id
  on conflict (workspace_id, platform_comment_id) do update set
    post_id = excluded.post_id, platform = excluded.platform, author_handle = excluded.author_handle, author_hash = excluded.author_hash, text = excluded.text,
    posted_at = excluded.posted_at, likes = excluded.likes, sentiment = excluded.sentiment, sentiment_source = excluded.sentiment_source,
    sentiment_confidence = excluded.sentiment_confidence, theme = excluded.theme,
    purchase_intent = excluded.purchase_intent, translation = excluded.translation, topic_id = excluded.topic_id, classified_at = excluded.classified_at
  returning 1`;

export async function writeChunk(kind: "posts" | "snapshots" | "comments", rows: unknown[], ws: string, loadId?: string): Promise<number> {
  const q = kind === "posts" ? POST_SQL : kind === "snapshots" ? SNAP_SQL : COMMENT_SQL;
  const r = (await sql.query(q, kind === "posts" ? [toJson(rows), ws, loadId] : [toJson(rows), ws])) as unknown[];
  return r.length;
}

/** the panel's topics, as its dump gives them; a topic a case brought first becomes the panel's once the panel's dump has it */
export async function writeTopics(ws: string, rows: { id: string; label: string; sort_order: number; is_catch_all: boolean }[]): Promise<void> {
  if (!rows.length) return;
  await sql.query(
    `insert into topics (id, workspace_id, label, kind, sort_order, is_catch_all)
     select r.id, $2, r.label, 'general', r.sort_order, r.is_catch_all from jsonb_to_recordset($1::jsonb) as r(id text, label text, sort_order int, is_catch_all boolean)
     on conflict (id) do update set label = excluded.label, sort_order = excluded.sort_order, is_catch_all = excluded.is_catch_all, case_id = null`,
    [toJson(rows), ws],
  );
}

/** a case's dump brings topics (step 5): a new one is the case's own (topics.case_id); one already there is left as it is */
export async function writeCaseTopics(ws: string, caseId: string, rows: { id: string; label: string; sort_order: number; is_catch_all: boolean }[]): Promise<void> {
  if (!rows.length) return;
  await sql.query(
    `insert into topics (id, workspace_id, label, kind, sort_order, is_catch_all, case_id)
     select r.id, $2, r.label, 'general', r.sort_order, r.is_catch_all, $3 from jsonb_to_recordset($1::jsonb) as r(id text, label text, sort_order int, is_catch_all boolean)
     on conflict (id) do nothing`,
    [toJson(rows), ws, caseId],
  );
}

/** the handles each brand was captured under, as the brands table keeps them (first per platform) */
export async function writeBrandCaptures(ws: string, seen: Map<string, Map<string, Set<string>>>): Promise<void> {
  const rows = [...seen].map(([id, byP]) => {
    const first = (p: string) => [...(byP.get(p) ?? [])].sort()[0] ?? null;
    return { id, tiktok: first("tiktok"), instagram: first("instagram") };
  });
  if (rows.length) await sql.query("update brands b set tiktok_handle = r.tiktok, instagram_handle = r.instagram from jsonb_to_recordset($1::jsonb) as r(id text, tiktok text, instagram text) where b.id = r.id and b.workspace_id = $2", [toJson(rows), ws]);
}

export type CreatorRow = { platform: string; handle: string; display_name: string | null; followers_latest: number | null; tier_latest: string | null; first_seen: string | null; last_seen: string | null };

/** one creator per handle that posted (brand accounts too), with the dump's followers and when it was first and last seen */
export async function creatorRows(files: Record<string, StoredFile>, posts: PostRow[]): Promise<CreatorRow[]> {
  const creators = await table(files, "creator");
  const cr = new Map<string, Row>();
  for (const r of creators) {
    const p = PLATFORM[(s(r.platform) ?? "").toLowerCase()];
    const h = handleOf(r.username);
    if (p && h) cr.set(`${p}\u0001${h}`, r);
  }
  const used = [...new Set(posts.filter((p) => p.creator_handle).map((p) => `${p.platform}\u0001${p.creator_handle}`))].sort();
  const out = used.map((k) => {
    const [platform, handle] = k.split("\u0001");
    const r = cr.get(k);
    const f = r ? i(r.followers) : null;
    const first = r ? when(r.first_seen_at) : null, last = r ? when(r.last_seen_at) : null;
    return { platform, handle, display_name: r ? s(r.display_name) : null, followers_latest: f, tier_latest: tierForFollowers(f), first_seen: first ? first.toISOString().slice(0, 10) : null, last_seen: last ? last.toISOString().slice(0, 10) : null };
  });
  return out;
}

export async function writeCreators(ws: string, files: Record<string, StoredFile>, posts: PostRow[]): Promise<number> {
  const out = await creatorRows(files, posts);
  for (let at = 0; at < out.length; at += 1000) {
    await sql.query(
      `insert into creators (workspace_id, platform, handle, display_name, followers_latest, tier_latest, first_seen, last_seen)
       select $2, platform, handle, display_name, followers_latest, tier_latest, first_seen, last_seen
       from jsonb_to_recordset($1::jsonb) as r(platform text, handle text, display_name text, followers_latest int, tier_latest text, first_seen date, last_seen date)
       on conflict (workspace_id, platform, handle) do update set display_name = coalesce(excluded.display_name, creators.display_name),
         followers_latest = coalesce(excluded.followers_latest, creators.followers_latest), tier_latest = coalesce(excluded.tier_latest, creators.tier_latest),
         first_seen = least(creators.first_seen, excluded.first_seen), last_seen = greatest(creators.last_seen, excluded.last_seen)`,
      [toJson(out.slice(at, at + 1000)), ws],
    );
  }
  return out.length;
}

/** count values, sorted by key: the same shape as the Python report */
export function countBy<T>(rows: T[], f: (r: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) { const k = f(r); if (k != null) out[k] = (out[k] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(out).sort(([a], [b2]) => (a < b2 ? -1 : 1)));
}
