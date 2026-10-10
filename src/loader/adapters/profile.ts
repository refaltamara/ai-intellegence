/**
 * A profile or case (Maudy, Kahf): per-platform exports of contents, comments and url → text, named in a contract
 * (etl/profiles/<workspace>.json) → staged rows. Ported from etl/load_profile.py rule for rule, read the same way:
 *   contents  dropped when listed in drop_urls, from an account that only replies, link spam, or (on keyword platforms)
 *             without a subject keyword; the subject's own posts are never dropped; a url repeated in a file keeps its
 *             last row; a later file fills what an earlier one left empty
 *   comments  dropped when empty, emoji only, under a dropped post, or the post itself captured as its first reply; a
 *             reply listed with a parent moves under it; ids made from post, author, time and text when none come;
 *             a comment whose post is in no contents file gets a stub post
 *   text      fills captions that arrived empty, never overwriting
 * Files are read in the contract's order, as the old loader read them, and see what earlier files staged.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "../../db/client";
import { tierForFollowers } from "../../config/thresholds";
import { flagsOf } from "./beauty";
import { authorHash, hashtags, localMonth, readCsv, roundHalfEven, tally, zoned, type Row } from "../parse";
import { emptyStaged, type AdapterInput, type FileReport, type Staged, type StagedAccount, type StagedComment, type StagedPost } from "../types";

const LOCAL_TZ = "Asia/Jakarta";
const PLATFORMS = ["youtube", "tiktok", "instagram", "threads", "x"] as const;

// ------------------------------------------------------------------ scalars (etl/load_profile.py)
const toStr = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
};
const NUM = /^-?\d[\d,.]*$/;
/** '174,000' → 174000; '' or 'modmedia' → null */
export function toInt(v: unknown): number | null {
  let s = toStr(v);
  if (s == null) return null;
  s = s.replace(/ /g, "");
  if (!NUM.test(s)) return null;
  const f = Number(s.replace(/,/g, ""));
  return Number.isFinite(f) ? roundHalfEven(f) : null;
}
const firstInt = (...vs: unknown[]) => { for (const v of vs) { const n = toInt(v); if (n != null) return n; } return null; };
export const normHandle = (h: unknown): string | null => {
  const s = toStr(h);
  if (!s) return null;
  return s.replace(/^@+/, "").trim().toLowerCase() || null;
};

// --------------------------------------------------------------------- urls
const INVISIBLE = "⁠﻿​‌‍  ";
const stripChars = (s: string, chars: string) => {
  let a = 0, b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
};

/** Python's urlsplit, enough of it: scheme, hostname (lowercased, no user or port), path, query */
function splitUrl(s: string): { host: string; path: string; query: string } {
  const m = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/.exec(s);
  if (!m) return { host: "", path: s, query: "" };
  let netloc = m[1];
  netloc = netloc.slice(netloc.lastIndexOf("@") + 1);
  const host = (netloc.startsWith("[") ? netloc.slice(0, netloc.indexOf("]") + 1) : netloc.split(":")[0]).toLowerCase();
  return { host, path: m[2], query: m[3] ?? "" };
}
/** parse_qs(query).get(key)[0]: the first non-blank value, unquoted */
function queryValue(query: string, key: string): string | null {
  for (const part of query.split("&")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = decodeURIComponent(part.slice(0, i).replace(/\+/g, " "));
    if (k !== key) continue;
    const v = decodeURIComponent(part.slice(i + 1).replace(/\+/g, " "));
    if (v) return v;
  }
  return null;
}

/** a post url's identity: host lowercased without www, query and trailing slash dropped; YouTube keeps its video id */
export function canonUrl(raw: unknown, platform: string): string | null {
  let s = toStr(raw);
  if (!s) return null;
  s = stripChars(s, INVISIBLE);
  const i = s.toLowerCase().indexOf("http");
  if (i > 0) s = s.slice(i);
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  const u = splitUrl(s);
  let host = u.host.replace(/^(www|m|mobile)\./, "");
  if (host === "twitter.com") host = "x.com";
  if (host === "threads.net") host = "threads.com";
  let p = u.path.replace(/\/+$/, "");
  if (platform === "youtube") {
    let vid: string | null;
    if (host === "youtu.be") vid = p.replace(/^\/+|\/+$/g, "").split("/")[0] || null;
    else {
      vid = queryValue(u.query, "v");
      const m = /^\/(?:shorts|embed|v)\/([A-Za-z0-9_-]{6,})/.exec(p);
      if (!vid && m) vid = m[1];
    }
    return vid ? `https://www.youtube.com/watch?v=${vid}` : `https://${host}${p}`;
  }
  if (platform === "instagram") p = p.replace(/\/c\/\d+$/, "");
  return `https://${host}${p}`;
}

export function postIdFromUrl(url: string | null, platform: string): string | null {
  if (!url) return null;
  if (platform === "youtube") return queryValue(splitUrl(url).query, "v");
  const re = ({ tiktok: /\/video\/(\d+)/, instagram: /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/, threads: /\/post\/([A-Za-z0-9_-]+)/, x: /\/status\/(\d+)/ } as Record<string, RegExp>)[platform];
  return re?.exec(url)?.[1] ?? null;
}

export function handleFromUrl(url: string | null): string | null {
  const m = /\/@([A-Za-z0-9_.-]+)/.exec(url ?? "");
  if (m) return m[1].toLowerCase();
  const x = /^https:\/\/x\.com\/([A-Za-z0-9_]+)\/status\//.exec(url ?? "");
  return x ? x[1].toLowerCase() : null;
}

// -------------------------------------------------------------------- dates
const UNIT: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthNo = (w: string) => { const i = MONTHS.indexOf(w.slice(0, 3).toLowerCase()); return i < 0 ? null : i + 1; };
const offsetOf = (z: string) => { if (z === "Z") return 0; const m = /^([+-])(\d{2}):?(\d{2})$/.exec(z)!; return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])); };
const at = (y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, zone: string | number) =>
  typeof zone === "number" ? new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms) - zone * 60000) : new Date(zoned(y, mo, d, h, mi, s, zone).getTime() + ms);

export type When = { when: Date | null; how: string };

/**
 * parse_when: epoch milliseconds or seconds; "N units ago" from the export's time; else the date as dateutil reads the
 * shapes these exports use (ISO, "10/7/2026, 3:12:45 AM" month first, "Wed Sep 10 12:34:56 +0000 2025", "Sep 15, 2025");
 * a time without a zone is read in `naiveTz` (the file's, else the platform's, else Jakarta).
 */
export function parseWhen(raw: unknown, anchor: Date, naiveTz: string | null): When {
  let s = toStr(raw);
  if (!s) return { when: null, how: "empty" };
  s = s.replace(/\(edited\)/gi, "").trim();
  if (/^\d{12,}$/.test(s)) return { when: new Date(Number(s)), how: "epoch_ms" };
  if (/^\d{9,11}$/.test(s)) return { when: new Date(Number(s) * 1000), how: "epoch_s" };
  const rel = /^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.exec(s);
  if (rel) return { when: new Date(anchor.getTime() - Number(rel[1]) * UNIT[rel[2].toLowerCase()] * 1000), how: "relative" };
  const t = s.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const tz = naiveTz ?? LOCAL_TZ;
  const naive = (y: number, mo: number, d: number, h = 0, mi = 0, sec = 0, ms = 0): When => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return { when: null, how: "unparseable" };
    return { when: at(y, mo, d, h, mi, sec, ms, tz), how: tz === LOCAL_TZ ? "naive_local" : `naive_${tz}` };
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)? ?(Z|[+-]\d{2}:?\d{2})?$/i.exec(t);
  if (m) {
    const ms = m[7] ? Math.floor(Number(`0.${m[7]}`) * 1000) : 0;
    const [y, mo, d, h, mi, sec] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number);
    if (m[8]) return { when: at(y, mo, d, h, mi, sec, ms, offsetOf(m[8].toUpperCase())), how: "aware" };
    return naive(y, mo, d, h, mi, sec, ms);
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?(?: ?([AP]M))?)?$/i.exec(t);
  if (m) {
    let [a, b2, y, h, mi, sec] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number);
    const ap = m[7]?.toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    // month first, as dateutil reads it, unless the first number cannot be a month
    const [mo, d] = a > 12 ? [b2, a] : [a, b2];
    return naive(y, mo, d, h, mi, sec);
  }
  m = /^(?:[A-Za-z]{3,9} )?([A-Za-z]{3,9}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4}) (\d{4})$/.exec(t);
  if (m && monthNo(m[1])) return { when: at(Number(m[7]), monthNo(m[1])!, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), 0, offsetOf(m[6])), how: "aware" };
  m = /^([A-Za-z]{3,9})\.? (\d{1,2}) (\d{4})$/.exec(t);
  if (m && monthNo(m[1])) return naive(Number(m[3]), monthNo(m[1])!, Number(m[2]));
  m = /^(\d{1,2}) ([A-Za-z]{3,9})\.? (\d{4})$/.exec(t);
  if (m && monthNo(m[2])) return naive(Number(m[3]), monthNo(m[2])!, Number(m[1]));
  return { when: null, how: "unparseable" };
}

const TWITTER_EPOCH_MS = 1288834974657n;
/** an X status id holds its tweet's time */
export function snowflakeTime(url: string | null): Date | null {
  const m = /\/status\/(\d{15,})/.exec(url ?? "");
  if (!m) return null;
  return new Date(Number((BigInt(m[1]) >> 22n) + TWITTER_EPOCH_MS));
}

const WORDISH = /[\p{L}\p{N}]/u;
const LINK = /https?:\/\/\S+/g;
const links = (s: string | null) => (s ?? "").match(LINK)?.length ?? 0;

// ------------------------------------------------------------------ contract
type FileSpec = { platform: string; kind: "contents" | "comments" | "text"; file: string; export_time?: string; naive_tz?: string };
type ProfileContract = {
  workspace: string; subject: { brand_id: string; name: string; owned_handles?: Record<string, string[]>; followers?: Record<string, number> };
  export_time: string; naive_dates_tz?: Record<string, string>; keywords?: string[]; keyword_platforms?: string[]; spam_min_links?: number;
  spam_platforms?: string[]; drop_urls?: { url: string; reason?: string; parent?: string }[]; reply_handles?: Record<string, string[]>;
  files: FileSpec[]; data_dir?: string;
};

/** an ISO time from the contract: naive ones are Jakarta time */
const contractTime = (v: string) => parseWhen(v, new Date(0), LOCAL_TZ).when ?? new Date(v);

export class Profile {
  raw: ProfileContract; workspace: string; brandId: string; anchor: Date;
  owned: Record<string, Set<string>>; followers: Record<string, number>; naiveTz: Record<string, string>;
  keywordRe: RegExp | null; keywordPlatforms: Set<string>; spamMin: number; spamPlatforms: Set<string>;
  drop = new Map<string, string>(); replyParent = new Map<string, string>(); replyHandles: Record<string, Set<string>>;
  constructor(c: ProfileContract) {
    this.raw = c;
    this.workspace = c.workspace;
    this.brandId = c.subject.brand_id;
    this.owned = Object.fromEntries(Object.entries(c.subject.owned_handles ?? {}).map(([p, hs]) => [p, new Set(hs.map(normHandle).filter((h): h is string => !!h))]));
    this.followers = c.subject.followers ?? {};
    this.anchor = contractTime(c.export_time);
    this.naiveTz = c.naive_dates_tz ?? {};
    this.keywordRe = c.keywords?.length ? new RegExp(c.keywords.join("|"), "i") : null;
    this.keywordPlatforms = new Set(c.keyword_platforms ?? []);
    this.spamMin = Number(c.spam_min_links ?? 0) || 0;
    this.spamPlatforms = new Set(c.spam_platforms ?? PLATFORMS);
    for (const d of c.drop_urls ?? []) {
      for (const p of PLATFORMS) {
        const u = canonUrl(d.url, p);
        if (!u) continue;
        this.drop.set(u, d.reason ?? "listed in drop_urls");
        if (d.parent) { const par = canonUrl(d.parent, p); if (par) this.replyParent.set(u, par); }
      }
    }
    this.replyHandles = Object.fromEntries(Object.entries(c.reply_handles ?? {}).map(([p, hs]) => [p, new Set(hs.map(normHandle).filter((h): h is string => !!h))]));
  }
  anchorFor(f: FileSpec) { return f.export_time ? contractTime(f.export_time) : this.anchor; }
  naiveTzFor(f: FileSpec, platform: string) { return f.naive_tz ?? this.naiveTz[platform] ?? null; }
  isOwned(platform: string, handle: string | null) { return !!handle && this.owned[platform]?.has(normHandle(handle)!) === true; }
  whyDrop(platform: string, url: string, handle: string | null, caption: string | null): string | null {
    const listed = this.drop.get(url);
    if (listed) return listed;
    if (handle && this.replyHandles[platform]?.has(handle)) return `@${handle} only replies: a comment, not a post (reply_handles)`;
    if (this.isOwned(platform, handle)) return null;
    if (this.spamMin && this.spamPlatforms.has(platform) && links(caption) >= this.spamMin) return `link spam (${links(caption)} links in the caption)`;
    if (this.keywordPlatforms.has(platform) && this.keywordRe) {
      if (!caption) return "no caption to match a subject keyword";
      if (!this.keywordRe.test(caption)) return "no subject keyword in the caption";
    }
    return null;
  }
}

export function readContract(ws: string): ProfileContract {
  return JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "etl/profiles", `${ws}.json`), "utf8"));
}
/** where a contract's file sits under data/raw (the manifest's path) */
export function rawPathOf(c: ProfileContract, file: string): string {
  return path.posix.relative("data/raw", path.posix.join(c.data_dir ?? "data/raw", file));
}

// ---------------------------------------------------------------- reading
const col = (r: Row, ...names: string[]) => { for (const n of names) if (n in r) return r[n]; return null; };
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const squash = (t: string | null) => (t ?? "").replace(/\s+/g, " ").trim();
const pyStr = (v: unknown) => (v == null ? "" : String(v));
const pyNone = (v: string | null) => (v == null ? "None" : v);

function emptyPost(over: Partial<StagedPost> & Pick<StagedPost, "platform" | "url" | "brand_id" | "posted_at" | "month" | "source_file">): StagedPost {
  return {
    platform_post_id: null, creator_handle: null, creator_key: null, source: "earned", collection: "keyword", account_type: null, caption: null, hashtags: null,
    tagged_handles: null, is_paid: null, has_cart: null, is_reseller: null, followers_at_post: null, tier: null, universe: null, category_broad: null,
    product_category: null, content_format: null, content_type: null, product_name: null, product_url: null, price: null, price_original: null,
    discount_percent: null, views: null, likes: null, comments_count: null, shares: null, saves: null, engagements: null, engagements_lc: null,
    captured_days: null, relevant: null, stub: false, flags: null, ...over,
  };
}

/** what the core holds for the workspace before this load: each post's author and caption, and every post url */
async function coreState(ws: string) {
  const rows = (await sql.query(`select platform, url, creator_handle, caption from posts where workspace_id = $1`, [ws])) as { platform: string; url: string; creator_handle: string | null; caption: string | null }[];
  return rows;
}

export async function readProfile(input: AdapterInput): Promise<Staged> {
  const c = (input.options?.contract as ProfileContract | undefined) ?? readContract(input.workspace);
  const prof = new Profile(c);
  const st = emptyStaged();
  const byPath = new Map(input.files.map((f) => [f.raw.path, f]));
  const core = await coreState(input.workspace);
  const coreUrls = new Map<string, Set<string>>();
  const caption = new Map<string, { handle: string | null; caption: string | null }>(); // platform\u0001url → as it will stand
  for (const r of core) {
    (coreUrls.get(r.platform) ?? coreUrls.set(r.platform, new Set()).get(r.platform)!).add(r.url);
    caption.set(`${r.platform}\u0001${r.url}`, { handle: r.creator_handle, caption: r.caption });
  }
  const posts = new Map<string, StagedPost>(); // platform\u0001url (one brand: the subject)
  const accounts: StagedAccount[] = [];
  const comments = new Map<string, StagedComment>();
  const captions = new Map<string, { platform: string; url: string; caption: string; hashtags: string[] | null }>();
  const known = new Map<string, Set<string>>();
  const dropped = new Map<string, Set<string>>();
  let mergedComments = 0;

  for (const f of c.files) {
    const p = f.platform;
    if (!(PLATFORMS as readonly string[]).includes(p)) throw new Error(`unknown platform ${p} in the contract`);
    const rel = rawPathOf(c, f.file);
    const got = byPath.get(rel);
    if (!got) continue; // a load of some of the contract's files
    const name = path.basename(f.file);
    const rows = readCsv(got.bytes, name, { lowerHeaders: true });
    const anchor = prof.anchorFor(f);
    const nz = prof.naiveTzFor(f, p);
    const drops = tally(8);
    const report: FileReport = { file: name, kind: f.kind === "contents" ? "posts" : f.kind === "comments" ? "comments" : "captions", platform: p, rows_in: rows.length, staged: 0, merged: 0, dropped: 0, drops: {} };

    if (f.kind === "text") {
      const seen = new Set<string>();
      for (const r of rows) {
        const url = canonUrl(col(r, "posturl", "url", "post_url"), p);
        const text = toStr(col(r, "captiontext", "description", "caption", "text"));
        if (!url) { drops.add("missing url", text ?? ""); continue; }
        if (!text) { drops.add("no text in the row", url); continue; }
        if (seen.has(url)) { report.merged++; continue; }
        seen.add(url);
        captions.set(`${p}\u0001${url}`, { platform: p, url, caption: text, hashtags: hashtags(text) });
        const k = `${p}\u0001${url}`;
        const cur = caption.get(k);
        if (cur && cur.caption == null) caption.set(k, { ...cur, caption: text });
        const sp = posts.get(k);
        if (sp && sp.caption == null) { sp.caption = text; sp.hashtags = hashtags(text); }
        report.staged++;
      }
    } else if (f.kind === "contents") {
      const urls = rows.map((r) => canonUrl(col(r, "url"), p));
      const last = new Map<string, number>();
      urls.forEach((u, i) => { if (u) last.set(u, i); });
      const fileRows: StagedPost[] = [];
      const drop = dropped.get(p) ?? dropped.set(p, new Set()).get(p)!;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const url = urls[i];
        if (!url) { drops.add("missing url", col(r, "account_name", "account", "author")); continue; }
        if (last.get(url) !== i) { drops.add("same url repeated in the file (kept the last row)", url); continue; }
        const handle = normHandle(col(r, "account_name", "account", "author")) ?? handleFromUrl(url);
        const cap = toStr(col(r, "description", "caption", "text"));
        const rawDate = col(r, "date_posted", "date");
        let w = parseWhen(rawDate, anchor, nz);
        if (p === "x" && (w.when == null || w.how === "epoch_s" || (w.how === "naive_local" && !/[A-Za-z:]/.test(pyStr(rawDate))))) {
          const sf = snowflakeTime(url);
          if (sf) w = { when: sf, how: "snowflake_id" };
        }
        if (!w.when) { drops.add(`unparseable date_posted (${w.how})`, `${url} ${JSON.stringify(rawDate)}`); continue; }
        const why = prof.whyDrop(p, url, handle, cap);
        if (why) { drops.add(why, `@${handle} ${url}`); drop.add(url); continue; }
        const owned = prof.isOwned(p, handle);
        const reported = toInt(col(r, "followers"));
        let fol = reported;
        if ((fol == null || fol <= 0) && owned) fol = prof.followers[p] ?? null;
        if (fol != null && fol <= 0) fol = null;
        const likes = toInt(col(r, "likes", "like")), cmts = toInt(col(r, "replies/comments", "replies", "comments", "reply"));
        const nShares = firstInt(col(r, "share", "shares", "reshare"), col(r, "retweet/repost", "reposts", "repost"));
        const nReposts = toInt(col(r, "retweet/repost", "reposts", "repost"));
        const parts = [likes, cmts, nShares].filter((x): x is number => x != null);
        const lc = [likes, cmts].filter((x): x is number => x != null);
        fileRows.push(emptyPost({
          platform: p, url, brand_id: prof.brandId, platform_post_id: postIdFromUrl(url, p), creator_handle: handle, creator_key: owned ? null : handle,
          source: owned ? "owned" : "earned", collection: owned ? "owned" : "keyword", posted_at: w.when.toISOString(), month: localMonth(w.when, LOCAL_TZ),
          caption: cap, hashtags: hashtags(cap), followers_at_post: fol, tier: tierForFollowers(fol), content_type: (toStr(col(r, "content_type")) ?? "").toLowerCase() || null,
          views: toInt(col(r, "views")), likes, comments_count: cmts, shares: p === "tiktok" ? nShares : nReposts,
          engagements: parts.length ? parts.reduce((a, x) => a + x, 0) : null, engagements_lc: lc.length ? lc.reduce((a, x) => a + x, 0) : null, source_file: name,
        }));
        const added = fileRows[fileRows.length - 1];
        added.flags = flagsOf(fol == null ? reported : null, added.views, added.content_type);
      }
      // creators from this file: the first row's followers, then a later post's when it has some
      const best = new Map<string, { followers: number | null; last: string; first: string }>();
      for (const r of fileRows) {
        const k = r.creator_key;
        if (!k) continue;
        const cur = best.get(k);
        if (!cur) best.set(k, { followers: r.followers_at_post, last: r.posted_at, first: r.posted_at });
        else {
          if (r.posted_at > cur.last) { cur.last = r.posted_at; cur.followers = r.followers_at_post || cur.followers; }
          if (r.posted_at < cur.first) cur.first = r.posted_at;
        }
      }
      for (const [handle, v] of best) accounts.push({ platform: p, handle, display_name: null, followers_latest: v.followers, tier_latest: tierForFollowers(v.followers), first_seen: v.first.slice(0, 10), last_seen: v.last.slice(0, 10) });
      const kn = known.get(p) ?? known.set(p, new Set()).get(p)!;
      for (const r of fileRows) {
        kn.add(r.url);
        const k = `${p}\u0001${r.url}`;
        const prev = posts.get(k);
        if (prev && !prev.stub) {
          // a later export fills what it has and keeps what it lacks (the old loader's coalesce)
          const merged: StagedPost = { ...prev };
          for (const [key, v] of Object.entries(r) as [keyof StagedPost, unknown][]) if (v != null) (merged as Record<string, unknown>)[key] = v;
          merged.creator_key = r.creator_key;
          merged.flags = r.flags; // the latest export decides what is wrong with a row
          posts.set(k, merged);
        } else posts.set(k, r);
        const cur = caption.get(k);
        caption.set(k, { handle: r.creator_handle ?? cur?.handle ?? null, caption: r.caption ?? cur?.caption ?? null });
      }
      report.staged = fileRows.length;
    } else {
      if (!known.has(p)) known.set(p, new Set(coreUrls.get(p) ?? []));
      const kn = known.get(p)!;
      const drop = dropped.get(p) ?? new Set<string>();
      const seenIds = new Set<string>();
      const stubs = new Map<string, StagedPost>();
      let n = 0;
      for (const r of rows) {
        let url = canonUrl(col(r, "post_url", "source_post_url", "source_url", "url"), p);
        const textRaw = col(r, "comment_text", "text");
        if (!url) { drops.add("missing post url", toStr(textRaw) ?? ""); continue; }
        for (let hop = 0; hop < 3; hop++) {
          const par = prof.replyParent.get(url);
          if (!par) break;
          url = par;
        }
        const text = toStr(textRaw);
        if (!text) { drops.add("empty text", url); continue; }
        if (!WORDISH.test(text)) { drops.add("emoji or symbol only", text.slice(0, 40)); continue; }
        if (drop.has(url)) { drops.add("comment on a dropped post", `${url} ${JSON.stringify(text.slice(0, 50))}`); continue; }
        const handle = normHandle(col(r, "author", "author_username", "account_name"));
        const own = caption.get(`${p}\u0001${url}`);
        if (own && own.caption != null && normHandle(own.handle) === handle && squash(own.caption) === squash(text)) { drops.add("the post itself, captured as its first comment", url); continue; }
        const rawDate = col(r, "date", "timestamp", "date_posted");
        const w = parseWhen(rawDate, anchor, nz);
        if (!w.when && toStr(rawDate)) { drops.add(`unparseable date (${w.how})`, `${url} ${JSON.stringify(rawDate)}`); continue; }
        let rawId = toStr(col(r, "comment_id", "id"));
        if (rawId && /^[\d.]+E\+\d+$/i.test(rawId)) rawId = null;
        if (rawId && normHandle(rawId) === handle) rawId = null;
        const digest = sha1(`${url}|${pyNone(handle)}|${pyStr(rawDate)}|${text}`).slice(0, 24);
        let cid = rawId ? `${p}:${rawId}` : `${p}:h:${digest}`;
        if (seenIds.has(cid)) cid = `${p}:h:${digest}`;
        if (seenIds.has(cid)) { drops.add("duplicate comment in file", cid); continue; }
        seenIds.add(cid);
        const owned = prof.isOwned(p, handle);
        const sentRaw = (toStr(col(r, "sentiment")) ?? "").toLowerCase();
        const sent = ["positive", "neutral", "negative"].includes(sentRaw) ? sentRaw : null;
        if (!kn.has(url) && !stubs.has(url)) {
          const t0 = w.when ?? anchor;
          const hu = handleFromUrl(url);
          stubs.set(url, emptyPost({ platform: p, url, brand_id: prof.brandId, platform_post_id: postIdFromUrl(url, p), creator_handle: hu, creator_key: hu, posted_at: t0.toISOString(), month: localMonth(t0, LOCAL_TZ), content_type: "stub", stub: true, source_file: name }));
        } else if (stubs.has(url) && w.when && w.when.toISOString() < stubs.get(url)!.posted_at) {
          const s0 = stubs.get(url)!;
          s0.posted_at = w.when.toISOString(); s0.month = localMonth(w.when, LOCAL_TZ);
        }
        const row: StagedComment = {
          platform: p, url, brand_id: prof.brandId, platform_comment_id: cid, author_handle: handle, author_hash: authorHash(p, handle), text,
          posted_at: w.when ? w.when.toISOString() : null, likes: firstInt(col(r, "like", "like_count", "likes"), col(r, "reply", "reply_count", "replies")),
          views: toInt(col(r, "views")), sentiment: owned ? null : sent, sentiment_source: owned ? "subject" : sent ? "listening" : null, sentiment_confidence: null,
          sentiment_detail: null, csat: null, theme: null, purchase_intent: null, translation: null, topic_id: null, flags: null, source_file: name,
        };
        if (comments.has(cid)) mergedComments++;
        comments.set(cid, row); // a later file's row replaces an earlier one, as the old loader's upsert did
        n++;
      }
      for (const [url, sp] of stubs) {
        const k = `${p}\u0001${url}`;
        if (!posts.has(k)) posts.set(k, sp);
        if (sp.creator_key) accounts.push({ platform: p, handle: sp.creator_key, display_name: null, followers_latest: null, tier_latest: null, first_seen: sp.posted_at.slice(0, 10), last_seen: sp.posted_at.slice(0, 10) });
      }
      report.staged = n;
      report.notes = { stub_posts: stubs.size };
    }
    report.drops = drops.d;
    report.dropped = drops.total();
    st.files.push(report);
  }
  st.posts = [...posts.values()];
  st.comments = [...comments.values()];
  st.captions = [...captions.values()];
  st.accounts = foldCoalesce(accounts);
  st.facts = { subject: { brand_id: prof.brandId, name: c.subject.name, owned_handles: c.subject.owned_handles ?? {}, keywords: c.keywords ?? [] }, comments_replaced_by_a_later_file: mergedComments };
  return st;
}

/** creators from several files, folded as the old loader's file-by-file upserts left them: a value where one came, the earliest first and latest last seen */
function foldCoalesce(rows: StagedAccount[]): StagedAccount[] {
  const out = new Map<string, StagedAccount>();
  for (const r of rows) {
    const k = `${r.platform}\u0001${r.handle}`;
    const cur = out.get(k);
    if (!cur) { out.set(k, { ...r }); continue; }
    out.set(k, {
      ...cur,
      followers_latest: r.followers_latest ?? cur.followers_latest,
      tier_latest: r.tier_latest ?? cur.tier_latest,
      first_seen: [cur.first_seen, r.first_seen].filter((x): x is string => !!x).sort()[0] ?? null,
      last_seen: [cur.last_seen, r.last_seen].filter((x): x is string => !!x).sort().at(-1) ?? null,
    });
  }
  return [...out.values()];
}
