/**
 * Onboarding a listening dump, step by step (CMS plan, "Workspace lifecycle"):
 *   inspect   files, tables, platforms, dates, the dump's brand rows grouped by suggestion, sentiment labels, topics, unknown columns
 *   load      a job in slices: prepare (topics, brands' captures, creators), posts, snapshots, comments, finish (report, views, review)
 * Every slice re-reads what it needs and stops after its time budget, saving where it got to.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { contractFromDb, patchSource, sourceOf, type Contract, type StoredFile } from "./contract";
import { buildComments, buildPosts, buildSnapshots, countBy, s, i, b, table, topicRows, writeBrandCaptures, writeChunk, writeCreators, writeTopics, when, platformOf as PLATFORM_OF } from "./listening";
import { DUMP_IGNORED, DUMP_TABLES } from "./storage";
import { invalidateWorkspace } from "../workspace/store";
import { forgetUser } from "../auth/live";

/** the columns the loader reads, per table; any others are listed as not read */
const READS: Record<string, string[]> = {
  _content_: ["id", "brand_id", "creator_id", "platform", "url", "shortcode", "post_id", "description", "content_type", "is_paid_partnership", "date_posted", "likes", "comments_count", "shares", "saves", "engagement_total", "last_snapshot_at", "updated_at", "video_play_count", "video_view_count"],
  _comment_: ["id", "content_id", "external_comment_id", "commentor", "comment_text", "like_count", "commented_at"],
  comment_sentiment: ["comment_id", "csat", "csat_confidence", "sentiment", "theme", "purchase_intent", "translation", "topic_id", "is_latest"],
  brand: ["id", "name"],
  creator: ["id", "platform", "username", "display_name", "followers", "first_seen_at", "last_seen_at"],
  content_hashtag: ["content_id", "hashtag"],
  content_metric_snapshot: ["content_id", "day_index", "likes", "comments_count", "shares", "saves", "source_fetched_at", "snapshot_date", "video_play_count", "video_view_count"],
  topic: ["id", "name", "slug", "sort_order", "is_catch_all"],
  content_tagged_user: ["content_id", "username"],
};

export type BrandSuggestion = { id: string; name: string; handles: { handle: string; platforms: string[]; posts: number }[] };
export type InspectReport = {
  files: { table: string; name: string; size: number; rows: number; unread_columns: string[]; missing_columns: string[] }[];
  missing_tables: string[];
  ignored_tables: string[];
  platforms: Record<string, number>;
  span: [string, string] | null;
  posts_by_day_last: { day: string; posts: number }[];
  handles: { handle: string; platforms: string[]; posts: number; brand: string | null }[];
  suggestions: BrandSuggestion[];
  labels: { label: string; comments: number; maps_to: string | null | undefined }[];
  topics: { label: string; comments: number; share: number; catch_all: boolean }[];
  comments: number;
  snapshots: number;
};

const SUFFIX = /(indonesia|official|offical|merchant|games|digital|wallet|bank|_id|\.id|id)$/;
/** a handle's family name: "gopayindonesia", "gopaymerchant" → "gopay"; "dana.id", "danawallet" → "dana" */
export function stem(h: string): string {
  let t = h.toLowerCase().replace(/^@/, "");
  for (let k = 0; k < 4; k++) {
    const next = t.replace(/[._-]+$/, "").replace(SUFFIX, "");
    if (next === t || next.length < 3) break;
    t = next;
  }
  t = t.replace(/^(bank|official|the)/, "") || t;
  return t.replace(/[^a-z0-9]/g, "") || h.toLowerCase();
}

/** Group handles into suggested brands by family name; a person confirms, merges or splits. */
export function suggestBrands(handles: { handle: string; platforms: string[]; posts: number }[]): BrandSuggestion[] {
  const groups = new Map<string, typeof handles>();
  for (const h of handles) {
    const k = stem(h.handle);
    // a handle whose family name starts another's joins it ("blubybcadigital" stays apart; "bankbca" joins "bca")
    const into = [...groups.keys()].find((g) => g.length >= 3 && (k.startsWith(g) || g.startsWith(k)) && Math.min(k.length, g.length) >= 3) ?? k;
    groups.set(into, [...(groups.get(into) ?? []), h]);
  }
  return [...groups].map(([k, hs]) => ({ id: k.slice(0, 40), name: k.length <= 4 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1), handles: hs.sort((a, b2) => b2.posts - a.posts) }))
    .sort((a, b2) => b2.handles.reduce((x, h) => x + h.posts, 0) - a.handles.reduce((x, h) => x + h.posts, 0));
}

export async function inspectDump(ws: string): Promise<InspectReport> {
  const src = await sourceOf(ws);
  const files = src.config.files ?? {};
  const k = await contractFromDb(ws);
  const byHandle = new Map<string, string>();
  for (const [id, br] of Object.entries(k?.brands ?? {})) for (const h of br.handles) byHandle.set(h.toLowerCase(), id);
  const out: InspectReport["files"] = [];
  for (const [t, f] of Object.entries(files)) {
    if (!(DUMP_TABLES as readonly string[]).includes(t)) continue;
    const rows = await table(files, t);
    const cols = Object.keys(rows[0] ?? {});
    const reads = READS[t] ?? [];
    out.push({ table: t, name: f.name, size: f.size, rows: rows.length, unread_columns: cols.filter((c) => !reads.includes(c) && !["workspace_id", "created_at"].includes(c)), missing_columns: reads.filter((c) => !cols.includes(c)) });
  }
  const has = (t: string) => !!files[t];
  const content = has("_content_") ? await table(files, "_content_") : [];
  const brands = has("brand") ? await table(files, "brand") : [];
  const brandName = new Map(brands.map((r) => [i(r.id), (s(r.name) ?? "").toLowerCase()]));
  const hstat = new Map<string, { platforms: Set<string>; posts: number }>();
  const platforms: Record<string, number> = {};
  const byDay = new Map<string, number>();
  let lo = "", hi = "";
  for (const r of content) {
    const p = PLATFORM_OF(r.platform);
    const h = brandName.get(i(r.brand_id)) ?? "";
    if (p) platforms[p] = (platforms[p] ?? 0) + 1;
    const st = hstat.get(h) ?? { platforms: new Set(), posts: 0 };
    if (p) st.platforms.add(p);
    st.posts += 1;
    hstat.set(h, st);
    const d = when(r.date_posted)?.toISOString().slice(0, 10);
    if (d) { byDay.set(d, (byDay.get(d) ?? 0) + 1); if (!lo || d < lo) lo = d; if (!hi || d > hi) hi = d; }
  }
  for (const n of brandName.values()) if (!hstat.has(n)) hstat.set(n, { platforms: new Set(), posts: 0 });
  const handles = [...hstat].filter(([h]) => h).map(([handle, v]) => ({ handle, platforms: [...v.platforms].sort(), posts: v.posts, brand: byHandle.get(handle) ?? null })).sort((a, b2) => b2.posts - a.posts);
  const labels = has("comment_sentiment") ? await table(files, "comment_sentiment") : [];
  const lab = countBy(labels.filter((r) => b(r.is_latest)), (r) => s(r.sentiment) ?? "(none)");
  const topics = has("topic") ? await table(files, "topic") : [];
  const tcount = countBy(labels.filter((r) => b(r.is_latest)), (r) => s(r.topic_id) ?? "");
  const tTotal = Object.values(tcount).reduce((a, n) => a + n, 0) || 1;
  const days = [...byDay].sort(([a], [b2]) => (a < b2 ? -1 : 1)).slice(-10).map(([day, posts]) => ({ day, posts }));
  const report: InspectReport = {
    files: out.sort((a, b2) => (a.table < b2.table ? -1 : 1)),
    missing_tables: DUMP_TABLES.filter((t) => !files[t]),
    ignored_tables: DUMP_IGNORED,
    platforms,
    span: lo ? [lo, hi] : null,
    posts_by_day_last: days,
    handles,
    suggestions: suggestBrands(handles.map(({ handle, platforms: p, posts }) => ({ handle, platforms: p, posts }))),
    labels: Object.entries(lab).map(([label, comments]) => ({ label, comments, maps_to: label === "(none)" ? null : k?.sentiment_map[label] })).sort((a, b2) => b2.comments - a.comments),
    topics: topics.map((r) => ({ label: s(r.name) ?? "?", comments: tcount[String(i(r.id))] ?? 0, share: Math.round(((tcount[String(i(r.id))] ?? 0) / tTotal) * 1000) / 10, catch_all: !!b(r.is_catch_all) })).sort((a, b2) => b2.comments - a.comments),
    comments: has("_comment_") ? (await table(files, "_comment_")).length : 0,
    snapshots: has("content_metric_snapshot") ? (await table(files, "content_metric_snapshot")).length : 0,
  };
  await patchSource(ws, { inspect: report, inspected_at: new Date().toISOString() });
  return report;
}

/** What still stops a load, in words for data ops; empty when it can run. */
export async function loadBlockers(ws: string): Promise<string[]> {
  const src = await sourceOf(ws);
  const k = await contractFromDb(ws);
  const out: string[] = [];
  const files = src.config.files ?? {};
  const missing = DUMP_TABLES.filter((t) => !files[t]);
  if (missing.length) out.push(`Upload the dump's ${missing.join(", ")} file${missing.length === 1 ? "" : "s"}.`);
  if (!k || !Object.keys(k.brands).length) out.push("Map the dump's accounts to brands.");
  const insp = src.config.inspect as InspectReport | undefined;
  if (!insp) out.push("Inspect the dump first.");
  else {
    const unmapped = insp.handles.filter((h) => !Object.values(k?.brands ?? {}).some((br) => br.handles.map((x) => x.toLowerCase()).includes(h.handle)));
    if (unmapped.length) out.push(`Accounts not under a brand yet: ${unmapped.slice(0, 8).map((h) => `@${h.handle}`).join(", ")}${unmapped.length > 8 ? ` and ${unmapped.length - 8} more` : ""}.`);
    const unlabelled = insp.labels.filter((l) => l.label !== "(none)" && !(l.label in (k?.sentiment_map ?? {})));
    if (unlabelled.length) out.push(`Say what these sentiment labels mean: ${unlabelled.map((l) => l.label).join(", ")}.`);
  }
  return out;
}

// ------------------------------------------------------------------ the load job
type Progress = { phase: string; offset: number; loads?: { posts?: string; snapshots?: string; comments?: string }; counts?: Record<string, number>; report?: Record<string, unknown> };
const PHASES = ["prepare", "posts", "snapshots", "comments", "finish"] as const;
const CHUNK = { posts: 1000, snapshots: 2000, comments: 1000 } as const;

async function ledger(ws: string, file: string, kind: string, rowsIn: number): Promise<string> {
  const r = (await sql.query("insert into data_loads (workspace_id, file, platform, kind, rows_in) values ($1, $2, null, $3, $4) returning id", [ws, file, kind, rowsIn])) as { id: string }[];
  return r[0].id;
}
async function closeLoad(id: string, loaded: number, rejected: number, report: unknown): Promise<void> {
  await sql.query("update data_loads set rows_loaded = $2, rows_rejected = $3, report = $4::jsonb, finished_at = now() where id = $1", [id, loaded, rejected, toJson(report)]);
}

export async function setStatus(ws: string, status: string): Promise<void> {
  await sql.query("update workspaces set status = $2 where id = $1", [ws, status]);
  invalidateWorkspace(ws);
  forgetUser(); // who may sign in changes with a workspace's status
}

/**
 * One slice of a load. Returns the progress to save and whether it is done. `budgetMs`
 * keeps a slice inside a function's time limit; the CLI passes a large one.
 */
export async function loadSlice(ws: string, p: Progress, budgetMs = 40_000): Promise<{ progress: Progress; done: boolean; note: string }> {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);
  const src = await sourceOf(ws);
  const files = src.config.files ?? {};
  const k = (await contractFromDb(ws)) as Contract;
  const prog: Progress = { phase: p.phase || "prepare", offset: p.offset || 0, loads: { ...(p.loads ?? {}) }, counts: { ...(p.counts ?? {}) }, report: { ...(p.report ?? {}) } };
  const built = await buildPosts(k, files);
  if (built.unmapped.length) throw new Error(`Accounts in the dump not under a brand: ${built.unmapped.join(", ")}`);
  while (left() > 0) {
    if (prog.phase === "prepare") {
      const ws0 = ((await sql.query("select kind, status from workspaces where id = $1", [ws])) as { kind: string; status: string }[])[0];
      if (!ws0 || ws0.kind !== "category") throw new Error(`${ws} is not a brand-panel workspace.`);
      if (["draft", "review"].includes(ws0.status)) await setStatus(ws, "loading");
      const t = await topicRows(ws, files);
      await writeTopics(ws, t.rows);
      await writeBrandCaptures(ws, built.seen);
      const nCreators = await writeCreators(ws, files, built.rows);
      const content = await table(files, "_content_");
      prog.loads = { posts: await ledger(ws, files._content_.name, "posts", content.length) };
      prog.counts = { creators: nCreators, posts: 0, snapshots: 0, comments: 0 };
      prog.report = { topics: t.rows.map((x) => x.label) };
      prog.phase = "posts"; prog.offset = 0;
      continue;
    }
    if (prog.phase === "posts") {
      const rows = built.rows.map(({ _cid, ...r }) => r);
      while (prog.offset < rows.length && left() > 0) {
        prog.counts!.posts += await writeChunk("posts", rows.slice(prog.offset, prog.offset + CHUNK.posts), ws, prog.loads!.posts);
        prog.offset += CHUNK.posts;
      }
      if (prog.offset < rows.length) break;
      const content = await table(files, "_content_");
      const drops = Object.values(built.drops).reduce((a, d) => a + d.count, 0);
      const r = built.rows;
      const postReport = {
        rows_in: content.length, posts: r.length, upserted: prog.counts!.posts, duplicates_merged: content.length - r.length - drops, drops: built.drops, creators: prog.counts!.creators,
        by_platform: countBy(r, (x) => x.platform), by_brand: countBy(r, (x) => x.brand_id), owned_by_brand: countBy(r.filter((x) => x.source === "owned"), (x) => x.brand_id),
        by_month: countBy(r, (x) => x.month.slice(0, 7)), not_about_brand: countBy(r.filter((x) => !x.relevant), (x) => x.platform), not_about_brand_by_brand: countBy(r.filter((x) => !x.relevant), (x) => x.brand_id),
        posted_span: [r.map((x) => x.posted_at).sort()[0]?.slice(0, 10), r.map((x) => x.posted_at).sort().at(-1)?.slice(0, 10)], views: r.reduce((a, x) => a + (x.views ?? 0), 0), brands: Object.keys(k.brands).length, topics: prog.report!.topics,
      };
      await closeLoad(prog.loads!.posts!, r.length, drops, postReport);
      prog.report!.posts = postReport;
      prog.loads!.snapshots = await ledger(ws, files.content_metric_snapshot.name, "snapshots", (await table(files, "content_metric_snapshot")).length);
      prog.phase = "snapshots"; prog.offset = 0;
      continue;
    }
    if (prog.phase === "snapshots") {
      const kept = new Map(built.rows.map((r) => [r._cid, `${r.platform}\u0001${r.url}\u0001${r.brand_id}`]));
      const sn = await buildSnapshots(files, kept);
      while (prog.offset < sn.rows.length && left() > 0) {
        prog.counts!.snapshots += await writeChunk("snapshots", sn.rows.slice(prog.offset, prog.offset + CHUNK.snapshots), ws);
        prog.offset += CHUNK.snapshots;
      }
      if (prog.offset < sn.rows.length) break;
      const rep = { rows_in: (await table(files, "content_metric_snapshot")).length, snapshots: sn.rows.length, upserted: prog.counts!.snapshots, not_on_kept_capture: sn.drops, posts_with_snapshots: new Set(sn.rows.map((r) => `${r.platform}${r.url}${r.brand_id}`)).size, max_day: Math.max(...sn.rows.map((r) => r.day_n), 0) };
      await closeLoad(prog.loads!.snapshots!, sn.rows.length, sn.drops, rep);
      prog.report!.snapshots = rep;
      prog.loads!.comments = await ledger(ws, files._comment_.name, "comments", (await table(files, "_comment_")).length);
      prog.phase = "comments"; prog.offset = 0;
      continue;
    }
    if (prog.phase === "comments") {
      const t = await topicRows(ws, files);
      const cm = await buildComments(k, files, built.keyOf, t.ids);
      if (cm.unknownLabels.length) throw new Error(`Sentiment labels not mapped: ${cm.unknownLabels.join(", ")}`);
      while (prog.offset < cm.rows.length && left() > 0) {
        prog.counts!.comments += await writeChunk("comments", cm.rows.slice(prog.offset, prog.offset + CHUNK.comments), ws);
        prog.offset += CHUNK.comments;
      }
      if (prog.offset < cm.rows.length) break;
      const counted = cm.rows.filter((r) => r.sentiment_source !== "subject");
      const rep = {
        rows_in: (await table(files, "_comment_")).length, comments: cm.rows.length, upserted: prog.counts!.comments, drops: cm.drops,
        brand_replies: cm.rows.length - counted.length, without_label: cm.rows.filter((r) => r.sentiment_source == null).length,
        sentiment: countBy(counted, (r) => r.sentiment ?? "-"), detail: countBy(cm.rows, (r) => r.label ?? "-"), with_topic: cm.rows.filter((r) => r.topic_id).length,
        without_text: cm.rows.filter((r) => !r.text).length, posts_with_comments: new Set(cm.rows.map((r) => `${r.platform}${r.url}${r.brand_id}`)).size, by_platform: countBy(cm.rows, (r) => r.platform),
      };
      await closeLoad(prog.loads!.comments!, cm.rows.length, Object.values(cm.drops).reduce((a, n) => a + n, 0), rep);
      prog.report!.comments = rep;
      prog.phase = "finish"; prog.offset = 0;
      continue;
    }
    if (prog.phase === "finish") {
      await refreshViews();
      await (await import("../definitions/totals")).refreshServing(ws);
      const st = ((await sql.query("select status from workspaces where id = $1", [ws])) as { status: string }[])[0]?.status;
      if (st === "loading") await setStatus(ws, "review");
      // the load report's health checks, for data ops to read in review (src/onboard/health.ts)
      await (await import("./health")).recordHealth(ws).catch((e) => console.error("[health]", (e as Error).message));
      await patchSource(ws, { last_load: { at: new Date().toISOString(), loads: prog.loads, counts: prog.counts } } as never);
      prog.phase = "done";
      return { progress: prog, done: true, note: `Loaded ${prog.counts!.posts} posts, ${prog.counts!.snapshots} snapshots, ${prog.counts!.comments} comments.` };
    }
    break;
  }
  return { progress: prog, done: prog.phase === "done", note: `${prog.phase}: ${prog.offset.toLocaleString("en-US")} rows written so far` };
}

/** the materialized views every dashboard reads (src/db/refresh.sql) */
export async function refreshViews(): Promise<void> {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  for (const stmt of readFileSync(path.join(process.cwd(), "src/db/refresh.sql"), "utf8").split(";").map((x) => x.trim()).filter(Boolean)) await sql.query(stmt);
}

export { PHASES };
export type { Progress, StoredFile };
