/**
 * The Social Media dashboard (DECISIONS, 3 Oct 2026): a brand's own accounts, standard for
 * every social team. Every figure comes from src/social/dashboard.ts; "Ask CeMO" opens Chats
 * with a question, never numbers.
 */
import { change, compact, dayMonth, int, pct, pts } from "@/competitor/view";
import { BAND_HOURS, BAND_ORDER, type Kpi, type OwnPost, type Quote, type SocialData } from "@/social/dashboard";
import { Sections } from "../dashboard/Sections";
import { Customise } from "../dashboard/Customise";
import { DashTemplates } from "../dashboard/DashTemplates";
import { PanelAsk } from "../dashboard/PanelBuilder";
import type { DashLayout } from "@/dashboard/sections";
import { PrFilters } from "../reputation/PrFilters";
import { PageHeader } from "../kit/PageHeader";
import { Delta as DeltaText, StatRow, StatTile } from "../kit/StatTile";
import { IconChart, IconDocument, IconEye, IconLikeShapes, IconMessages, IconNotification } from "../kit/icons";
import { Empty, Notes, Panel, SectionCard } from "../kit/Section";
import { EMPTY_ROW, SUB, TABLE, TABLE_FRAME, TD, TD_NUM, TH, TH_NUM, THEAD, TR } from "../kit/Table";
import { SERIES, Swatch } from "../kit/chart";
import { cn } from "../cn";
import { AskLink, DASH_PAGE, PlatformTag, Tag, TWO } from "../dashboard/parts";

const PLATFORM: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };
const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ask = (q: string) => `/?q=${encodeURIComponent(q)}`;
const times = (x: number) => (x >= 100 ? `×${int(x)}` : `×${x.toFixed(1)}`);
// posts against engagement: two categorical slots
const FMT = { posts: SERIES[0], eng: SERIES[1] };
// typical engagement in a cell, in five steps of the brand ramp; the number is always written in the cell too
const HEAT = ["bg-brand-palette-50", "bg-brand-palette-100", "bg-brand-palette-200", "bg-brand-palette-300", "bg-brand-palette-400"];
const LINK = "font-semibold text-gray-900 underline-offset-2 hover:text-brand-palette-700 hover:underline";

function Delta({ k, kind, ok, good = "up" }: { k: Kpi; kind: "count" | "pct"; ok: boolean; good?: "up" | "down" }) {
  if (!ok || k.now == null || k.prev == null) return <DeltaText dir="none">Too few posts before to compare</DeltaText>;
  const diff = k.now - k.prev;
  const flat = Math.abs(diff) < 1e-9;
  const dir = flat ? "flat" : (diff > 0) === (good === "up") ? "up" : "down";
  return <DeltaText dir={dir} glyph={flat ? undefined : diff > 0 ? "▲" : "▼"}>{kind === "count" ? change(k.now, k.prev) : pts(k.now, k.prev)} vs before</DeltaText>;
}

function PostLine({ p, extra }: { p: OwnPost; extra?: string }) {
  return (
    <li className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
      <PlatformTag p={p.platform} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 text-sm">
          <a href={p.url} target="_blank" rel="noreferrer" className={LINK}>{p.handle ? `@${p.handle}` : "Own account"}</a>
          <Tag>{p.format}</Tag>
        </span>
        <p className="line-clamp-2 text-sm leading-relaxed text-gray-700" title={p.caption || undefined}>{p.caption || <i className="text-gray-500">No caption</i>}</p>
        <small className="text-xs text-gray-500">{dayMonth(p.posted_at)} · {int(p.engagements)} engagements{p.views != null ? ` · ${compact(p.views)} views` : ""} · {int(p.comments)} comments{p.neg_pct != null ? `, ${pct(p.neg_pct)} negative` : ""}{extra ? ` · ${extra}` : ""}</small>
      </div>
    </li>
  );
}

function Posts({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col divide-y divide-card-border">{children}</ul>;
}

function QuoteLine({ q }: { q: Quote }) {
  return (
    <blockquote className="flex flex-col gap-1.5 rounded-2xl bg-gray-50 px-4 py-3">
      <p className="text-sm leading-relaxed text-gray-800">“{q.text.length > 200 ? q.text.slice(0, 198) + "…" : q.text}”</p>
      {q.translation && q.translation !== q.text && <small className="text-xs italic leading-relaxed text-gray-600">{q.translation.length > 180 ? q.translation.slice(0, 178) + "…" : q.translation}</small>}
      <footer className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500"><PlatformTag p={q.platform} />{q.likes > 0 ? `${int(q.likes)} like${q.likes === 1 ? "" : "s"} · ` : ""}<a href={q.url} target="_blank" rel="noreferrer" className="font-semibold text-gray-700 underline-offset-2 hover:text-brand-palette-700 hover:underline">Open post ↗</a></footer>
    </blockquote>
  );
}

/** each stat tile's icon, by its key */
const TILE_ICON: Record<string, typeof IconDocument> = { posts: IconDocument, eng: IconLikeShapes, med: IconChart, views: IconEye, neg: IconNotification, reply: IconMessages };

export function SocialDashboard({ d, client, view }: { d: SocialData; client: string | null; view: DashLayout }) {
  const f = d.filters;
  const who = d.focus.name;
  const range = `${dayMonth(f.from)} to ${dayMonth(f.to)}`;
  const k = d.kpis;
  const ok = d.comparable;
  const weeks = Math.max(1, f.days / 7);
  const tiles = [
    { key: "posts", label: "Posts", value: int(k.posts.now ?? 0), delta: <Delta k={k.posts} kind="count" ok={ok} />, sub: `${((k.posts.now ?? 0) / weeks).toFixed(1)} a week from own accounts` },
    { key: "eng", label: "Engagement", value: compact(k.engagements.now), delta: <Delta k={k.engagements} kind="count" ok={ok} />, sub: "Likes, comments, shares and saves as each platform counts them" },
    { key: "med", label: "Typical post", value: k.median_eng.now == null ? "–" : int(k.median_eng.now), delta: <Delta k={k.median_eng} kind="count" ok={ok} />, sub: "Median engagement per post" },
    { key: "views", label: "Typical video views", value: compact(k.video_views.now), delta: <Delta k={k.video_views} kind="count" ok={ok} />, sub: "Median, where the platform reports views" },
    { key: "neg", label: "Negative comments", value: pct(k.neg_pct.now), delta: <Delta k={k.neg_pct} kind="pct" ok={ok} good="down" />, sub: `${int(k.comments.now ?? 0)} comments under these posts` },
    { key: "reply", label: "Reply rate", value: pct(k.reply_rate.now), delta: <Delta k={k.reply_rate} kind="pct" ok={ok} />, sub: "Brand replies per comment" },
  ];
  const maxEng = Math.max(1, ...d.timing.map((t) => t.median_eng ?? 0));
  const cell = (dow: number, band: string) => d.timing.find((t) => t.dow === dow && t.band === band);
  const bestCell = [...d.timing].filter((t) => t.median_eng != null).sort((a, b) => (b.median_eng ?? 0) - (a.median_eng ?? 0))[0];
  const render: Record<string, (t: string) => React.ReactNode> = {
    attention: (t) => (
      <SectionCard title={t} hint={<>Posts from the last week doing under half of their account&apos;s usual for their age, or drawing a wave of negative comments.{d.curve.length >= 4 ? ` Own posts here collect about ${pct(d.curve[1].share * 100, 0)} of their first-week likes by day 1 and ${pct(d.curve[3].share * 100, 0)} by day 3, so day one tells.` : ""}</>}>
        {d.watch.length === 0 ? <Empty>Nothing under-performing or drawing a comment storm in the last week.</Empty> : (
          <Posts>{d.watch.map((w) => <PostLine key={w.url} p={w} extra={w.why === "storm" ? "comment storm" : `day ${w.day}, about ${int(w.expected)} expected by now`} />)}</Posts>
        )}
      </SectionCard>
    ),
    accounts: (t) => (
      <SectionCard title={t} hint={<>Each of {who}&apos;s own accounts in {range}.</>}>
        {d.accounts.length === 0 ? <Empty>No own posts in these days.</Empty> : (
          <div className={TABLE_FRAME}>
            <table className={cn(TABLE, "min-w-225")}><thead className={THEAD}><tr><th className={TH}>Account</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>A week</th><th className={TH_NUM}>Typical post</th><th className={TH_NUM}>Typical views</th><th className={TH_NUM}>Eng. rate</th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Negative</th><th className={TH_NUM}>Replies</th></tr></thead>
              <tbody>{d.accounts.map((a) => (
                <tr key={a.platform + a.handle} className={TR}><td className={TD}><span className="flex items-center gap-1.5"><PlatformTag p={a.platform} /><b className="font-semibold text-gray-900">@{a.handle}</b></span></td><td className={TD_NUM}>{int(a.posts)}</td><td className={TD_NUM}>{a.per_week.toFixed(1)}</td><td className={TD_NUM}>{int(a.median_eng)}</td><td className={TD_NUM}>{a.median_views == null ? "–" : compact(a.median_views)}</td><td className={TD_NUM}>{a.er == null ? "–" : pct(a.er, 2)}</td><td className={TD_NUM}>{int(a.comments)}</td><td className={TD_NUM}>{pct(a.neg_pct)}</td><td className={TD_NUM}>{int(a.replies)}</td></tr>))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    ),
    formats: (t) => (
      <SectionCard title={t} hint="Share of posts against share of engagement: a format above the line earns more than its share.">
        {d.formats.length === 0 ? <Empty>No own posts in these days.</Empty> : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-x-4 gap-y-1"><Swatch colour={FMT.posts}>posts</Swatch><Swatch colour={FMT.eng}>engagement</Swatch></div>
            {d.formats.map((x) => (
              <div key={x.format} className="flex flex-col gap-1.5">
                <b className="text-sm font-semibold text-gray-900">{x.format}</b>
                <span aria-hidden="true" className="flex flex-col gap-0.5">
                  <span className="block h-2.5 rounded-r-md" style={{ width: `${Math.max(0.5, x.post_share ?? 0)}%`, background: FMT.posts }} />
                  <span className="block h-2.5 rounded-r-md" style={{ width: `${Math.max(0.5, x.eng_share ?? 0)}%`, background: FMT.eng }} />
                </span>
                <small className="text-xs text-gray-500">{pct(x.post_share, 0)} of posts · {pct(x.eng_share, 0)} of engagement · typical {int(x.median_eng)}{x.median_views != null ? ` · ${compact(x.median_views)} views` : ""}</small>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    ),
    timing: (t) => (
      <SectionCard title={t} hint={<>Typical engagement by day and time (WIB); cells with fewer than three posts are blank.{bestCell ? ` Best: ${DOW[bestCell.dow]} ${bestCell.band.toLowerCase()}.` : ""}</>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-130 border-separate border-spacing-1 text-sm">
            <thead><tr><th className="w-12" />{BAND_ORDER.map((b) => <th key={b} className="px-2 py-1 text-center text-xs font-semibold text-gray-900">{b}<small className="block font-regular text-[11px] text-gray-500">{BAND_HOURS[b]}</small></th>)}</tr></thead>
            <tbody>{[1, 2, 3, 4, 5, 6, 7].map((dow) => (
              <tr key={dow}><th className="pr-2 text-left text-xs font-semibold text-gray-700">{DOW[dow]}</th>{BAND_ORDER.map((b) => {
                const c = cell(dow, b);
                const v = c?.median_eng ?? null;
                const step = v != null ? HEAT[Math.min(HEAT.length - 1, Math.floor((v / maxEng) * HEAT.length))] : null;
                return <td key={b} title={c ? `${int(c.posts)} posts${v != null ? `, typical ${int(v)}` : ""}` : "no posts"} className={cn("h-10 rounded-lg text-center tabular-nums", step ?? "bg-gray-50", v != null ? "font-semibold text-gray-900" : "text-gray-500", bestCell && c === bestCell && "outline-2 -outline-offset-2 outline-brand-palette-700")}>{v != null ? compact(v) : c ? <small className="text-[11px]">{c.posts}</small> : ""}</td>;
              })}</tr>))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    ),
    best: (t) => (
      <SectionCard title={t} hint={<>Against their own account&apos;s typical post in {range}.</>}>
        {d.best.length === 0 ? <Empty>No account has enough measured posts to compare.</Empty> : <Posts>{d.best.map((p) => <PostLine key={p.url} p={p} extra={p.index != null ? `${times(p.index)} the account's usual` : undefined} />)}</Posts>}
      </SectionCard>
    ),
    weakest: (t) => (
      <SectionCard title={t} hint="The ones to learn from, against the same account's usual.">
        {d.weakest.length === 0 ? <Empty>No account has enough measured posts to compare.</Empty> : <Posts>{d.weakest.map((p) => <PostLine key={p.url} p={p} extra={p.index != null ? `${times(p.index)} the account's usual` : undefined} />)}</Posts>}
      </SectionCard>
    ),
    competitors: (t) => (
      <SectionCard title={t} hint={<>Every brand&apos;s own accounts on the same measures, {range}.</>}>
        <div className={TABLE_FRAME}>
          <table className={cn(TABLE, "min-w-245")}><thead className={THEAD}><tr><th className={TH}>Brand</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>A week</th><th className={TH_NUM}>Typical post</th><th className={TH_NUM}>Typical views</th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Negative</th><th className={TH}>Best post</th></tr></thead>
            <tbody>{d.competitors.length === 0 ? <tr><td colSpan={8} className={EMPTY_ROW}>No brand has own posts in these days.</td></tr> : d.competitors.map((c) => (
              <tr key={c.id} className={cn(TR, c.is_focus && "bg-brand-palette-50/60")}><td className={TD}><b className="font-semibold text-gray-900">{c.name}</b>{c.is_focus && <span className="ml-1.5"><Tag tone="brand">you</Tag></span>}</td><td className={TD_NUM}>{int(c.posts)}</td><td className={TD_NUM}>{c.per_week.toFixed(1)}</td><td className={TD_NUM}>{int(c.median_eng)}</td><td className={TD_NUM}>{c.median_views == null ? "–" : compact(c.median_views)}</td><td className={TD_NUM}>{int(c.comments)}</td><td className={TD_NUM}>{pct(c.neg_pct)}</td>
                <td className={cn(TD, "max-w-80")}>{c.top ? <a href={c.top.url} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 text-gray-700 hover:text-brand-palette-700"><PlatformTag p={c.top.platform} /><span className="line-clamp-2"><b className="font-semibold tabular-nums text-gray-900">{int(c.top.engagements)}</b> · {c.top.caption.slice(0, 70)}{c.top.caption.length > 70 ? "…" : ""}</span></a> : <span className="text-gray-500">–</span>}</td></tr>))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    ),
    community: (t) => (
      <SectionCard title={t} hint={<>What people say under {who}&apos;s own posts in {range}: topics, how they lean, and who wants to buy.</>}
        actions={<AskLink href={ask(`Draft replies to the most-liked comments under ${who}'s own posts between ${dayMonth(f.from)} and ${dayMonth(f.to)}.`)}>Draft replies</AskLink>}>
        <div className={TWO}>
          <div className={TABLE_FRAME}>
            <table className={cn(TABLE, "min-w-130")}><thead className={THEAD}><tr><th className={TH}>Topic</th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Share</th><th className={TH_NUM}>Negative</th><th className={TH_NUM}>Purchase intent</th></tr></thead>
              <tbody>{d.topics.length === 0 ? <tr><td colSpan={5} className={EMPTY_ROW}>No comments with a topic in these days.</td></tr> : d.topics.map((t) => <tr key={t.topic} className={TR}><td className={TD}>{t.topic}</td><td className={TD_NUM}>{int(t.comments)}</td><td className={TD_NUM}>{pct(t.share)}</td><td className={TD_NUM}>{pct(t.neg_pct)}</td><td className={TD_NUM}>{pct(t.intent_pct)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Panel title="Liked most, positive">{d.quotes.positive.length ? d.quotes.positive.map((q, i) => <QuoteLine key={i} q={q} />) : <p className="text-sm text-gray-500">No positive comments in these days.</p>}</Panel>
            <Panel title="Liked most, negative">{d.quotes.negative.length ? d.quotes.negative.map((q, i) => <QuoteLine key={i} q={q} />) : <p className="text-sm text-gray-500">No negative comments in these days.</p>}</Panel>
          </div>
        </div>
      </SectionCard>
    ),
    health: (t) => (
      <SectionCard title={t} hint="Own-account capture per brand and platform. A day with far more posts than an account publishes is flagged above."
        actions={<AskLink href={ask(`What worked on ${who}'s own accounts between ${dayMonth(f.from)} and ${dayMonth(f.to)}, and what should we post next week?`)}>Ask CeMO what to post next</AskLink>}>
        <div className={TABLE_FRAME}>
          <table className={cn(TABLE, "min-w-205")}><thead className={THEAD}><tr><th className={TH}>Brand</th><th className={TH}>Platform</th><th className={TH}>Accounts</th><th className={TH_NUM}>Own posts</th><th className={TH}>Captured</th><th className={TH_NUM}>Busiest day</th></tr></thead>
            <tbody>{d.capture.map((c) => (
              <tr key={c.brand + c.platform} className={cn(TR, c.brand === who && "bg-brand-palette-50/60")}><td className={TD}>{c.brand}</td><td className={TD}><span className="flex items-center gap-1.5"><PlatformTag p={c.platform} />{PLATFORM[c.platform] ?? c.platform}</span></td><td className={TD}>{c.handles.map((h) => `@${h}`).join(", ")}</td><td className={TD_NUM}>{int(c.posts)}</td><td className={cn(TD, "whitespace-nowrap")}>{dayMonth(c.first)} to {dayMonth(c.last)}</td><td className={cn(TD_NUM, c.busiest >= 20 && "font-semibold text-red-700")}>{int(c.busiest)}{c.busiest_day ? ` · ${dayMonth(c.busiest_day)}` : ""}{c.busiest >= 20 && <small className={SUB}>more than an account publishes</small>}</td></tr>))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    ),
  };
  return (
    <section data-tw className={DASH_PAGE}>
      <PageHeader title="Dashboard" subtitle={<>{who}&apos;s own accounts · {range} vs the {f.days} days before · data through {dayMonth(d.as_of)} {d.as_of.slice(0, 4)}</>}
        actions={<>{view.builder && <Customise sections={view.layout.all} builder codename={view.codename} client={view.clientName} />}<DashTemplates builder={view.builder} codename={view.codename} /></>} />
      <PrFilters brand={f.brand} days={f.days} platform={f.platform} brands={d.brands} platforms={d.platforms} client={client} windows={[7, 30, 90]} def={30} />
      <Notes lines={d.notes} />

      <StatRow n={6}>
        {tiles.map((t) => <StatTile key={t.key} icon={TILE_ICON[t.key]} label={t.label} value={t.value} delta={t.delta} sub={t.sub} />)}
      </StatRow>

      {view.builder && view.scope && <PanelAsk scope={view.scope} />}
      <Sections arranged={view.layout} render={render} who={view.clientName} showHref={view.showHref} panels={view.panels} builder={view.builder} scope={view.scope} />
    </section>
  );
}
