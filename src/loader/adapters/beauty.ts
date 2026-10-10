/**
 * Beauty quarterly exports (one flat sheet per platform, one row per post and brand) → staged rows.
 * Ported from etl/load.py, rule for rule: the brand slug maps to our brand through data/seed/brand_mapping_master.csv;
 * times are Jakarta local; followers of 0 are unknown; the tier comes from followers; TikTok carries owned posts,
 * the cart and the product, Instagram carries neither; each earned creator takes the followers of their latest post.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { tierForFollowers } from "../../config/thresholds";
import { VIDEO_TYPES } from "../../config/loads";
import { hashtags, int, localDay, localMonth, naiveLocal, num, readCsv, str, tally, type Row } from "../parse";
import { emptyStaged, type AdapterInput, type Staged, type StagedAccount, type StagedPost } from "../types";

/** etl/config.py CATEGORY_BROAD_MAP: the export's category → our broad category (unknown values kept as they are) */
const CATEGORY_BROAD: Record<string, string> = {
  makeup: "Makeup", skincare: "Skincare", "both skincare & makeup": "Both Skincare & Makeup", parfume: "Fragrance", "fragrance/perfume": "Fragrance",
  perfume: "Fragrance", fragrance: "Fragrance", haircare: "Haircare", "scalp/haircare": "Haircare", deo: "Deodorant", deodorant: "Deodorant",
};
const IG_SHORTCODE = /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;
const CONTRACTS = path.join(/*turbopackIgnore: true*/ process.cwd(), "etl/contracts");
const SEED = path.join(/*turbopackIgnore: true*/ process.cwd(), "data/seed/brand_mapping_master.csv");

/** the export's brand value → our brand id, per platform (TikTok: the id or its TikTok handle; Instagram: the id or its Instagram handle) */
export function brandMaps(seedCsv: string): Record<"tiktok" | "instagram", Map<string, string>> {
  const rows = readCsv(Buffer.from(seedCsv), "seed.csv");
  const tt = new Map<string, string>(), ig = new Map<string, string>();
  for (const r of rows) {
    const id = (r.brand ?? "").trim();
    if (!id) continue;
    tt.set(id, id); ig.set(id, id);
    if (r.tiktok_handle) tt.set(r.tiktok_handle, id);
    if (r.instagram_handle) ig.set(r.instagram_handle, id);
  }
  return { tiktok: tt, instagram: ig };
}

export const platformOfFile = (name: string): "tiktok" | "instagram" | null =>
  /tiktok/i.test(name) ? "tiktok" : /instagram/i.test(name) ? "instagram" : null;

function contract(platform: string): { required: string[]; optional: string[] } {
  return JSON.parse(readFileSync(path.join(CONTRACTS, `posts_${platform}.json`), "utf8"));
}

/** one export file → its posts, in file order; rows that cannot be read are dropped with a reason */
export function normaliseFile(rows: Row[], columns: string[], platform: "tiktok" | "instagram", bmap: Map<string, string>, sourceFile: string, tz: string) {
  const drops = tally(5);
  const unknownCats: Record<string, number> = {};
  const out = new Map<string, StagedPost>();
  const days = new Map<string, { posts: number; days: Set<string> }>();
  let merged = 0;
  const tt = platform === "tiktok";
  const hasContentId = columns.includes("content_id");
  for (const r of rows) {
    const url = str(r.url);
    if (!url) { drops.add("missing url", String(r.brand)); continue; }
    const when = naiveLocal(r.date_posted, tz);
    if (!when) { drops.add("unparseable date_posted", `${url} ${JSON.stringify(r.date_posted)}`); continue; }
    const rawBrand = str(r.brand);
    const brand = rawBrand ? bmap.get(rawBrand) : undefined;
    if (!brand) { drops.add(`unknown brand slug '${rawBrand}'`, url); continue; }
    const reported = int(r.followers_numeric);
    const followers = reported != null && reported > 0 ? reported : null;
    const handle = str(r.creator_username);
    let owned = false, accountType: string | null = null, hasCart: boolean | null = null, shares: number | null = null, saves: number | null = null, ppid: string | null;
    if (tt) {
      owned = int(r.is_owned_account) === 1;
      accountType = str(r.account_type);
      hasCart = num(r.yc_status_raw) == null ? null : !!int(r.yc_flag);
      ppid = hasContentId ? str(r.content_id) : null;
      shares = int(r.shares); saves = int(r.saves);
    } else {
      ppid = IG_SHORTCODE.exec(url)?.[1] ?? null;
    }
    const catRaw = str(r.category);
    let cat: string | null = null;
    if (catRaw) {
      cat = CATEGORY_BROAD[catRaw.toLowerCase()] ?? null;
      if (cat == null) { cat = catRaw; unknownCats[catRaw] = (unknownCats[catRaw] ?? 0) + 1; }
    }
    const caption = str(r.description);
    const lower = (v: unknown) => (str(v) ?? "").toLowerCase() || null;
    const post: StagedPost = {
      platform, url, brand_id: brand, platform_post_id: ppid, creator_handle: handle, creator_key: owned || !handle ? null : handle,
      source: owned ? "owned" : "earned", collection: owned ? "owned" : tt ? "keyword" : "tagged", account_type: accountType,
      posted_at: when.toISOString(), month: localMonth(when, tz), caption, hashtags: hashtags(caption), tagged_handles: null, is_paid: null,
      has_cart: hasCart, is_reseller: accountType === "reseller", followers_at_post: followers, tier: tierForFollowers(followers),
      universe: str(r.universe), category_broad: cat, product_category: lower(r.category_new), content_format: lower(r.content_format),
      content_type: lower(r.content_type), product_name: tt ? str(r.product_name) : null, product_url: tt ? str(r.product_url) : null,
      price: tt ? num(r.price) : null, price_original: tt ? num(r.price_original) : null, discount_percent: tt ? num(r.discount_percent) : null,
      views: int(r.views), likes: int(r.likes), comments_count: int(r.comments), shares, saves,
      engagements: int(r.engagement_platform_native), engagements_lc: int(r.engagement_likes_comments_only), captured_days: null,
      relevant: null, stub: false, flags: null, source_file: sourceFile,
    };
    post.flags = flagsOf(reported, post.views, post.content_type);
    const key = `${platform}\u0001${url}\u0001${brand}`;
    if (out.has(key)) merged++; // the old loader's upsert kept the later row
    out.set(key, post);
    const m = post.month;
    const d = days.get(m) ?? { posts: 0, days: new Set<string>() };
    d.posts += 1; d.days.add(localDay(when, tz));
    days.set(m, d);
  }
  const months = Object.fromEntries([...days].sort(([a], [b]) => (a < b ? -1 : 1)).map(([m, d]) => {
    const inMonth = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
    return [m, { posts: d.posts, days_captured: d.days.size, days_in_month: inMonth, coverage_pct: Math.round((d.days.size / inMonth) * 1000) / 10 }];
  }));
  return { posts: [...out.values()], drops, merged, unknownCats, months };
}

/** the load's warnings on a row (DECISIONS, 10 Oct 2026): the row counts, and stays out of rates and medians */
export function flagsOf(followersReported: number | null, views: number | null, contentType: string | null): string[] | null {
  const f: string[] = [];
  if (followersReported === 0) f.push("zero_followers");
  if (views === 0 && contentType && VIDEO_TYPES.has(contentType)) f.push("zero_views");
  return f.length ? f : null;
}

/** one creator per earned handle: the followers of their latest post, first and last seen (etl/load.py upsert_creators) */
export function creatorsOf(posts: StagedPost[]): StagedAccount[] {
  const best = new Map<string, { followers: number | null; last: string; first: string }>();
  for (const p of posts) {
    const k = p.creator_key;
    if (!k) continue;
    const cur = best.get(k);
    if (!cur || p.posted_at > cur.last) best.set(k, { followers: p.followers_at_post, last: p.posted_at, first: cur ? (cur.first < p.posted_at ? cur.first : p.posted_at) : p.posted_at });
    else if (p.posted_at < cur.first) cur.first = p.posted_at;
  }
  const platform = posts[0]?.platform ?? "";
  return [...best].map(([handle, v]) => ({ platform, handle, display_name: null, followers_latest: v.followers, tier_latest: tierForFollowers(v.followers), first_seen: v.first.slice(0, 10), last_seen: v.last.slice(0, 10) }));
}

export function readBeauty(input: AdapterInput): Staged {
  const st = emptyStaged();
  const maps = brandMaps(readFileSync(SEED, "utf8"));
  const accounts: StagedAccount[] = [];
  // a later row wins (the old loader's upsert), so files are read in the order they reached us, whatever order they are
  // given in; files of one day keep the order given
  const files = [...input.files].sort((a, b) => (a.raw.received < b.raw.received ? -1 : a.raw.received > b.raw.received ? 1 : 0));
  for (const { raw, bytes } of files) {
    const name = path.basename(raw.path);
    const platform = platformOfFile(name);
    if (!platform) throw new Error(`${name}: say which platform it is (the name holds neither "tiktok" nor "instagram").`);
    const rows = readCsv(bytes, name);
    const columns = Object.keys(rows[0] ?? {});
    const c = contract(platform);
    const missing = c.required.filter((x) => !columns.includes(x));
    if (missing.length) throw new Error(`${name}: missing required columns ${missing.join(", ")}`);
    const extra = columns.filter((x) => !c.required.includes(x) && !c.optional.includes(x));
    const f = normaliseFile(rows, columns, platform, maps[platform], name, input.tz);
    // the exports carry no time of reading: the numbers were read by the day the file reached us, at the latest
    const readAt = naiveLocal(raw.received, input.tz)?.toISOString() ?? null;
    for (const p of f.posts) p.read_at = readAt;
    // creators per file, as the old loader upserted them file by file (the promotion keeps the latest by last seen)
    accounts.push(...creatorsOf(f.posts));
    st.posts.push(...f.posts);
    st.files.push({
      file: name, raw_file_id: null, kind: "posts", platform, rows_in: rows.length, staged: f.posts.length, merged: f.merged, dropped: f.drops.total(), drops: f.drops.d,
      notes: { months: f.months, unknown_categories_kept_as_is: f.unknownCats, extra_columns_ignored: extra, source_tz_assumed: input.tz, naive_times: f.posts.length },
    });
  }
  st.accounts = foldLatest(accounts);
  return st;
}

/**
 * Creators from several files, folded the way the old loader upserted them file after file: the followers of the
 * later last-seen day (a tie goes to the later file), the earliest first seen, the latest last seen. Folding first
 * and upserting once gives what upserting file by file gave.
 */
export function foldLatest(rows: StagedAccount[]): StagedAccount[] {
  const out = new Map<string, StagedAccount>();
  for (const r of rows) {
    const k = `${r.platform}\u0001${r.handle}`;
    const cur = out.get(k);
    if (!cur) { out.set(k, { ...r }); continue; }
    const newer = (r.last_seen ?? "1900-01-01") >= (cur.last_seen ?? "1900-01-01");
    out.set(k, {
      ...cur,
      followers_latest: newer ? r.followers_latest : cur.followers_latest,
      tier_latest: newer ? r.tier_latest : cur.tier_latest,
      first_seen: [cur.first_seen, r.first_seen].filter((x): x is string => !!x).sort()[0] ?? null,
      last_seen: [cur.last_seen, r.last_seen].filter((x): x is string => !!x).sort().at(-1) ?? null,
    });
  }
  return [...out.values()];
}
