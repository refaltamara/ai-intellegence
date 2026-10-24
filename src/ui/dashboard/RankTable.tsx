"use client";
/**
 * Brand performance rankings: one row per brand in the period, searchable and
 * sortable, with growth against the previous period. Share of views (day 7) leads,
 * with share of voice beside it (DECISIONS, 10 Oct 2026; src/definitions/catalog.ts).
 * An orange mark means the move is unusual for that brand by the weekly report's rule;
 * hover it for why. "Ask why" opens Chats with the row's figures.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { change as changeText, compact, int, pct } from "@/competitor/view";
import { askHref, type AskRef } from "@/dashboard/askref";
import type { RankRow } from "@/dashboard/data";
import { Button } from "../kit/Button";
import { TextField } from "../kit/Form";
import { IconSearch } from "../kit/icons";
import { EMPTY_ROW, Pager, SUB, SortHeader, TABLE, TABLE_FRAME, TD, TD_NUM, TH, TH_NUM, THEAD, TR } from "../kit/Table";
import { cn } from "../cn";
import { AskLink, PlatformTag, Tag } from "./parts";

/** the unusual-move mark: a small orange diamond, named for screen readers */
function UMark({ text }: { text?: string }) {
  return <span role={text ? "img" : undefined} aria-label={text} aria-hidden={text ? undefined : true} title={text} className="inline-block h-2 w-2 shrink-0 rotate-45 rounded-[2px] bg-brand-palette-600" />;
}

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
    <SortHeader active={sort === k} onSort={() => { setSort(k); setPage(0); }} title={title}>{label}</SortHeader>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="relative w-64 max-w-full">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><IconSearch size={16} /></span>
          <TextField type="search" placeholder="Search brand" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Search brand" className="pl-9" />
        </label>
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">{sorted.length} brands · <UMark /> unusual for the brand · engagement rate ranks brands with {erFloor}+ posts</span>
      </div>
      <div className={TABLE_FRAME}>
        <table className={cn(TABLE, "min-w-[1080px]")}>
          <thead className={THEAD}>
            <tr>
              <th className={cn(TH_NUM, "w-0")}>#</th><th className={TH}>Brand</th><th className={TH}>Platform</th>
              {th("share_views", "Share of views", "The brand's views at day 7 ÷ every panel brand's, this period")}{th("views", "Views (day 7)", "Views in the reading nearest 7 days after posting; the latest reading below")}{th("share_voice", "Share of voice", "The brand's posts ÷ every panel brand's posts, this period")}{th("posts", "Content")}{th("creators", "Creators")}{th("engagements", "Engagement")}{th("er", "ER", `Engagement rate at day 7, posts with views; brands with fewer than ${erFloor} posts are not ranked on it`)}{th("growth", "Growth", `Views at day 7 vs ${prevLabel}`)}
              <th className={TH}><span className="sr-only">Ask</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(at * PAGE, at * PAGE + PAGE).map((r) => {
              const g = r.views_change?.isNew ? "new" : (r.views_change?.pct ?? 0) >= 0 ? "up" : "down";
              return (
                <tr key={r.brand_id} className={cn(TR, r.is_client && "bg-brand-palette-50/60")}>
                  <td className={cn(TD_NUM, "text-gray-500")}>{rank.get(r.brand_id)}</td>
                  <td className={TD}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/data/${r.brand_id}`} className="font-semibold text-gray-900 underline-offset-2 hover:text-brand-palette-700 hover:underline">{r.name}</Link>
                      {r.is_client && <Tag tone="brand">client</Tag>}
                      {r.flags.length > 0 && <UMark text={flagText(r, prevLabel)} />}
                    </span>
                  </td>
                  <td className={TD}><span className="flex flex-wrap gap-1">{r.platforms.map((p) => <PlatformTag key={p} p={p} />)}</span></td>
                  <td className={cn(TD_NUM, "font-semibold text-gray-900")}>{pct(r.share_views, 1)}</td>
                  <td className={TD_NUM} title={r.so_far ? `${int(r.so_far)} of ${int(r.posts)} posts are under 7 days old and count their latest reading so far` : undefined}>{compact(r.views)}<small className={SUB}>{r.so_far ? "so far · " : ""}latest {compact(r.views_latest)}</small></td>
                  <td className={TD_NUM}>{pct(r.share_voice, 1)}</td>
                  <td className={TD_NUM}>{int(r.posts)}</td>
                  <td className={TD_NUM}>{int(r.creators)}</td>
                  <td className={TD_NUM}>{compact(r.engagements)}</td>
                  <td className={cn(TD_NUM, !r.er_ranked && "text-gray-500")}>{pct(r.er, 2)}</td>
                  <td className={cn(TD_NUM, "font-semibold", !r.prev ? "text-gray-500" : g === "down" ? "text-red-700" : g === "up" ? "text-green-700" : "text-brand-palette-700")}>{r.prev ? changeText(r.views, r.prev.views) : "–"}</td>
                  <td className={cn(TD, "w-0")}><AskLink href={askHref({ ...base, k: "brand", brand: r.brand_id })} label={`Ask why about ${r.name}`} /></td>
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={12} className={EMPTY_ROW}>No brand matches “{q}”. Clear the search to see every brand.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <Pager page={at} pages={pages}
          prev={<Button size="sm" variant="outline" disabled={at === 0} onClick={() => setPage(at - 1)}>Previous</Button>}
          next={<Button size="sm" variant="outline" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>Next</Button>} />
      )}
    </div>
  );
}
