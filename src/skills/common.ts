/** Shared SQL fragments, evidence builders and caveats for skills. */
import type { Context, Window } from "./params";
import type { Evidence, Platform, Row } from "./types";

/** Build a WHERE fragment for posts with positional params appended to `params`. */
export class Where {
  clauses: string[] = [];
  params: unknown[] = [];
  constructor(public alias = "p") {}

  add(clause: string, ...values: unknown[]): this {
    // replace ?, ?, ... with $n in order
    let c = clause;
    for (const v of values) {
      this.params.push(v);
      c = c.replace("?", `$${this.params.length}`);
    }
    this.clauses.push(c);
    return this;
  }

  workspace(ctx: Context): this {
    return this.add(`${this.alias}.workspace_id = ?`, ctx.workspaceId);
  }

  window(w: Window, ctx: Context): this {
    return this.add(
      `${this.alias}.posted_at >= (?::date::timestamp at time zone ?) and ${this.alias}.posted_at < ((?::date + 1)::timestamp at time zone ?)`,
      w.from, ctx.tz, w.to, ctx.tz,
    );
  }

  platforms(p: Platform[] | null): this {
    return p ? this.add(`${this.alias}.platform = any(?::text[])`, p) : this;
  }

  brands(b: string[] | null, col = "brand_id"): this {
    return b ? this.add(`${this.alias}.${col} = any(?::text[])`, b) : this;
  }

  tiers(t: unknown, col = "tier"): this {
    const list = (t ?? []) as string[];
    return list.length ? this.add(`${this.alias}.${col} = any(?::text[])`, list) : this;
  }

  earned(): this {
    this.clauses.push(`${this.alias}.source = 'earned' and ${this.alias}.creator_id is not null`);
    return this;
  }

  /** next placeholder index for params appended outside the builder */
  next(v: unknown): string {
    this.params.push(v);
    return `$${this.params.length}`;
  }

  get sql(): string {
    return this.clauses.length ? this.clauses.join(" and ") : "true";
  }
}

export const PLATFORM_LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X" };

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
}

export function fmtInt(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("en-US") : "";
}

/** Evidence for one post row (needs id, url, creator_handle, platform, posted_at, brand_id, views, ...). */
export function postEvidence(id: string, p: Row, extra?: Record<string, number | string | null>): Evidence {
  const handle = p.creator_handle ? `@${p.creator_handle}` : "(unknown creator)";
  return {
    id,
    type: "post",
    ref: `posts.id=${p.id}`,
    label: `${handle} · ${shortDate(p.posted_at as string)} · ${PLATFORM_LABEL[p.platform as string] ?? p.platform} · ${p.brand_id}`,
    url: p.url as string,
    metrics: {
      views: (p.views as number) ?? null,
      likes: (p.likes as number) ?? null,
      comments: (p.comments_count as number) ?? null,
      ...(p.has_cart != null ? { cart: p.has_cart ? "yes" : "no" } : {}),
      ...(extra ?? {}),
    },
    sample_text: p.caption ? String(p.caption).replace(/\s+/g, " ").slice(0, 200) : undefined,
  };
}

export function creatorEvidence(id: string, c: Row, metrics: Record<string, number | string | null>): Evidence {
  return {
    id,
    type: "creator",
    ref: `creators.id=${c.creator_id ?? c.id}`,
    label: `@${c.creator_handle ?? c.handle} · ${PLATFORM_LABEL[c.platform as string] ?? c.platform}`,
    url: profileUrl(c.platform as string, (c.creator_handle ?? c.handle) as string),
    metrics,
  };
}

export function aggregateEvidence(id: string, ref: string, label: string, metrics: Record<string, number | string | null>): Evidence {
  return { id, type: "aggregate", ref, label, metrics };
}

export function profileUrl(platform: string, handle: string): string | undefined {
  if (!handle) return undefined;
  if (platform === "tiktok") return `https://www.tiktok.com/@${handle}`;
  if (platform === "instagram") return `https://www.instagram.com/${handle}/`;
  return undefined;
}

export class EvidenceList {
  list: Evidence[] = [];
  constructor(private cap = 150) {}
  nextId(): string {
    return `ev_${String(this.list.length + 1).padStart(2, "0")}`;
  }
  push(make: (id: string) => Evidence): string | null {
    if (this.list.length >= this.cap) return null;
    const ev = make(this.nextId());
    this.list.push(ev);
    return ev.id;
  }
}

/** Data caveats that any result touching the affected slices should carry (DATA_NOTES). */
export function windowCaveats(w: Window, platforms: Platform[] | null): string[] {
  const out: string[] = [];
  const touches = (from: string, to: string) => w.from <= to && w.to >= from;
  if ((!platforms || platforms.includes("tiktok")) && touches("2026-04-01", "2026-04-30"))
    out.push("TikTok April 2026 has 23 of 30 days captured (from 5 Apr); April volumes are lower than a full month.");
  if ((!platforms || platforms.includes("tiktok")) && w.from < "2026-04-05")
    out.push("TikTok data starts 5 Apr 2026; earlier dates in the window have Instagram only.");
  if ((!platforms || platforms.includes("instagram")) && touches("2026-01-01", "2026-03-31") && w.to >= "2026-04-01")
    out.push("Instagram Q1 2026 covers the Beauty universe and 53 brands only; Q2 adds Men's and Personal Care and 91 brands. Cross-quarter comparisons should restrict Q2 to Beauty.");
  if (!platforms || platforms.includes("instagram"))
    out.push("Instagram views are 0 for Carousel/Image posts and shares/saves are never available.");
  return out;
}

export const NO_SNAPSHOT_CAVEAT = "No day-by-day snapshots exist; metrics are the final capture per post.";
export const UNKNOWN_FOLLOWERS_CAVEAT = "Posts whose creator has an unknown follower count (tier null) are excluded from tier and per-follower metrics.";

export const POST_COLS = `p.id, p.url, p.platform, p.brand_id, p.creator_id, p.creator_handle, p.posted_at, p.views::float8 as views, p.likes,
  p.comments_count, p.shares, p.saves, p.engagements, p.has_cart, p.tier, p.followers_at_post, p.content_format,
  p.product_category, p.caption, p.source`;
