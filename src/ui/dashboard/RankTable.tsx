"use client";
/**
 * Brand performance rankings: one row per brand in the period, searchable and
 * sortable, with growth against the previous period. Share of views (day 7) leads,
 * with share of voice beside it (DECISIONS, 10 Oct 2026; src/definitions/catalog.ts).
 * A blue mark means the move is unusual for that brand by the weekly report's rule;
 * hover it for why. "Ask why" opens Chats with the row's figures.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { change as changeText, compact, int, pct } from "@/competitor/view";
import { askHref, PLATFORM_SHORT, type AskRef } from "@/dashboard/askref";
import type { RankRow } from "@/dashboard/data";

type SortKey = "share_views" | "views" | "share_voice" | "posts" | "creators" | "engagements" | "er" | "growth";
const PAGE = 12;
const PLATFORM_LONG: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };
const METRIC: Record<string, string> = { posts: "share of content", views: "share of views (day 7)", er: "engagement rate" };

function flagText(r: RankRow, prevLabel: string): string {
  return r.flags.map((f) => `${PLATFORM_LONG[f.platform] ?? f.platform} ${METRIC[f.metric]} ${f.direction} ${f.metric === "er" ? `${Math.abs(f.change).toFixed(1)} pt` : `${Math.abs(Math.round(f.change))}%`} vs ${prevLabel}, outside its own range`).join("\n");
}

export function RankTable({ rows, base, prevLabel, erFloor }: { rows: RankRow[]; base: Omit<AskRef, "k" | "brand">; prevLabel: string; erFloor: number }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("share_views");
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const shown = rows.filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.brand_id.includes(needle));
    const val = (r: RankRow): number => {
      if (sort === "growth") return r.views_change?.isNew ? Number.MAX_SAFE_INTEGER : r.views_change?.pct ?? -Infinity;
      if (sort === "er") return r.er_ranked ? r.er ?? -Infinity : -Infinity;
      return r[sort] ?? -Infinity;
    };
    return shown.slice().sort((a, b) => val(b) - val(a));
  }, [rows, q, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const at = Math.min(page, pages - 1);
  const rank = new Map(rows.slice().sort((a, b) => b.views - a.views).map((r, i) => [r.brand_id, i + 1]));
  const th = (k: SortKey, label: string, title?: string) => (
    <th className={`num sortable ${sort === k ? "on" : ""}`} onClick={() => { setSort(k); setPage(0); }} title={title}>{label}{sort === k ? " ↓" : ""}</th>
  );
  return (
    <div className="rank">
      <div className="rank-tools">
        <input type="search" placeholder="Search brand" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Search brand" />
        <span className="hint">{sorted.length} brands · <i className="umark" /> unusual for the brand · engagement rate ranks brands with {erFloor}+ posts</span>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th><th>Brand</th><th>Platform</th>
              {th("share_views", "Share of views", "The brand's views at day 7 ÷ every panel brand's, this period")}{th("views", "Views (day 7)", "Views in the reading nearest 7 days after posting; the latest reading below")}{th("share_voice", "Share of voice", "The brand's posts ÷ every panel brand's posts, this period")}{th("posts", "Content")}{th("creators", "Creators")}{th("engagements", "Engagement")}{th("er", "ER", `Engagement rate at day 7, posts with views; brands with fewer than ${erFloor} posts are not ranked on it`)}{th("growth", "Growth", `Views at day 7 vs ${prevLabel}`)}
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(at * PAGE, at * PAGE + PAGE).map((r) => (
              <tr key={r.brand_id} className={r.flags.length ? "flagged" : ""}>
                <td className="num muted">{rank.get(r.brand_id)}</td>
                <td>
                  <span className="bname">
                    <Link href={`/data/${r.brand_id}`}>{r.name}</Link>
                    {r.is_client && <span className="pill blue">client</span>}
                    {r.flags.length > 0 && <span className="umark" title={flagText(r, prevLabel)} aria-label={flagText(r, prevLabel)} />}
                  </span>
                </td>
                <td><span className="pfs">{r.platforms.map((p) => <span key={p} className={`pf ${p}`}>{PLATFORM_SHORT[p] ?? p}</span>)}</span></td>
                <td className="num strong">{pct(r.share_views, 1)}</td>
                <td className="num" title={r.too_new ? `${int(r.too_new)} of ${int(r.posts)} posts are too new for day 7` : undefined}>{compact(r.views)}<small>latest {compact(r.views_latest)}</small></td>
                <td className="num">{pct(r.share_voice, 1)}</td>
                <td className="num">{int(r.posts)}</td>
                <td className="num">{int(r.creators)}</td>
                <td className="num">{compact(r.engagements)}</td>
                <td className={`num ${r.er_ranked ? "" : "muted"}`}>{pct(r.er, 2)}</td>
                <td className={`num gr ${r.views_change?.isNew ? "new" : (r.views_change?.pct ?? 0) >= 0 ? "up" : "down"}`}>{r.prev ? changeText(r.views, r.prev.views) : "–"}</td>
                <td className="askcell"><Link className="askwhy" href={askHref({ ...base, k: "brand", brand: r.brand_id })}>Ask why</Link></td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={12} className="muted">No brand matches “{q}”.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button className="btn sm" disabled={at === 0} onClick={() => setPage(at - 1)}>Previous</button>
          <span>Page {at + 1} of {pages}</span>
          <button className="btn sm" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
