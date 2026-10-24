/**
 * The Brand & KOL dashboard (DECISIONS, 30 Sep 2026). Fixed layout, adjustable
 * filters: headline tiles, brand rankings, viewership mix, creator tiers, mentions
 * over time, top creators, trending content. Every figure comes from
 * src/dashboard/data.ts by the definitions (src/definitions/catalog.ts): views are
 * at day 7 with the latest beside them, and share of views leads (DECISIONS, 10 Oct
 * 2026). Every figure can be asked about: "Ask why" opens Chats with it.
 */
import Link from "next/link";
import { compact, dayMonth, int, pct, pts } from "@/competitor/view";
import { askHref, type AskRef } from "@/dashboard/askref";
import { CONTENT_PAGE, ER_MIN_POSTS, ER_MIN_VIEWS, filterQuery, type ContentCard, type ContentQuery, type CreatorRow, type DashboardData, type MixRow } from "@/dashboard/data";
import { DashFilters } from "./DashFilters";
import { Sections } from "./Sections";
import { Customise } from "./Customise";
import { DashTemplates } from "./DashTemplates";
import { PanelAsk } from "./PanelBuilder";
import type { DashLayout } from "@/dashboard/sections";
import { MentionsChart } from "./MentionsChart";
import { RankTable } from "./RankTable";
import { periodSetting } from "@/dashboard/period";
import { AddToDeck } from "../AddToDeck";
import { PageHeader } from "../kit/PageHeader";
import { Delta as DeltaText, StatRow, StatTile } from "../kit/StatTile";
import { IconChart, IconChevronRight, IconDocument, IconEye, IconLikeShapes } from "../kit/icons";
import { Empty, Notes, Panel, SectionCard } from "../kit/Section";
import { Pager, TABLE, TABLE_FRAME, TD, TD_NUM, TH, TH_NUM, THEAD, TR } from "../kit/Table";
import { TextField } from "../kit/Form";
import { buttonClass } from "../kit/Button";
import { SERIES, Swatch } from "../kit/chart";
import { cn } from "../cn";
import { AskLink, Bar, DASH_PAGE, Facts, OutLink, PlatformTag, SegLinks, Tag, TWO } from "./parts";

const TIER_SHORT: Record<string, string> = { nano: "Nano", micro: "Micro", mid: "Mid-tier", macro: "Macro", mega: "Mega" };

// whose posts brought the views: three categorical slots, in a fixed order
const MIX = { own: SERIES[0], aff: SERIES[1], cre: SERIES[2] };

function Delta({ c, prevLabel, points = false }: { c: DashboardData["kpis"]["change"]["posts"]; prevLabel: string; points?: boolean }) {
  if (!c) return <DeltaText dir="none">No {prevLabel} to compare</DeltaText>;
  if (c.isNew) return <DeltaText dir="up">New vs {prevLabel}</DeltaText>;
  const v = c.pct ?? 0;
  const text = points ? pts(v, 0, 2) : `${v >= 0 ? "+" : "−"}${Math.abs(v) >= 1000 ? Math.round(Math.abs(v)).toLocaleString("en-US") : Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;
  return <DeltaText dir={v > 0 ? "up" : v < 0 ? "down" : "flat"}>{text} vs {prevLabel}</DeltaText>;
}

function CreatorTable({ title, rows, metric, base, names }: { title: string; rows: CreatorRow[]; metric: "views" | "comments"; base: Omit<AskRef, "k">; names: Map<string, string> }) {
  return (
    <Panel title={title}>
      {rows.length === 0 ? <Empty>No creator posts in this period.</Empty> : (
        <ol className="flex flex-col divide-y divide-card-border">
          {rows.map((c, i) => (
            <li key={c.creator_id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-500">{i + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <PlatformTag p={c.platform} />
                  {c.profile_url ? <OutLink href={c.profile_url} className="truncate text-sm">@{c.handle}</OutLink> : <b className="truncate text-sm font-semibold text-gray-900">@{c.handle}</b>}
                </span>
                <small className="text-xs text-gray-500">{c.tier ? TIER_SHORT[c.tier] : "Unknown tier"}{c.followers != null ? ` · ${compact(c.followers)} followers` : ""} · {int(c.posts)} post{c.posts === 1 ? "" : "s"} · {c.brands.slice(0, 2).map((b) => names.get(b) ?? b).join(", ")}{c.brands.length > 2 ? ` +${c.brands.length - 2}` : ""}</small>
              </div>
              <span className="flex shrink-0 flex-col items-end">
                <b className="text-sm font-semibold tabular-nums text-gray-900">{metric === "views" ? compact(c.views) : int(c.comments)}</b>
                <small className="text-[11px] text-gray-500">{metric === "views" ? "views (day 7)" : metric}</small>
                <AskLink href={askHref({ ...base, k: "creator", creator: c.creator_id })} label={`Ask why about @${c.handle}`} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const MIX_PAGE = 12;

function MixTable({ rows, base }: { rows: MixRow[]; base: Omit<AskRef, "k"> }) {
  if (!rows.length) return <Empty>No views at day 7 in this period.</Empty>;
  const share = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1"><Swatch colour={MIX.own}>Own accounts</Swatch><Swatch colour={MIX.aff}>Affiliators</Swatch><Swatch colour={MIX.cre}>Other creators</Swatch></div>
      <div className={TABLE_FRAME}>
        <table className={cn(TABLE, "min-w-[760px]")}>
          <thead className={THEAD}><tr><th className={TH}>Brand</th><th className={TH_NUM}>Views (day 7)</th><th className={cn(TH, "w-[32%]")}>Mix</th><th className={TH_NUM}>Own</th><th className={TH_NUM}>Affiliators</th><th className={TH_NUM}>Creators</th><th className={TH}><span className="sr-only">Ask</span></th></tr></thead>
          <tbody>
            {rows.slice(0, MIX_PAGE).map((r) => (
              <tr key={r.brand_id} className={TR}>
                <td className={TD}><Link href={`/data/${r.brand_id}`} className="font-semibold text-gray-900 underline-offset-2 hover:text-brand-palette-700 hover:underline">{r.name}</Link></td>
                <td className={cn(TD_NUM, "font-semibold text-gray-900")}>{compact(r.total)}</td>
                <td className={cn(TD, "align-middle")}>
                  {/* 2px white gaps between the three parts */}
                  <span aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-md">
                    {([["own", r.own], ["aff", r.affiliators], ["cre", r.creators]] as const).map(([k, v]) => share(v, r.total) > 0 && <i key={k} className="block h-full" style={{ width: `${share(v, r.total)}%`, background: MIX[k] }} />)}
                  </span>
                </td>
                <td className={TD_NUM}>{pct(share(r.own, r.total), 0)}</td>
                <td className={TD_NUM}>{pct(share(r.affiliators, r.total), 0)}</td>
                <td className={TD_NUM}>{pct(share(r.creators, r.total), 0)}</td>
                <td className={cn(TD, "w-0")}><AskLink href={askHref({ ...base, k: "brand", brand: r.brand_id })} label={`Ask why about ${r.name}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > MIX_PAGE && <p className="text-xs text-gray-500">The {MIX_PAGE} brands with the most views at day 7 of {rows.length}.</p>}
    </div>
  );
}

function PostCard({ c, base, names }: { c: ContentCard; base: Omit<AskRef, "k">; names: Map<string, string> }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-2xl border border-card-border bg-white p-4">
      <header className="flex min-w-0 items-center gap-1.5 text-sm">
        <PlatformTag p={c.platform} />
        <b className="truncate font-semibold text-gray-900">{c.handle ? `@${c.handle}` : "Unknown account"}</b>
        <time className="ml-auto shrink-0 text-xs text-gray-500">{dayMonth(c.posted_at)}</time>
      </header>
      <p className="line-clamp-3 text-sm leading-relaxed text-gray-700" title={c.caption || undefined}>{c.caption || <i className="text-gray-500">No caption</i>}</p>
      {c.brands.length > 0 && <div className="flex flex-wrap gap-1">{c.brands.slice(0, 3).map((b) => <Tag key={b}>{names.get(b) ?? b}</Tag>)}</div>}
      <Facts cols={3} items={[
        { k: c.so_far ? "Views so far" : "Views (day 7)", v: compact(c.views), title: c.so_far ? "Under 7 days old: its latest reading so far" : `Latest reading: ${compact(c.views_latest)}` },
        { k: "Engagement", v: c.engagements == null ? "–" : compact(c.engagements) },
        { k: "ER", v: pct(c.er, 2) },
      ]} />
      <footer className="mt-auto flex items-center justify-between gap-2 border-0 border-t border-card-border pt-2">
        <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center text-xs font-semibold text-gray-700 underline-offset-2 hover:text-brand-palette-700 hover:underline max-md:min-h-11">Open post ↗</a>
        <AskLink href={askHref({ ...base, k: "post", url: c.url })} label={`Ask why about the post by ${c.handle ? `@${c.handle}` : "an unknown account"}`} />
      </footer>
    </article>
  );
}

/** each stat tile's icon, by its key */
const TILE_ICON = { posts: IconDocument, views: IconEye, engagements: IconLikeShapes, er: IconChart };

export function Dashboard({ d, content, cq, view }: { d: DashboardData; content: { cards: ContentCard[]; total: number }; cq: ContentQuery; view: DashLayout }) {
  const f = d.filters;
  const pin = { platform: f.platform, brands: f.brands, period: periodSetting(f.period, d.as_of) };
  const base = { platform: f.platform, brands: f.brands, period: f.period.key };
  const names = new Map(d.options.brands.map((b) => [b.id, b.name]));
  const prev = f.prev.short;
  const k = d.kpis;
  const engNote = d.engagement_basis === "likes_comments" ? "Likes + comments" : "Platform-native engagement";
  const engAbout = d.engagement_basis === "likes_comments" ? "Likes and comments, the measure every platform shares." : "Engagement as each platform counts it.";
  const contentHref = (extra: Record<string, string | number | undefined>) => `/dashboard?${filterQuery(f, { sort: cq.sort === "views" ? undefined : cq.sort, q: cq.q || undefined, ...extra })}#content`;
  const pages = Math.ceil(content.total / CONTENT_PAGE);
  const tiles: { key: "posts" | "views" | "engagements" | "er"; label: string; value: string; sub: string; about?: string }[] = [
    { key: "posts", label: "Total content", value: int(k.now.posts), sub: `${int(k.now.creators)} creators` },
    { key: "views", label: k.now.so_far ? "Views (day 7, so far)" : "Views (day 7)", value: compact(k.now.views), sub: `Latest ${compact(k.now.views_latest)} · ${compact(k.now.comments)} comments`, about: `Views at day 7 after posting; ${compact(k.now.views_latest)} at the latest reading.${k.now.so_far ? ` ${int(k.now.so_far)} posts are under 7 days old and count their views so far.` : ""} ${compact(k.now.comments)} comments.` },
    { key: "engagements", label: "Engagement", value: compact(k.now.engagements), sub: engNote, about: engAbout },
    { key: "er", label: "Engagement rate", value: pct(k.now.er, 2), sub: "Engagement ÷ day-7 views", about: "Engagement divided by views at day 7, over posts that report views." },
  ];
  const deck = (slide: "scoreboard" | "tiers" | "trend" | "creators" | "content") => <AddToDeck payload={{ slide, brands: pin.brands, grain: f.period.grain }} />;
  const pageLink = (on: boolean, href: string, label: string) => on ? <Link className={buttonClass("outline", "sm")} href={href} scroll={false}>{label}</Link> : <span aria-disabled="true" className={buttonClass("outline", "sm", "pointer-events-none opacity-50")}>{label}</span>;
  const render: Record<string, (t: string) => React.ReactNode> = {
    rankings: (t) => (
      <SectionCard title={t} actions={deck("scoreboard")} hint={<>Every brand with content in {f.period.label}, by share of views at day 7, with share of voice beside it; growth is views at day 7 against {f.prev.label}.</>}>
        <RankTable rows={d.rankings} base={base} prevLabel={f.prev.label} erFloor={ER_MIN_POSTS} />
      </SectionCard>
    ),
    mix: (t) => (
      <SectionCard title={t} hint={<>Whose posts brought each brand&apos;s views at day 7 in {f.period.label}: its own accounts, affiliators (creators with a cart post in the period) or other creators.</>}>
        <MixTable rows={d.mix} base={base} />
      </SectionCard>
    ),
    tiers: (t) => (
      <SectionCard title={t} actions={deck("tiers")} hint={<>Who posted in {f.period.label}, by follower band. Brand accounts are left out; posts with unknown followers are not in a tier.</>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {d.tiers.map((t) => (
            <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-card-border p-4" key={t.tier}>
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-sm font-semibold text-gray-900">{TIER_SHORT[t.tier]}</b>
                <span className="text-xl font-bold tabular-nums text-gray-900">{pct(t.share_pct)}</span>
              </div>
              <Bar pct={t.share_pct} label={`${TIER_SHORT[t.tier]}: ${pct(t.share_pct)} of creators`} />
              <Facts items={[
                { k: "Creators", v: int(t.creators) },
                { k: "Content", v: int(t.posts) },
                { k: "Posts per creator", v: t.posts_per_creator == null ? "–" : t.posts_per_creator.toFixed(1) },
                { k: "Views (day 7)", v: compact(t.views) },
                { k: "Engagement", v: compact(t.engagements) },
                { k: "ER", v: pct(t.er, 2) },
              ]} />
              <AskLink className="self-start" href={askHref({ ...base, k: "tier", tier: t.tier })} label={`Ask why about ${TIER_SHORT[t.tier]} creators`} />
            </div>
          ))}
        </div>
      </SectionCard>
    ),
    trend: (t) => (
      <SectionCard title={t} actions={deck("trend")} hint={<>Weekly, the twelve weeks up to the end of {f.period.label}.</>}>
        <MentionsChart weeks={d.trend.weeks} series={d.trend.series} base={base} chosen={d.trend.chosen} />
      </SectionCard>
    ),
    creators: (t) => (
      <SectionCard title={t} actions={deck("creators")} hint={<>{f.period.label}; brand accounts left out, each post counted once.</>}>
        <div className={TWO}>
          <CreatorTable title="By views" rows={d.creators.by_views} metric="views" base={base} names={names} />
          <CreatorTable title="By comments" rows={d.creators.by_comments} metric="comments" base={base} names={names} />
        </div>
      </SectionCard>
    ),
    content: (t) => (
      <SectionCard id="content" title={t} actions={deck("content")} hint={<>{int(content.total)} post{content.total === 1 ? "" : "s"} in {f.period.label}{cq.q ? ` matching “${cq.q}”` : ""}{cq.sort === "er" ? `; engagement rate ranks posts with ${compact(ER_MIN_VIEWS)}+ views` : ""}.</>}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegLinks label="Sort content" items={([["views", "By views"], ["engagement", "By engagement"], ["er", "By engagement rate"]] as const).map(([s, label]) => ({ label, on: cq.sort === s, href: `/dashboard?${filterQuery(f, { sort: s === "views" ? undefined : s, q: cq.q || undefined })}#content` }))} />
          <form action="/dashboard" method="get" className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {f.platform !== "all" && <input type="hidden" name="platform" value={f.platform} />}
            {f.brands.length > 0 && <input type="hidden" name="brands" value={f.brands.join(",")} />}
            <input type="hidden" name="period" value={f.period.key} />
            {cq.sort !== "views" && <input type="hidden" name="sort" value={cq.sort} />}
            <TextField type="search" name="q" defaultValue={cq.q} placeholder="Keyword, or @username" aria-label="Search content" className="min-w-0 flex-1 sm:w-64" />
            <button className={buttonClass("outline", "sm")}>Search</button>
            {cq.q && <Link className={buttonClass("ghost", "sm")} href={contentHref({ q: undefined })}>Clear</Link>}
          </form>
        </div>
        {content.cards.length === 0 ? <Empty>{cq.q ? `No posts match “${cq.q}”. Try another keyword, or clear the search.` : "No posts in this period. Pick another period or platform above."}</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{content.cards.map((c) => <PostCard key={c.url} c={c} base={base} names={names} />)}</div>
        )}
        {pages > 1 && (
          <Pager page={cq.page} pages={pages} prev={pageLink(cq.page > 0, contentHref({ page: cq.page - 1 }), "Previous")} next={pageLink(cq.page + 1 < pages, contentHref({ page: cq.page + 1 }), "Next")} />
        )}
      </SectionCard>
    ),
  };
  return (
    <section data-tw className={DASH_PAGE}>
      <PageHeader title="Dashboard" subtitle={<>{f.period.label} vs {f.prev.label} · data through {dayMonth(d.as_of)} {d.as_of.slice(0, 4)}</>}
        actions={<>{view.builder && <Customise sections={view.layout.all} builder codename={view.codename} client={view.clientName} />}<DashTemplates builder={view.builder} codename={view.codename} /></>} />
      <DashFilters platform={f.platform} brands={f.brands} period={f.period.key} months={d.options.months} weeks={d.options.weeks} brandOptions={d.options.brands} platforms={d.options.platforms} />
      <Notes lines={d.caveats} />

      <StatRow n={4}>
        {tiles.map((t) => (
          <StatTile key={t.key} icon={TILE_ICON[t.key]} label={t.label} value={t.value} delta={<Delta c={k.change[t.key]} prevLabel={prev} points={t.key === "er"} />} sub={t.sub} about={t.about}
            action={(
              <Link href={askHref({ ...base, k: "kpi", metric: t.key })} aria-label={`Ask CeMO why ${t.label.toLowerCase()} moved`} className={buttonClass("secondary", "sm", "group w-full")}>
                Ask CeMO why<IconChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            )} />
        ))}
      </StatRow>

      {view.builder && view.scope && <PanelAsk scope={view.scope} />}
      <Sections arranged={view.layout} render={render} who={view.clientName} showHref={view.showHref} panels={view.panels} builder={view.builder} scope={view.scope} />
    </section>
  );
}
