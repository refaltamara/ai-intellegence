/**
 * A brand's page under Data (PRD-v2 §14): an inventory of what was collected,
 * not a dashboard. Five sections, each with an "Ask about this" link that opens
 * a chat with a prefilled question. Period, platform and "show all" are links,
 * so the page is fully server-rendered. No KPI hero row on purpose.
 */
import Link from "next/link";
import { growthOf, PERIODS, priorCaptured, type BrandPageData, type Growth, type WeekPoint } from "@/brand/page";
import { cn } from "./cn";
import { AskLink, Facts, SegLinks, Tag } from "./dashboard/parts";
import { buttonClass } from "./kit/Button";
import { AXIS, GRID, SERIES, Swatch } from "./kit/chart";
import { PageHeader } from "./kit/PageHeader";
import { Empty, Panel, SectionCard } from "./kit/Section";
import { StatusPill } from "./kit/StatusPill";
import { EMPTY_ROW, SUB, TD, TD_NUM, TH, TH_NUM, TR, Table } from "./kit/Table";
import { fmtNum } from "./format";

const PF: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const weekLabel = (w: string) => `${Number(w.slice(8, 10))} ${MONTHS[Number(w.slice(5, 7)) - 1]}`;
const periodWords: Record<string, string> = { "30d": "last 30 days", "90d": "last 90 days", all: "all loaded data" };
// identity, not rank: creator posts and owned posts are two series, so they take the categorical palette in order
const EARNED = SERIES[0];
const OWNED = SERIES[1];
const MOVE = { up: "text-green-700", down: "text-red-700", flat: "text-gray-500" } as const;
const LINK = "underline-offset-2 hover:text-brand-palette-700 hover:underline";

type Query = { period: string; platform?: string; tags?: string; creators?: string; hashtags?: string };

function href(base: string, q: Query, patch: Partial<Query>): string {
  const next = { ...q, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
  return `${base}?${sp.toString()}`;
}

function Ask({ prompt, what }: { prompt: string; what: string }) {
  return <AskLink href={`/?q=${encodeURIComponent(prompt)}`} label={`Ask about ${what}`}>Ask about this</AskLink>;
}

/** a change against the prior period, written with its sign; the colour only repeats what the sign says */
function Move({ r, unit = "" }: { r: ReturnType<typeof growthOf>; unit?: string }) {
  if (r === "no comparison") return <span className="text-gray-500">no comparison</span>;
  if (r === "new") return <span className={MOVE.up}>new</span>;
  const dir = r.delta > 0 ? "up" : r.delta < 0 ? "down" : "flat";
  return <span className={MOVE[dir]}>{r.delta > 0 ? "+" : ""}{fmtNum(r.delta)}{unit}{r.pct != null ? ` (${r.pct > 0 ? "+" : ""}${r.pct}%)` : ""}</span>;
}

function GrowthCell({ g, what }: { g: Growth; what: "posts" | "views" }) {
  return <Move r={growthOf(g[what], what === "posts" ? g.prev_posts : g.prev_views, g.comparable)} />;
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
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Posts per week">
      <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-gray-300)" strokeWidth="2" /></pattern></defs>
      {[0, 0.5, 1].map((t) => <g key={t}><line x1={padL} x2={W - padR} y1={y(top * t)} y2={y(top * t)} stroke={GRID} strokeDasharray={t === 0 ? undefined : "3 3"} /><text x={padL - 6} y={y(top * t) + 3} textAnchor="end" fontSize="10" fill={AXIS}>{fmtNum(top * t)}</text></g>)}
      {points.map((p, i) => {
        const cx = padL + band * i + band / 2;
        if (p.gap) return <g key={p.week}><rect x={cx - barW / 2} y={padT} width={barW} height={H - padT - padB} fill="url(#hatch)" rx="3"><title>{weekLabel(p.week)}: no posts captured</title></rect></g>;
        const hE = y(0) - y(p.earned), hO = y(0) - y(p.owned);
        return (
          <g key={p.week}>
            <title>{`Week of ${weekLabel(p.week)}: ${p.earned} creator posts, ${p.owned} owned, ${fmtNum(p.views)} views at day 7`}</title>
            <rect x={cx - barW / 2} y={y(p.earned)} width={barW} height={hE} fill={EARNED} rx="3" />
            {/* a 2px white gap between the stacked parts */}
            {p.owned > 0 && <rect x={cx - barW / 2} y={y(p.earned + p.owned)} width={barW} height={Math.max(0, hO - 2)} fill={OWNED} rx="3" />}
          </g>
        );
      })}
      {points.map((p, i) => (i % 2 === 0 || n <= 8) && <text key={p.week + "l"} x={padL + band * i + band / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={AXIS}>{weekLabel(p.week)}</text>)}
    </svg>
  );
}

export function BrandPage({ d, q, productName = "CeMO" }: { d: BrandPageData; q: Query; productName?: string }) {
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
  const meta = [
    b.tiktok_handle && <a key="tt" className={LINK} href={`https://www.tiktok.com/@${b.tiktok_handle}`} target="_blank" rel="noreferrer">TikTok @{b.tiktok_handle}</a>,
    b.instagram_handle && <a key="ig" className={LINK} href={`https://www.instagram.com/${b.instagram_handle}`} target="_blank" rel="noreferrer">Instagram @{b.instagram_handle}</a>,
    b.tracked_since && `Tracked since ${b.tracked_since}`,
    b.last_load && `Last fetched ${b.last_load}`,
  ].filter(Boolean);

  return (
    <section data-tw className="flex min-h-full flex-col gap-6 px-4 pb-10 md:px-6">
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{b.name}{b.is_client ? <StatusPill tone="brand">Client</StatusPill> : clientName ? <StatusPill tone="neutral">Competitor</StatusPill> : null}</span>}
        subtitle={<><Link href="/data" className={cn(LINK, "font-semibold")}>Data</Link>{meta.map((m, i) => <span key={i}> · {m}</span>)}</>}
        actions={<SegLinks label="Period" items={PERIODS.map((p) => ({ href: href(base, q, { period: p.key }), label: p.label, on: d.period === p.key }))} />} />

      <p className="text-sm leading-relaxed text-gray-600">What {productName} has collected about {b.name}: every number below is an inventory of the loaded posts, {period} ({d.window.from} to {d.window.to}). Ask about any section to take it into a chat.</p>

      <SectionCard title="Coverage" hint="What was captured on each platform, month by month." actions={<Ask what="coverage" prompt={`What's missing in what you have on ${b.name}?`} />}>
        {d.coverage.length === 0 ? <Empty>Nothing captured for this brand yet.</Empty> : (
          <div className="grid gap-3 xl:grid-cols-2">
            {d.coverage.map((c) => (
              <Panel key={c.platform} title={PF[c.platform] ?? c.platform}>
                <Facts cols={3} items={[
                  { k: "Posts", v: fmtNum(c.posts) },
                  { k: "Creators", v: fmtNum(c.creators) },
                  c.platform === "tiktok" ? { k: "Creator / owned posts", v: `${fmtNum(c.earned)} / ${fmtNum(c.owned)}` } : { k: "Capture", v: "Tagged, no owned posts" },
                ]} />
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {c.months.map((m) => (
                    <li key={m.month} title={`${fmtNum(m.posts)} posts · ${m.days} of ${m.days_in_month} days captured on ${PF[c.platform] ?? c.platform}`}
                      className={cn("flex min-w-24 flex-col rounded-xl border px-3 py-2", m.partial ? "border-amber-200 bg-amber-50 text-amber-800" : "border-card-border bg-white text-gray-700")}>
                      <b className="text-xs font-semibold">{monthLabel(m.month)}</b>
                      <span className="text-sm font-semibold tabular-nums text-gray-900">{fmtNum(m.posts)}</span>
                      <small className="text-[11px]">{m.partial ? `partial · ${m.days}/${m.days_in_month} days` : `${m.days}/${m.days_in_month} days`}</small>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-500">{c.first} to {c.last} · comments not loaded</p>
              </Panel>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Creator tiers" hint={`${period}, creator posts only`} actions={<Ask what="creator tiers" prompt={`Which tier is doing the work for ${b.name}: creators, views and carts by tier over the ${period}?`} />}>
        <Table min="min-w-[960px]" head={<><th className={TH}>Tier</th><th className={TH_NUM}>Creators</th><th className={TH_NUM}>Share of creators</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Views (day 7)</th><th className={TH_NUM}>Share of views</th><th className={TH_NUM}>Median views / post</th><th className={TH_NUM}>ER</th><th className={TH_NUM}>Cart share (TikTok)</th></>}>
          {d.tiers.map((t) => (
            <tr key={t.tier} className={TR}>
              <td className={TD}><b className="font-semibold text-gray-900">{t.label}</b></td>
              <td className={TD_NUM}>{fmtNum(t.creators)}</td>
              <td className={TD_NUM}>{t.share_creators_pct != null ? `${t.share_creators_pct}%` : "–"}</td>
              <td className={TD_NUM}>{fmtNum(t.posts)}</td>
              <td className={TD_NUM}>{fmtNum(t.views)}</td>
              {t.too_few ? <td className={cn(TD_NUM, "text-gray-500")} colSpan={4}>{t.creators === 0 ? "none in this period" : "too few to compare"}</td> : (
                <>
                  <td className={cn(TD_NUM, "font-semibold text-gray-900")}>{t.share_views_pct != null ? `${t.share_views_pct}%` : "–"}</td>
                  <td className={TD_NUM}>{fmtNum(t.median_views)}</td>
                  <td className={TD_NUM}>{t.er_pct != null ? `${t.er_pct}%` : "–"}</td>
                  <td className={TD_NUM}>{t.cart_pct != null ? `${t.cart_pct}%` : "–"}</td>
                </>
              )}
            </tr>
          ))}
          {totalTierCreators === 0 && <tr><td colSpan={9} className={EMPTY_ROW}>No creator posts in this period. Try 90 days or All data.</td></tr>}
        </Table>
      </SectionCard>

      <SectionCard title="Posts over time" hint="last 13 weeks"
        actions={<>
          {platforms.length > 1 && <SegLinks label="Platform" items={platforms.map((p) => ({ href: href(base, q, { platform: p }), label: PF[p] ?? p, on: platform === p }))} />}
          <Ask what="posts over time" prompt={peak ? `What happened to ${b.name} in the week of ${weekLabel(peak.week)}?` : `How has ${b.name}'s posting changed over the last 13 weeks?`} />
        </>}>
        {weekPoints.length === 0 ? <Empty>No posts captured on this platform in the last 13 weeks.</Empty> : (
          <div className="flex flex-col gap-3">
            <WeeklyBars points={weekPoints} />
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Swatch colour={EARNED}>Creator posts</Swatch>
              <Swatch colour={OWNED}>Owned posts</Swatch>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-700"><svg aria-hidden="true" width="10" height="10" className="block shrink-0 rounded-sm"><rect width="10" height="10" fill="url(#hatch)" /></svg>No posts captured</span>
            </div>
            <details className="group">
              <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs font-semibold text-brand-palette-700 max-md:min-h-11">Table view</summary>
              <Table className="mt-2" min="min-w-[480px]" head={<><th className={TH}>Week of</th><th className={TH_NUM}>Creator posts</th><th className={TH_NUM}>Owned posts</th><th className={TH_NUM}>Views (day 7)</th></>}>
                {weekPoints.map((p) => (
                  <tr key={p.week} className={TR}>
                    <td className={TD}>{weekLabel(p.week)}</td>
                    {p.gap ? <td className={cn(TD_NUM, "text-gray-500")} colSpan={3}>no posts captured</td> : <><td className={TD_NUM}>{fmtNum(p.earned)}</td><td className={TD_NUM}>{fmtNum(p.owned)}</td><td className={TD_NUM}>{fmtNum(p.views)}</td></>}
                  </tr>
                ))}
              </Table>
            </details>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {d.growth.map((g) => (
            <div key={g.platform} className="flex flex-col gap-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <b className="font-semibold text-gray-900">{PF[g.platform] ?? g.platform}</b>
              <span className="tabular-nums">{fmtNum(g.posts)} posts · <GrowthCell g={g} what="posts" /></span>
              <span className="tabular-nums">{fmtNum(g.views)} views at day 7 · <GrowthCell g={g} what="views" /></span>
              <small className="text-xs text-gray-500">{d.prior ? `vs ${d.prior.from} to ${d.prior.to}` : "no prior period for all data"}</small>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Top creators" hint={`${period}, by views at day 7. A handle opens the post with the most views.`} actions={<Ask what="top creators" prompt={b.is_client ? `Who's new for ${b.name} this period, and which competitors have they also posted for?` : `Who's new for ${b.name} this period, and have any of them posted for ${clientName ?? "us"}?`} />}>
        <Table min="min-w-[1040px]" head={<><th className={TH_NUM}>#</th><th className={TH}>Creator</th><th className={TH}>Tier</th><th className={TH_NUM}>Followers</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Views (day 7)</th><th className={TH_NUM}>ER</th><th className={TH_NUM}>Cart share</th><th className={TH}>Worked for</th>{clientName && <th className={TH}>For {clientName}</th>}</>}>
          {creatorRows.map((c, i) => (
            <tr key={c.creator_id} className={TR}>
              <td className={cn(TD_NUM, "text-gray-500")}>{i + 1}</td>
              <td className={TD}>
                <b className="font-semibold text-gray-900">{c.sample_url ? <a className={LINK} href={c.sample_url} target="_blank" rel="noreferrer">@{c.handle}</a> : `@${c.handle}`}</b>
                <span className={SUB}>{PF[c.platform] ?? c.platform}</span>
              </td>
              <td className={TD}>{c.tier ?? "–"}</td>
              <td className={TD_NUM}>{fmtNum(c.followers)}</td>
              <td className={TD_NUM}>{fmtNum(c.posts)}</td>
              <td className={cn(TD_NUM, "font-semibold text-gray-900")}>{fmtNum(c.views)}</td>
              <td className={TD_NUM}>{c.er_pct != null ? `${c.er_pct}%` : "–"}</td>
              <td className={TD_NUM}>{c.cart_pct != null ? `${c.cart_pct}%` : "–"}</td>
              <td className={TD}>
                <span className="flex flex-wrap gap-1">
                  {c.worked_for.slice(0, 4).map((id) => <Tag key={id}>{d.names[id] ?? id}</Tag>)}
                  {c.worked_for.length > 4 && <Tag>+{c.worked_for.length - 4}</Tag>}
                  {c.worked_for.length === 0 && <span className="text-gray-500">only {b.name}</span>}
                </span>
              </td>
              {clientName && <td className={cn(TD, "whitespace-nowrap")}>{c.for_client ? `last ${c.for_client}` : <span className="text-gray-500">never</span>}</td>}
            </tr>
          ))}
          {creatorRows.length === 0 && <tr><td colSpan={10} className={EMPTY_ROW}>No creator posts in this period. Try 90 days or All data.</td></tr>}
        </Table>
        {d.creators.length > 20 && (
          <div className="flex flex-wrap items-center gap-3">
            <Link className={buttonClass("outline", "sm")} scroll={false} href={href(base, q, { creators: q.creators === "all" ? "" : "all" })}>{q.creators === "all" ? "Show 20" : `Show all ${d.creators.length}`}</Link>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Hashtags" hint={`${period}, by views at day 7. Generic reach tags (fyp, viral…) are left out.`}
        actions={<>
          {tagsHidden > 0 && <Link scroll={false} className="inline-flex min-h-8 items-center text-xs font-semibold text-brand-palette-700 underline-offset-2 hover:underline max-md:min-h-11" href={href(base, q, { tags: showTags ? "" : "all" })}>{showTags ? "Hide brand hashtags" : `Include ${tagsHidden} brand hashtag${tagsHidden === 1 ? "" : "s"}`}</Link>}
          <Ask what="hashtags" prompt={b.is_client ? `Which hashtags are competitors riding that ${b.name} isn't?` : `Which hashtags is ${b.name} riding that ${clientName ?? "we"} ${clientName ? "isn't" : "aren't"}?`} />
        </>}>
        <Table min="min-w-[760px]" head={<><th className={TH}>Hashtag</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Creators</th><th className={TH_NUM}>Views (day 7)</th><th className={TH_NUM}>Share of {b.name}&apos;s views</th><th className={TH_NUM}>vs prior period</th></>}>
          {tagRows.map((h) => {
            const g = h.posts <= 1 ? null : growthOf(h.posts, h.prev_posts, prior);
            return (
              <tr key={h.hashtag} className={TR}>
                <td className={TD}><b className="font-semibold text-gray-900">#{h.hashtag}</b>{h.is_brand && <span className={SUB}>brand hashtag</span>}</td>
                <td className={TD_NUM}>{fmtNum(h.posts)}</td>
                <td className={TD_NUM}>{fmtNum(h.creators)}</td>
                <td className={cn(TD_NUM, "font-semibold text-gray-900")}>{fmtNum(h.views)}</td>
                <td className={TD_NUM}>{h.share_views_pct != null ? `${h.share_views_pct}%` : "–"}</td>
                <td className={TD_NUM}>{g == null ? <span className="text-gray-500">–</span> : <Move r={g} unit=" posts" />}</td>
              </tr>
            );
          })}
          {tagRows.length === 0 && <tr><td colSpan={6} className={EMPTY_ROW}>{d.hashtags.length ? "Only brand hashtags in this period." : "No hashtags captured in this period."}</td></tr>}
        </Table>
        {d.hashtags.length > 15 && (
          <div className="flex flex-wrap items-center gap-3">
            <Link className={buttonClass("outline", "sm")} scroll={false} href={href(base, q, { hashtags: q.hashtags === "all" ? "" : "all" })}>{q.hashtags === "all" ? "Show 15" : "Show up to 100"}</Link>
          </div>
        )}
      </SectionCard>

      <p className="text-xs text-gray-500">Sounds, sentiment and comments are not loaded yet. Creator drill-downs live in the conversation: ask about a creator by handle.</p>
    </section>
  );
}
