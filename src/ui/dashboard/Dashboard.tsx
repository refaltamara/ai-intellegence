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
import { askHref, PLATFORM_SHORT, type AskRef } from "@/dashboard/askref";
import { CONTENT_PAGE, ER_MIN_POSTS, ER_MIN_VIEWS, filterQuery, type ContentCard, type ContentQuery, type CreatorRow, type DashboardData, type MixRow } from "@/dashboard/data";
import { DashFilters } from "./DashFilters";
import { Sections } from "./Sections";
import { Customise } from "./Customise";
import type { DashLayout } from "@/dashboard/sections";
import { MentionsChart } from "./MentionsChart";
import { RankTable } from "./RankTable";
import { periodSetting } from "@/dashboard/period";
import { AddToDeck } from "../AddToDeck";

const TIER_TONE: Record<string, string> = { nano: "mint", micro: "blue", mid: "violet", macro: "sun", mega: "coral" };
const TIER_SHORT: Record<string, string> = { nano: "Nano", micro: "Micro", mid: "Mid-tier", macro: "Macro", mega: "Mega" };

function Delta({ c, prevLabel, points = false }: { c: DashboardData["kpis"]["change"]["posts"]; prevLabel: string; points?: boolean }) {
  if (!c) return <span className="delta flat">No {prevLabel} to compare</span>;
  if (c.isNew) return <span className="delta up">New vs {prevLabel}</span>;
  const v = c.pct ?? 0;
  const text = points ? pts(v, 0, 2) : `${v >= 0 ? "+" : "−"}${Math.abs(v) >= 1000 ? Math.round(Math.abs(v)).toLocaleString("en-US") : Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;
  return <span className={`delta ${v > 0 ? "up" : v < 0 ? "down" : "flat"}`}>{text} vs {prevLabel}</span>;
}

function CreatorTable({ title, rows, metric, base, names }: { title: string; rows: CreatorRow[]; metric: "views" | "comments"; base: Omit<AskRef, "k">; names: Map<string, string> }) {
  return (
    <div className="dcard">
      <h3>{title}</h3>
      {rows.length === 0 ? <div className="empty">No creator posts in this period.</div> : (
        <ol className="creators">
          {rows.map((c, i) => (
            <li key={c.creator_id}>
              <span className="n">{i + 1}</span>
              <div className="who">
                {c.profile_url ? <a href={c.profile_url} target="_blank" rel="noreferrer">@{c.handle}</a> : <b>@{c.handle}</b>}
                <small><span className={`pf ${c.platform}`}>{PLATFORM_SHORT[c.platform] ?? c.platform}</span>{c.tier ? TIER_SHORT[c.tier] : "Unknown tier"}{c.followers != null ? ` · ${compact(c.followers)} followers` : ""} · {int(c.posts)} post{c.posts === 1 ? "" : "s"} · {c.brands.slice(0, 2).map((b) => names.get(b) ?? b).join(", ")}{c.brands.length > 2 ? ` +${c.brands.length - 2}` : ""}</small>
              </div>
              <span className="v">{metric === "views" ? compact(c.views) : int(c.comments)}<small>{metric === "views" ? "views (day 7)" : metric}</small></span>
              <Link className="askwhy" href={askHref({ ...base, k: "creator", creator: c.creator_id })}>Ask why</Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const MIX_PAGE = 12;

function MixTable({ rows, base }: { rows: MixRow[]; base: Omit<AskRef, "k"> }) {
  if (!rows.length) return <div className="empty">No views at day 7 in this period.</div>;
  const share = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);
  return (
    <div className="rank mix">
      <div className="mixkey"><span className="own">Own accounts</span><span className="aff">Affiliators</span><span className="cre">Other creators</span></div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Brand</th><th className="num">Views (day 7)</th><th>Mix</th><th className="num">Own</th><th className="num">Affiliators</th><th className="num">Creators</th><th /></tr></thead>
          <tbody>
            {rows.slice(0, MIX_PAGE).map((r) => (
              <tr key={r.brand_id}>
                <td><span className="bname"><Link href={`/data/${r.brand_id}`}>{r.name}</Link></span></td>
                <td className="num strong">{compact(r.total)}</td>
                <td><span className="mixbar" aria-hidden><i className="own" style={{ width: `${share(r.own, r.total)}%` }} /><i className="aff" style={{ width: `${share(r.affiliators, r.total)}%` }} /><i className="cre" style={{ width: `${share(r.creators, r.total)}%` }} /></span></td>
                <td className="num">{pct(share(r.own, r.total), 0)}</td>
                <td className="num">{pct(share(r.affiliators, r.total), 0)}</td>
                <td className="num">{pct(share(r.creators, r.total), 0)}</td>
                <td className="askcell"><Link className="askwhy" href={askHref({ ...base, k: "brand", brand: r.brand_id })}>Ask why</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > MIX_PAGE && <p className="hint">The {MIX_PAGE} brands with the most views at day 7 of {rows.length}.</p>}
    </div>
  );
}

function PostCard({ c, base, names }: { c: ContentCard; base: Omit<AskRef, "k">; names: Map<string, string> }) {
  return (
    <article className="postcard">
      <header>
        <span className={`pf ${c.platform}`}>{PLATFORM_SHORT[c.platform] ?? c.platform}</span>
        <b>{c.handle ? `@${c.handle}` : "Unknown account"}</b>
        <time>{dayMonth(c.posted_at)}</time>
      </header>
      <p>{c.caption || <i className="muted">No caption</i>}</p>
      <div className="tags">{c.brands.slice(0, 3).map((b) => <span key={b} className="tag">{names.get(b) ?? b}</span>)}</div>
      <dl>
        <div><dt>Views (day 7)</dt><dd title={`Latest reading: ${compact(c.views_latest)}`}>{c.views == null ? "Too new" : compact(c.views)}</dd></div>
        <div><dt>Engagement</dt><dd>{c.engagements == null ? "–" : compact(c.engagements)}</dd></div>
        <div><dt>ER</dt><dd>{pct(c.er, 2)}</dd></div>
      </dl>
      <footer>
        <a href={c.url} target="_blank" rel="noreferrer">Open post ↗</a>
        <Link className="askwhy" href={askHref({ ...base, k: "post", url: c.url })}>Ask why</Link>
      </footer>
    </article>
  );
}

export function Dashboard({ d, content, cq, view }: { d: DashboardData; content: { cards: ContentCard[]; total: number }; cq: ContentQuery; view: DashLayout }) {
  const f = d.filters;
  const pin = { platform: f.platform, brands: f.brands, period: periodSetting(f.period, d.as_of) };
  const base = { platform: f.platform, brands: f.brands, period: f.period.key };
  const names = new Map(d.options.brands.map((b) => [b.id, b.name]));
  const prev = f.prev.short;
  const k = d.kpis;
  const engNote = d.engagement_basis === "likes_comments" ? "Likes + comments, the measure every platform shares" : "Platform-native engagement";
  const contentHref = (extra: Record<string, string | number | undefined>) => `/dashboard?${filterQuery(f, { sort: cq.sort === "views" ? undefined : cq.sort, q: cq.q || undefined, ...extra })}#content`;
  const pages = Math.ceil(content.total / CONTENT_PAGE);
  const tiles: { key: "posts" | "views" | "engagements" | "er"; label: string; value: string; sub: string; tone: string }[] = [
    { key: "posts", label: "Total content", value: int(k.now.posts), sub: `${int(k.now.creators)} creators`, tone: "blue" },
    { key: "views", label: "Views (day 7)", value: compact(k.now.views), sub: `Latest ${compact(k.now.views_latest)}${k.now.too_new ? ` · ${int(k.now.too_new)} posts too new` : ""} · ${compact(k.now.comments)} comments`, tone: "violet" },
    { key: "engagements", label: "Engagement", value: compact(k.now.engagements), sub: engNote, tone: "mint" },
    { key: "er", label: "Engagement rate", value: pct(k.now.er, 2), sub: "Engagement ÷ views at day 7, posts with views", tone: "coral" },
  ];
  const render: Record<string, (t: string) => React.ReactNode> = {
    rankings: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><AddToDeck className="btn sm ghost pin" payload={{ slide: "scoreboard", brands: pin.brands, grain: f.period.grain }} /><span>Every brand with content in {f.period.label}, by share of views at day 7, with share of voice beside it; growth is views at day 7 against {f.prev.label}.</span></header>
        <RankTable rows={d.rankings} base={base} prevLabel={f.prev.label} erFloor={ER_MIN_POSTS} />
      </div>
    ),
    mix: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><span>Whose posts brought each brand&apos;s views at day 7 in {f.period.label}: its own accounts, affiliators (creators with a cart post in the period) or other creators.</span></header>
        <div className="dcard"><MixTable rows={d.mix} base={base} /></div>
      </div>
    ),
    tiers: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><AddToDeck className="btn sm ghost pin" payload={{ slide: "tiers", brands: pin.brands, grain: f.period.grain }} /><span>Who posted in {f.period.label}, by follower band. Brand accounts are left out; posts with unknown followers are not in a tier.</span></header>
        <div className="tiers">
          {d.tiers.map((t) => (
            <div className="tiercard" data-tone={TIER_TONE[t.tier]} key={t.tier}>
              <div className="top"><b>{TIER_SHORT[t.tier]}</b><span>{pct(t.share_pct)}</span></div>
              <div className="bar"><i style={{ width: `${Math.min(100, t.share_pct ?? 0)}%` }} /></div>
              <dl>
                <div><dt>Creators</dt><dd>{int(t.creators)}</dd></div>
                <div><dt>Content</dt><dd>{int(t.posts)}</dd></div>
                <div><dt>Posts per creator</dt><dd>{t.posts_per_creator == null ? "–" : t.posts_per_creator.toFixed(1)}</dd></div>
                <div><dt>Views (day 7)</dt><dd>{compact(t.views)}</dd></div>
                <div><dt>Engagement</dt><dd>{compact(t.engagements)}</dd></div>
                <div><dt>ER</dt><dd>{pct(t.er, 2)}</dd></div>
              </dl>
              <Link className="askwhy" href={askHref({ ...base, k: "tier", tier: t.tier })}>Ask why</Link>
            </div>
          ))}
        </div>
      </div>
    ),
    trend: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><AddToDeck className="btn sm ghost pin" payload={{ slide: "trend", brands: pin.brands, grain: f.period.grain }} /><span>Weekly, the twelve weeks up to the end of {f.period.label}.</span></header>
        <div className="dcard"><MentionsChart weeks={d.trend.weeks} series={d.trend.series} base={base} chosen={d.trend.chosen} /></div>
      </div>
    ),
    creators: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><AddToDeck className="btn sm ghost pin" payload={{ slide: "creators", brands: pin.brands, grain: f.period.grain }} /><span>{f.period.label}; brand accounts left out, each post counted once.</span></header>
        <div className="two-eq">
          <CreatorTable title="By views" rows={d.creators.by_views} metric="views" base={base} names={names} />
          <CreatorTable title="By comments" rows={d.creators.by_comments} metric="comments" base={base} names={names} />
        </div>
      </div>
    ),
    content: (t) => (
      <div className="dsection" id="content">
        <header><h2>{t}</h2><AddToDeck className="btn sm ghost pin" payload={{ slide: "content", brands: pin.brands, grain: f.period.grain }} /><span>{int(content.total)} post{content.total === 1 ? "" : "s"} in {f.period.label}{cq.q ? ` matching “${cq.q}”` : ""}{cq.sort === "er" ? `; engagement rate ranks posts with ${compact(ER_MIN_VIEWS)}+ views` : ""}.</span></header>
        <div className="ctools">
          <div className="seg sm" role="tablist" aria-label="Sort content">
            {([["views", "By views"], ["engagement", "By engagement"], ["er", "By engagement rate"]] as const).map(([s, label]) => (
              <Link key={s} href={`/dashboard?${filterQuery(f, { sort: s === "views" ? undefined : s, q: cq.q || undefined })}#content`} className={cq.sort === s ? "on" : ""} scroll={false}>{label}</Link>
            ))}
          </div>
          <form action="/dashboard" method="get" className="csearch">
            {f.platform !== "all" && <input type="hidden" name="platform" value={f.platform} />}
            {f.brands.length > 0 && <input type="hidden" name="brands" value={f.brands.join(",")} />}
            <input type="hidden" name="period" value={f.period.key} />
            {cq.sort !== "views" && <input type="hidden" name="sort" value={cq.sort} />}
            <input type="search" name="q" defaultValue={cq.q} placeholder="Keyword, or @username" aria-label="Search content" />
            <button className="btn sm">Search</button>
            {cq.q && <Link className="btn sm ghost" href={contentHref({ q: undefined })}>Clear</Link>}
          </form>
        </div>
        {content.cards.length === 0 ? <div className="empty">No posts match.</div> : (
          <div className="postgrid">{content.cards.map((c) => <PostCard key={c.url} c={c} base={base} names={names} />)}</div>
        )}
        {pages > 1 && (
          <div className="pager">
            {cq.page > 0 ? <Link className="btn sm" href={contentHref({ page: cq.page - 1 })}>Previous</Link> : <span className="btn sm disabled">Previous</span>}
            <span>Page {cq.page + 1} of {int(pages)}</span>
            {cq.page + 1 < pages ? <Link className="btn sm" href={contentHref({ page: cq.page + 1 })}>Next</Link> : <span className="btn sm disabled">Next</span>}
          </div>
        )}
      </div>
    ),
  };
  return (
    <section className="screen dash">
      <div className="topbar">
        <div><h1>Dashboard</h1><span className="meta">{f.period.label} vs {f.prev.label} · data through {dayMonth(d.as_of)} {d.as_of.slice(0, 4)}</span></div>
        <div className="topright">
          <DashFilters platform={f.platform} brands={f.brands} period={f.period.key} months={d.options.months} weeks={d.options.weeks} brandOptions={d.options.brands} platforms={d.options.platforms} />
          <Customise sections={view.layout.all} builder={view.builder} codename={view.codename} client={view.clientName} />
        </div>
      </div>
      <div className="wrap wide">
        {d.caveats.length > 0 && <div className="dcaveats">{d.caveats.map((c) => <p key={c}>{c}</p>)}</div>}

        <div className="kpis">
          {tiles.map((t) => (
            <div className="kpi" data-tone={t.tone} key={t.key}>
              <span className="label">{t.label}</span>
              <b>{t.value}</b>
              <Delta c={k.change[t.key]} prevLabel={prev} points={t.key === "er"} />
              <small>{t.sub}</small>
              <Link className="askwhy" href={askHref({ ...base, k: "kpi", metric: t.key })}>Ask why</Link>
            </div>
          ))}
        </div>

        <Sections arranged={view.layout} render={render} who={view.clientName} showHref={view.showHref} />
      </div>
    </section>
  );
}
