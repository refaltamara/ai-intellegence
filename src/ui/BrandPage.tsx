/**
 * A brand's page under Data (PRD-v2 §14): an inventory of what was collected,
 * not a dashboard. Five sections, each with an "Ask about this" link that opens
 * a chat with a prefilled question. Period, platform and "show all" are links,
 * so the page is fully server-rendered. No KPI hero row on purpose.
 */
import Link from "next/link";
import { growthOf, PERIODS, priorCaptured, type BrandPageData, type Growth, type WeekPoint } from "@/brand/page";
import { fmtNum } from "./format";

const PF: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const weekLabel = (w: string) => `${Number(w.slice(8, 10))} ${MONTHS[Number(w.slice(5, 7)) - 1]}`;
const periodWords: Record<string, string> = { "30d": "last 30 days", "90d": "last 90 days", all: "all loaded data" };

type Query = { period: string; platform?: string; tags?: string; creators?: string; hashtags?: string };

function href(base: string, q: Query, patch: Partial<Query>): string {
  const next = { ...q, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
  return `${base}?${sp.toString()}`;
}

function AskLink({ prompt }: { prompt: string }) {
  return <Link className="askthis" href={`/?q=${encodeURIComponent(prompt)}`}>Ask about this →</Link>;
}

function GrowthCell({ g, what }: { g: Growth; what: "posts" | "views" }) {
  const r = growthOf(g[what], what === "posts" ? g.prev_posts : g.prev_views, g.comparable);
  if (r === "no comparison") return <span className="muted">no comparison</span>;
  if (r === "new") return <span className="up">new</span>;
  const cls = r.delta > 0 ? "up" : r.delta < 0 ? "down" : "muted";
  return <span className={cls}>{r.delta > 0 ? "+" : ""}{fmtNum(r.delta)}{r.pct != null ? ` (${r.pct > 0 ? "+" : ""}${r.pct}%)` : ""}</span>;
}

/** Weekly bars, owned stacked on earned; weeks with no capture at all are hatched, never zero. */
function WeeklyBars({ points }: { points: WeekPoint[] }) {
  const W = 760, H = 180, padL = 36, padR = 8, padT = 12, padB = 26;
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => p.owned + p.earned));
  const nice = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice) * nice;
  const band = (W - padL - padR) / n;
  const barW = Math.min(28, band * 0.62);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="weekly" role="img" aria-label="Posts per week">
      <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-2)" strokeWidth="2" /></pattern></defs>
      {[0, 0.5, 1].map((t) => <g key={t}><line x1={padL} x2={W - padR} y1={y(top * t)} y2={y(top * t)} stroke="var(--line)" /><text x={padL - 6} y={y(top * t) + 3} textAnchor="end" fontSize="10" fill="var(--text-3)">{fmtNum(top * t)}</text></g>)}
      {points.map((p, i) => {
        const cx = padL + band * i + band / 2;
        if (p.gap) return <g key={p.week}><rect x={cx - barW / 2} y={padT} width={barW} height={H - padT - padB} fill="url(#hatch)" opacity=".6"><title>{weekLabel(p.week)}: no posts captured</title></rect></g>;
        const hE = y(0) - y(p.earned), hO = y(0) - y(p.owned);
        return (
          <g key={p.week}>
            <title>{`Week of ${weekLabel(p.week)}: ${p.earned} creator posts, ${p.owned} owned, ${fmtNum(p.views)} views`}</title>
            <rect x={cx - barW / 2} y={y(p.earned)} width={barW} height={hE} fill="var(--blue)" rx="3" />
            {p.owned > 0 && <rect x={cx - barW / 2} y={y(p.earned + p.owned)} width={barW} height={hO} fill="var(--violet)" rx="3" />}
          </g>
        );
      })}
      {points.map((p, i) => (i % 2 === 0 || n <= 8) && <text key={p.week + "l"} x={padL + band * i + band / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-3)">{weekLabel(p.week)}</text>)}
    </svg>
  );
}

export function BrandPage({ d, q }: { d: BrandPageData; q: Query }) {
  const base = `/data/${d.brand.id}`;
  const b = d.brand;
  const period = periodWords[d.period];
  const platforms = d.coverage.map((c) => c.platform);
  const platform = q.platform && platforms.includes(q.platform) ? q.platform : platforms[0];
  const weekPoints = d.weeks.filter((w) => w.platform === platform);
  const showTags = q.tags === "all";
  const creatorRows = q.creators === "all" ? d.creators : d.creators.slice(0, 20);
  const tagRows = (showTags ? d.hashtags : d.hashtags.filter((h) => !h.is_brand)).slice(0, q.hashtags === "all" ? 100 : 15);
  const tagsHidden = d.hashtags.filter((h) => h.is_brand).length;
  const prior = priorCaptured(d);
  const totalTierCreators = d.tiers.reduce((a, t) => a + t.creators, 0);
  const clientName = d.client?.name ?? null;
  const peak = weekPoints.filter((w) => !w.gap).sort((a, c) => c.owned + c.earned - (a.owned + a.earned))[0];

  return (
    <section className="screen brandpage">
      <div className="topbar">
        <div>
          <h1><Link href="/data" className="crumb">Data</Link> / {b.name} {b.is_client && <span className="pill blue">client</span>}{!b.is_client && clientName && <span className="pill">competitor</span>}</h1>
          <span className="meta">
            {b.tiktok_handle && <a href={`https://www.tiktok.com/@${b.tiktok_handle}`} target="_blank" rel="noreferrer">TikTok @{b.tiktok_handle}</a>}
            {b.tiktok_handle && b.instagram_handle && " · "}
            {b.instagram_handle && <a href={`https://www.instagram.com/${b.instagram_handle}`} target="_blank" rel="noreferrer">Instagram @{b.instagram_handle}</a>}
            {b.tracked_since && ` · Tracked since ${b.tracked_since}`}{b.last_load && ` · Last fetched ${b.last_load}`}
          </span>
        </div>
        <div className="seg">{PERIODS.map((p) => <Link key={p.key} href={href(base, q, { period: p.key })} className={d.period === p.key ? "on" : ""}>{p.label}</Link>)}</div>
      </div>
      <div className="wrap wide">
        <p className="intro">What CeMO has collected about {b.name}: every number below is an inventory of the loaded posts, {period} ({d.window.from} to {d.window.to}). Ask about any section to take it into a chat.</p>

        {/* 1. Coverage */}
        <div className="bsec">
          <header><h2>Coverage</h2><AskLink prompt={`What's missing in what you have on ${b.name}?`} /></header>
          <div className="covgrid">
            {d.coverage.map((c) => (
              <div className="cov" key={c.platform}>
                <h3>{PF[c.platform] ?? c.platform}</h3>
                <div className="facts">
                  <div><b>{fmtNum(c.posts)}</b><span>posts</span></div>
                  <div><b>{fmtNum(c.creators)}</b><span>creators</span></div>
                  {c.platform === "tiktok" ? <div><b>{fmtNum(c.earned)} / {fmtNum(c.owned)}</b><span>creator / owned posts</span></div> : <div><b>tagged</b><span>capture, no owned posts</span></div>}
                  <div><b>0</b><span>comments (not loaded)</span></div>
                </div>
                <div className="months">
                  {c.months.map((m) => (
                    <div key={m.month} className={`mo ${m.partial ? "partial" : ""}`} title={`${fmtNum(m.posts)} posts · ${m.days} of ${m.days_in_month} days captured on ${PF[c.platform] ?? c.platform}`}>
                      <b>{monthLabel(m.month)}</b><span>{fmtNum(m.posts)}</span><small>{m.partial ? `partial · ${m.days}/${m.days_in_month} days` : `${m.days}/${m.days_in_month} days`}</small>
                    </div>
                  ))}
                </div>
                <small className="range">{c.first} to {c.last}</small>
              </div>
            ))}
            {d.coverage.length === 0 && <div className="empty">Nothing captured for this brand yet.</div>}
          </div>
        </div>

        {/* 2. Creator tiers */}
        <div className="bsec">
          <header><h2>Creator tiers <span>{period}, creator posts only</span></h2><AskLink prompt={`Which tier is doing the work for ${b.name}: creators, views and carts by tier over the ${period}?`} /></header>
          <div className="tablewrap still">
            <table>
              <thead><tr><th>Tier</th><th className="num">Creators</th><th className="num">Share of creators</th><th className="num">Posts</th><th className="num">Views</th><th className="num">Share of views</th><th className="num">Median views / post</th><th className="num">ER</th><th className="num">Cart share (TikTok)</th></tr></thead>
              <tbody>
                {d.tiers.map((t) => (
                  <tr key={t.tier}>
                    <td><b>{t.label}</b></td>
                    <td className="num">{fmtNum(t.creators)}</td>
                    <td className="num">{t.share_creators_pct != null ? `${t.share_creators_pct}%` : "–"}</td>
                    <td className="num">{fmtNum(t.posts)}</td>
                    <td className="num">{fmtNum(t.views)}</td>
                    {t.too_few ? <td className="num muted" colSpan={4}>{t.creators === 0 ? "none in this period" : "too few to compare"}</td> : (
                      <>
                        <td className="num"><b>{t.share_views_pct != null ? `${t.share_views_pct}%` : "–"}</b></td>
                        <td className="num">{fmtNum(t.median_views)}</td>
                        <td className="num">{t.er_pct != null ? `${t.er_pct}%` : "–"}</td>
                        <td className="num">{t.cart_pct != null ? `${t.cart_pct}%` : "–"}</td>
                      </>
                    )}
                  </tr>
                ))}
                {totalTierCreators === 0 && <tr><td colSpan={9} className="muted">No creator posts in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Posts over time */}
        <div className="bsec">
          <header>
            <h2>Posts over time <span>last 13 weeks</span></h2>
            <div className="right">
              {platforms.length > 1 && <span className="seg sm">{platforms.map((p) => <Link key={p} href={href(base, q, { platform: p })} className={platform === p ? "on" : ""}>{PF[p] ?? p}</Link>)}</span>}
              <AskLink prompt={peak ? `What happened to ${b.name} in the week of ${weekLabel(peak.week)}?` : `How has ${b.name}'s posting changed over the last 13 weeks?`} />
            </div>
          </header>
          <div className="chartbox">
            <WeeklyBars points={weekPoints} />
            <div className="legend"><i style={{ background: "var(--blue)" }} />creator posts<i style={{ background: "var(--violet)" }} />owned posts<i className="hatch" />no posts captured</div>
          </div>
          <div className="growth">
            {d.growth.map((g) => (
              <div key={g.platform}>
                <b>{PF[g.platform] ?? g.platform}</b>
                <span>{fmtNum(g.posts)} posts · <GrowthCell g={g} what="posts" /></span>
                <span>{fmtNum(g.views)} views · <GrowthCell g={g} what="views" /></span>
                <small>{d.prior ? `vs ${d.prior.from} to ${d.prior.to}` : "no prior period for all data"}</small>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Top creators */}
        <div className="bsec">
          <header><h2>Top creators <span>{period}, by views</span></h2><AskLink prompt={b.is_client ? `Who's new for ${b.name} this period, and which competitors have they also posted for?` : `Who's new for ${b.name} this period, and have any of them posted for ${clientName ?? "us"}?`} /></header>
          <div className="tablewrap still">
            <table>
              <thead><tr><th>#</th><th>Creator</th><th>Tier</th><th className="num">Followers</th><th className="num">Posts</th><th className="num">Views</th><th className="num">ER</th><th className="num">Cart share</th><th>Worked for</th>{clientName && <th>For {clientName}</th>}</tr></thead>
              <tbody>
                {creatorRows.map((c, i) => (
                  <tr key={c.creator_id}>
                    <td className="rank">{i + 1}</td>
                    <td><b>{c.sample_url ? <a href={c.sample_url} target="_blank" rel="noreferrer">@{c.handle}</a> : `@${c.handle}`}</b><small className="sub">{PF[c.platform] ?? c.platform}</small></td>
                    <td>{c.tier ?? "–"}</td>
                    <td className="num">{fmtNum(c.followers)}</td>
                    <td className="num">{fmtNum(c.posts)}</td>
                    <td className="num"><b>{fmtNum(c.views)}</b></td>
                    <td className="num">{c.er_pct != null ? `${c.er_pct}%` : "–"}</td>
                    <td className="num">{c.cart_pct != null ? `${c.cart_pct}%` : "–"}</td>
                    <td><div className="used">{c.worked_for.slice(0, 4).map((id) => <span key={id}>{d.names[id] ?? id}</span>)}{c.worked_for.length > 4 && <span>+{c.worked_for.length - 4}</span>}{c.worked_for.length === 0 && <span className="muted">only {b.name}</span>}</div></td>
                    {clientName && <td>{c.for_client ? <span>last {c.for_client}</span> : <span className="never">never</span>}</td>}
                  </tr>
                ))}
                {creatorRows.length === 0 && <tr><td colSpan={10} className="muted">No creator posts in this period.</td></tr>}
              </tbody>
            </table>
            {d.creators.length > 20 && <div className="more"><Link className="btn sm" href={href(base, q, { creators: q.creators === "all" ? "" : "all" })}>{q.creators === "all" ? "Show 20" : `Show all ${d.creators.length}`}</Link><span>Click a creator to open the post with the most views</span></div>}
          </div>
        </div>

        {/* 5. Hashtags */}
        <div className="bsec">
          <header>
            <h2>Hashtags <span>{period}, by views</span></h2>
            <div className="right">
              {tagsHidden > 0 && <Link className="linkish" href={href(base, q, { tags: showTags ? "" : "all" })}>{showTags ? "Hide brand hashtags" : `Include ${tagsHidden} brand hashtag${tagsHidden === 1 ? "" : "s"}`}</Link>}
              <AskLink prompt={b.is_client ? `Which hashtags are competitors riding that ${b.name} isn't?` : `Which hashtags is ${b.name} riding that ${clientName ?? "we"} ${clientName ? "isn't" : "aren't"}?`} />
            </div>
          </header>
          <div className="tablewrap still">
            <table>
              <thead><tr><th>Hashtag</th><th className="num">Posts</th><th className="num">Creators</th><th className="num">Views</th><th className="num">Share of {b.name}&apos;s views</th><th className="num">vs prior period</th></tr></thead>
              <tbody>
                {tagRows.map((h) => {
                  const g = h.posts <= 1 ? null : growthOf(h.posts, h.prev_posts, prior);
                  return (
                    <tr key={h.hashtag}>
                      <td><b>#{h.hashtag}</b>{h.is_brand && <small className="sub">brand hashtag</small>}</td>
                      <td className="num">{fmtNum(h.posts)}</td>
                      <td className="num">{fmtNum(h.creators)}</td>
                      <td className="num"><b>{fmtNum(h.views)}</b></td>
                      <td className="num">{h.share_views_pct != null ? `${h.share_views_pct}%` : "–"}</td>
                      <td className="num">{g == null ? <span className="muted">—</span> : g === "no comparison" ? <span className="muted">no comparison</span> : g === "new" ? <span className="up">new</span> : <span className={g.delta > 0 ? "up" : g.delta < 0 ? "down" : "muted"}>{g.delta > 0 ? "+" : ""}{g.delta} posts{g.pct != null ? ` (${g.pct > 0 ? "+" : ""}${g.pct}%)` : ""}</span>}</td>
                    </tr>
                  );
                })}
                {tagRows.length === 0 && <tr><td colSpan={6} className="muted">{d.hashtags.length ? "Only brand hashtags in this period." : "No hashtags captured in this period."}</td></tr>}
              </tbody>
            </table>
            {d.hashtags.length > 15 && <div className="more"><Link className="btn sm" href={href(base, q, { hashtags: q.hashtags === "all" ? "" : "all" })}>{q.hashtags === "all" ? "Show 15" : "Show up to 100"}</Link><span>Generic reach tags (fyp, viral…) are left out</span></div>}
          </div>
        </div>

        <p className="foot">Sounds, sentiment and comments are not loaded yet. Creator drill-downs live in the conversation: ask about a creator by handle.</p>
      </div>
    </section>
  );
}
