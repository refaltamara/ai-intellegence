/**
 * The PR dashboard (DECISIONS, 3 Oct 2026): the reputation view every PR team needs,
 * whatever the company. Status first (Calm → Watch → Issue → Crisis → Recovering),
 * then the issues building and whether they are about us or the whole category, what
 * is rising, the narratives, the amplifiers, our own channels and the customer-service
 * list, the competitive view, and data health. Every figure comes from
 * src/reputation/dashboard.ts; "Ask CeMO" opens Chats with a question, never numbers, and the ask box at the top carries
 * only the dashboard's brand, window and platform (src/reputation/ask.ts reads the figures again).
 */
import Link from "next/link";
import { change, compact, dayMonth, int, pct, pts } from "@/competitor/view";
import type { Issue, Kpi, PrDashboardData, Split } from "@/reputation/dashboard";
import { PrFilters } from "./PrFilters";
import { LadderDrawer } from "./LadderDrawer";
import { Sections } from "../dashboard/Sections";
import { Customise } from "../dashboard/Customise";
import { DashTemplates } from "../dashboard/DashTemplates";
import { PanelAsk } from "../dashboard/PanelBuilder";
import type { DashLayout } from "@/dashboard/sections";
import { repAskHref } from "@/dashboard/askref";
import { PulseTrends } from "../pulse/PulseTrends";
import { DashAsk } from "./DashAsk";
import { PageHeader } from "../kit/PageHeader";
import { buttonClass } from "../kit/Button";
import { Delta as DeltaText, StatRow, StatTile } from "../kit/StatTile";
import { CARD, Empty, Notes, SectionCard } from "../kit/Section";
import { StatusPill } from "../kit/StatusPill";
import { cn } from "../cn";
import { AskLink, DASH_PAGE, OutLink, PlatformTag, Tag, TWO } from "../dashboard/parts";
import { ask, H4, ITEM_CARD, LadderStrip, LEVEL, LEVEL_ORDER, LeanBar, MiniBars, MiniTable, MUTED, NEG, PLATFORM, POS, PostLine, PostList, QuoteLine, sharePct, TD, TD_NUM, TH, TH_NUM, TR, VoiceDot } from "./parts/common";
import { DailyTable, PlatformCard, SplitTable, WatchCard } from "./parts/cards";

export { DailyTable, WatchCard };

const SCOPE: Record<Issue["scope"], { label: string; tone: "down" | "neutral" | "brand" }> = {
  only_us: { label: "Only us", tone: "down" },
  category: { label: "Whole category", tone: "neutral" },
  mixed: { label: "Us and some others", tone: "brand" },
};
const STAGE: Record<Issue["stage"], string> = { building: "Building", peaking: "Peaking", fading: "Fading", steady: "Steady" };

/** dir says good or bad (a rise in negative talk is bad); the glyph says which way the number went */
function Delta({ k, kind, good = "up" }: { k: Kpi; kind: "count" | "pct" | "score"; good?: "up" | "down" }) {
  if (k.now == null || k.prev == null) return <DeltaText dir="none">No earlier window to compare</DeltaText>;
  const diff = k.now - k.prev;
  const flat = Math.abs(diff) < 1e-9;
  const dir = flat ? "flat" : (diff > 0) === (good === "up") ? "up" : "down";
  const text = kind === "count" ? change(k.now, k.prev) : kind === "pct" ? pts(k.now, k.prev) : `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)}`;
  return <DeltaText dir={dir} glyph={flat ? undefined : diff > 0 ? "▲" : "▼"}>{text} vs previous</DeltaText>;
}

export function PrDashboard({ d, client, view, hide = [] }: { d: PrDashboardData; client: string | null; view: DashLayout; hide?: string[] }) {
  const layout = view.layout;
  const hiddenFor = view.clientName;
  const showHref = view.showHref;
  const f = d.filters;
  const who = d.focus.name;
  const range = `${dayMonth(f.from)} to ${dayMonth(f.to)}`;
  const st = d.status;
  const L = LEVEL[st.level];
  const k = d.kpis;
  const scopeWord = f.platform === "all" ? "" : ` on ${PLATFORM[f.platform] ?? f.platform}`;
  // around one subject the labelled posts are counted with the comments (src/reputation/dashboard.ts, VOICES)
  const withPosts = d.voice_posts > 0;
  // a topic's voices, where the labeller reads them (a case such as Kahf: Malaysian, Indonesian)
  const withVoices = d.narratives.some((x) => x.voices.some((v) => v.voice !== "unclear"));
  const said = withPosts ? "posts and comments" : "comments";
  const noNorm = st.baseline.neg_pct == null && !!st.day && st.level === "calm";
  const cv = d.conversation;
  const P = cv.now.posts, Cm = cv.now.comments;
  // comments in the same threads about something else: left out of every number, said once beside them
  const other = d.other_comments.now;
  const shareK = (x: Split, k: "negative" | "positive"): number | null => sharePct(x[k], x.labelled);
  // tracking began inside or after the earlier window (settings.pr.since): there is nothing to compare with, and it is said so
  const noPrev = !!d.tracked_since && f.prev_to < d.tracked_since;
  const since = noPrev ? <DeltaText dir="none">Tracked since {dayMonth(d.tracked_since!)}</DeltaText> : null;
  // around one subject: the posts and the comments each get their own tiles, so it is clear which is which
  const caseTiles: typeof tilesBase = [
    { key: "mentions", label: "Posts about " + who, value: int(k.mentions.now ?? 0), delta: since ?? <Delta k={k.mentions} kind="count" />, sub: `${int(P.labelled)} by other accounts carry a stance` },
    { key: "against", label: "Posts against", value: pct(shareK(P, "negative")), delta: since ?? <Delta k={{ now: shareK(P, "negative"), prev: shareK(cv.prev.posts, "negative") }} kind="pct" good="down" />, sub: `${int(P.negative)} posts; ${int(P.positive)} defending ${who}` },
    { key: "comments", label: "Comments", value: int(Cm.n), delta: since ?? <Delta k={{ now: Cm.n, prev: cv.prev.comments.n }} kind="count" />, sub: [Cm.n > Cm.labelled ? `${int(Cm.n - Cm.labelled)} not read yet` : null, other ? `${int(other)} more in these threads are about something else` : d.per_comment ? null : "under those posts; off-topic left out"].filter(Boolean).join(" · ") || `about ${who}` },
    { key: "neg", label: "Comments negative", value: pct(shareK(Cm, "negative")), delta: since ?? <Delta k={{ now: shareK(Cm, "negative"), prev: shareK(cv.prev.comments, "negative") }} kind="pct" good="down" />, sub: `${int(Cm.negative)} comments; ${int(Cm.positive)} defending ${who}` },
  ];
  const tilesBase: { key: string; label: string; value: string; delta: React.ReactNode; sub: string }[] = [
    { key: "mentions", label: "Mentions", value: int(k.mentions.now ?? 0), delta: <Delta k={k.mentions} kind="count" />, sub: `Posts about ${who}` },
    { key: "reach", label: "Reach", value: k.reach.now == null ? "–" : compact(k.reach.now), delta: k.reach.now == null ? <DeltaText dir="none">Not reported</DeltaText> : <Delta k={k.reach} kind="count" />, sub: k.reach.now == null ? "These platforms report no views" : "Views of those posts" },
    { key: "comments", label: withPosts ? "Posts and comments" : "Comments", value: int(k.comments.now ?? 0), delta: <Delta k={k.comments} kind="count" />, sub: withPosts ? `${int(d.voice_posts)} posts with a stance, and the comments under them; ${who}'s own replies left out` : "Under those posts; brand replies left out" },
    { key: "neg", label: "Negative", value: pct(k.neg_pct.now), delta: <Delta k={k.neg_pct} kind="pct" good="down" />, sub: `Share of labelled ${said}` },
    { key: "intent", label: "Purchase intent", value: pct(k.intent_pct.now), delta: <Delta k={k.intent_pct} kind="pct" />, sub: "Comments that want to buy or sign up" },
  ];
  const extra = tilesBase.filter((t) => ["reach", "intent"].includes(t.key));
  // a case workspace leaves out what does not apply (settings.pr.hide: status, reach, intent)
  const tiles = (withPosts ? [...caseTiles, ...extra] : tilesBase).filter((t) => !hide.includes(t.key));
  const showStatus = !hide.includes("status");
  const ampViews = d.amplifiers.some((a) => a.views > 0);
  // a section with nothing it could measure here stays out: service needs comment themes, the competitive view a second brand
  const unmeasured = new Set([...(d.service.measured ? [] : ["service"]), ...(d.brands.length > 1 ? [] : ["competitive"]), ...(d.conversation.by_voice.length ? [] : ["voices"]),
    // around one subject only (a case workspace): the platforms side by side when there are two or more, the tags when a few comments carry one
    ...((d.by_platform?.length ?? 0) > 1 ? [] : ["platforms"]), ...((d.tagged?.tagging ?? 0) >= 3 ? [] : ["tagged"]),
    // the Pulse's comments per hour, around one subject only
    ...(d.pace?.points.some((p) => p.comments > 0) ? [] : ["pace"]),
    // around one subject only: the posts the team watches (settings.pr.watch), and the days up to the newest data
    ...(d.watched?.length ? [] : ["watch"]), ...(d.daily?.rows.length ? [] : ["daily"])]);
  const maxIssue = Math.max(1, ...d.issues.flatMap((i) => i.daily.map((x) => x.negative)));
  const issueBars = (data: { d: string; negative: number }[]) => (
    <MiniBars tone="neg" max={maxIssue} label="Negative comments per day" data={data.map((x) => ({ key: x.d, v: x.negative, title: `${dayMonth(x.d)}: ${int(x.negative)} negative` }))} />
  );
  const render: Record<string, (t: string) => React.ReactNode> = {
    issues: (t) => (
      <SectionCard bare title={t} hint={<>The topics carrying {who}&apos;s negative {said} in {range}{d.brands.length > 1 ? ", and whether the same complaint hits the other brands" : ""}.</>}>
        {d.issues.length === 0 ? <Empty className="border border-card-border bg-white">No topic carries enough negative {said} about {who} in these days to call an issue.</Empty> : (
          <div className="grid gap-4 xl:grid-cols-2">
            {d.issues.map((i) => {
              const sc = SCOPE[i.scope];
              return (
                <article className={cn(ITEM_CARD, "rounded-3xl")} key={i.topic_id ?? i.topic}>
                  <header className="flex flex-wrap items-center gap-2">
                    <h3 className="mr-auto text-base font-semibold text-gray-900">{i.topic}</h3>
                    {d.brands.length > 1 && <Tag tone={sc.tone}>{sc.label}</Tag>}
                    <Tag>{STAGE[i.stage]}</Tag>
                  </header>
                  {withPosts ? (
                    <div className="flex flex-col gap-3">
                      <SplitTable sp={i.split} who={who} compact />
                      {issueBars(i.daily)}
                    </div>
                  ) : (
                    <div className="grid items-end gap-3 sm:grid-cols-[auto_auto_1fr]">
                      <div className="flex flex-col"><b className={cn("text-xl font-bold tabular-nums", NEG)}>{int(i.negative)}</b><small className="text-xs leading-relaxed text-gray-500">negative {said}<br />{i.negative_prev ? `${change(i.negative, i.negative_prev)} vs previous` : "none before"}</small></div>
                      <div className="flex flex-col"><b className="text-xl font-bold tabular-nums text-gray-900">{pct(i.neg_pct)}</b><small className="text-xs leading-relaxed text-gray-500">of {int(i.comments)} {said} on it{d.brands.length > 1 && <><br />others: {pct(i.industry.neg_pct)}</>}</small></div>
                      {issueBars(i.daily)}
                    </div>
                  )}
                  <p className="text-sm leading-relaxed text-gray-700">
                    {d.brands.length < 2 ? "" : i.scope === "only_us" ? `${who}'s negative share on this topic is well above the other brands' (${pct(i.neg_pct)} against ${pct(i.industry.neg_pct)}). It is about us.` : i.scope === "category" ? `The other brands see the same or worse${i.industry.brands_up.length ? ` (${i.industry.brands_up.join(", ")})` : ""}: a category complaint, not ours alone.` : `Some other brands see it too${i.industry.brands_up.length ? ` (${i.industry.brands_up.join(", ")})` : ""}, but not the whole category.`}
                    {d.brands.length < 2 ? "" : " "}Mostly on {i.platforms.slice(0, 2).map((p) => PLATFORM[p.platform] ?? p.platform).join(" and ")}{i.peak_day ? `; peak ${dayMonth(i.peak_day)}` : ""}.
                  </p>
                  {i.themes.length > 0 && <div className="flex flex-wrap gap-1">{i.themes.map((t) => <Tag key={t.theme}>{t.theme} · {int(t.n)}</Tag>)}</div>}
                  {i.quotes.length > 0 && <div className="flex flex-col gap-2">{i.quotes.slice(0, 2).map((q, n) => <QuoteLine key={n} q={q} />)}</div>}
                  {i.posts.length > 0 && <><H4>Where it happens</H4><PostList>{i.posts.slice(0, 2).map((p) => <PostLine key={p.url} p={p} />)}</PostList></>}
                  <footer className="mt-auto flex flex-wrap gap-x-4 border-0 border-t border-card-border pt-2">
                    <AskLink href={ask(`Why are ${i.catch_all ? "complaints outside our topics" : `"${i.topic}" complaints`} about ${who} building between ${dayMonth(f.from)} and ${dayMonth(f.to)}? Is it only us?`)}>Ask CeMO</AskLink>
                    <AskLink href={ask(`Draft a holding statement for ${who} on the ${i.catch_all ? "complaints outside our topics" : `"${i.topic}"`} negative comments between ${dayMonth(f.from)} and ${dayMonth(f.to)}, with a short Q&A for spokespeople.`)}>Draft holding statement</AskLink>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    ),
    rising: (t) => (
      <SectionCard title={t} hint={<>Posts about {who} from the last three days by views (likes where views are not reported), with where they are likely to end up from how posts here usually grow.</>}>
        {d.rising.length === 0 ? <Empty>No new posts about {who} in the last three days.</Empty> : (
          <PostList>{d.rising.map((r) => <PostLine key={r.url} p={r} extra={r.projected && r.views != null && r.projected > r.views * 1.05 ? `likely about ${compact(r.projected)} views` : r.neg_pct != null ? `${pct(r.neg_pct)} of comments negative` : undefined} />)}</PostList>
        )}
      </SectionCard>
    ),
    amplifiers: (t) => (
      <SectionCard title={t} hint={<>The accounts whose posts about {who} reached most people in {range}, and how {ampViews ? "the comments under them" : "their posts"} leaned.</>}>
        {d.amplifiers.length === 0 ? <Empty>No creator posts about {who} in these days.</Empty> : (
          <MiniTable min="min-w-[560px]" head={<><th className={TH}>Account</th><th className={TH_NUM}>{ampViews ? "Reach" : "Likes"}</th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>{ampViews || d.amplifiers.some((a) => a.neg_pct != null) ? "Negative" : "Stance"}</th></>}>
            {d.amplifiers.map((a) => (
              <tr key={a.platform + a.handle} className={TR}>
                <td className={TD}><span className="flex flex-wrap items-center gap-1.5"><PlatformTag p={a.platform} /><OutLink href={a.top_url}>@{a.handle}</OutLink><small className="text-xs text-gray-500">{a.tier ? a.tier : ""}{a.followers ? ` · ${compact(a.followers)} followers` : ""}{a.posts > 1 ? ` · ${a.posts} posts` : ""}</small></span></td>
                <td className={TD_NUM}>{ampViews ? compact(a.views) : int(a.likes)}</td><td className={TD_NUM}>{int(a.comments)}</td>
                <td className={cn(TD_NUM, ((a.neg_pct != null && a.neg_pct >= 25) || (a.neg_pct == null && a.stanced > 0 && a.against * 2 > a.stanced)) && cn(NEG, "font-semibold"))}>{a.neg_pct != null ? pct(a.neg_pct) : a.stanced === 1 ? (a.against ? "against" : "not against") : a.stanced > 1 ? `${int(a.against)} of ${int(a.stanced)} against` : "–"}</td>
              </tr>))}
          </MiniTable>
        )}
      </SectionCard>
    ),
    narratives: (t) => (
      <SectionCard title={t} hint={<>What people say about {who}, by topic: how much of the conversation each holds, and how it leans{withVoices ? ", and who is saying it" : ""}.</>}>
        <MiniTable min="min-w-[880px]" head={<><th className={TH}>Topic</th>{withPosts ? <><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Against</th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Negative</th></> : <th className={TH_NUM}>Comments</th>}<th className={TH_NUM}>Share</th>{!noPrev && <th className={TH_NUM}>Change</th>}{!withPosts && <th className={TH_NUM}>Negative</th>}{withVoices && <th className={TH}>Who</th>}<th className={TH}>In their words</th></>}>
          {d.narratives.filter((x) => x.comments > 0).map((x) => (
            <tr key={x.topic_id} className={TR}>
              <td className={TD}><b className="font-semibold text-gray-900">{x.catch_all ? `${x.topic} (no topic fits)` : x.topic}</b></td>
              {withPosts ? <>
                <td className={TD_NUM}>{int(x.split.posts.n)}</td><td className={cn(TD_NUM, NEG)}>{pct(sharePct(x.split.posts.negative, x.split.posts.labelled))}</td>
                <td className={TD_NUM}>{int(x.split.comments.n)}</td><td className={cn(TD_NUM, NEG)}>{pct(sharePct(x.split.comments.negative, x.split.comments.labelled))}</td>
              </> : <td className={TD_NUM}>{int(x.comments)}</td>}
              <td className={TD_NUM}>{pct(x.share)}</td>
              {!noPrev && <td className={TD_NUM}>{change(x.comments, x.comments_prev)}</td>}
              {!withPosts && <td className={TD_NUM}>{pct(x.neg_pct)} <small className={cn("text-xs", x.neg_pct != null && x.neg_pct_prev != null && x.neg_pct > x.neg_pct_prev ? NEG : POS)}>{pts(x.neg_pct, x.neg_pct_prev)}</small></td>}
              {withVoices && <td className={cn(TD, "whitespace-nowrap")}>{x.voices.filter((v) => v.voice !== "unclear").slice(0, 3).map((v) => (
                <div key={v.voice}><VoiceDot v={v.voice} />{v.voice} {int(v.n)} <small className="text-xs text-gray-500">{pct(sharePct(v.negative, v.labelled))} negative</small></div>
              ))}</td>}
              <td className={cn(TD, "max-w-80")}>{x.quote ? <a href={x.quote.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-gray-700 underline-offset-2 hover:text-brand-palette-700 hover:underline">“{x.quote.text.length > 110 ? x.quote.text.slice(0, 108) + "…" : x.quote.text}”</a> : "–"}</td>
            </tr>))}
        </MiniTable>
      </SectionCard>
    ),
    voices: (t) => (
      <SectionCard title={t} hint={<>Which side each post and comment about {who} is written from, and how it leans, in {range}.</>}>
        <MiniTable min="min-w-[640px]" head={<><th className={TH}>Voice</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Against</th><th className={TH_NUM}>Defending</th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Negative</th><th className={TH_NUM}>Defending</th></>}>
          {d.conversation.by_voice.map((v) => (
            <tr key={v.voice} className={TR}>
              <td className={TD}><b className="font-semibold text-gray-900">{v.voice === "unclear" ? "Not clear" : v.voice}</b></td>
              <td className={TD_NUM}>{int(v.posts.n)}</td><td className={cn(TD_NUM, NEG)}>{pct(sharePct(v.posts.negative, v.posts.labelled))}</td><td className={cn(TD_NUM, POS)}>{pct(sharePct(v.posts.positive, v.posts.labelled))}</td>
              <td className={TD_NUM}>{int(v.comments.n)}</td><td className={cn(TD_NUM, NEG)}>{pct(sharePct(v.comments.negative, v.comments.labelled))}</td><td className={cn(TD_NUM, POS)}>{pct(sharePct(v.comments.positive, v.comments.labelled))}</td>
            </tr>))}
        </MiniTable>
      </SectionCard>
    ),
    own: (t) => (
      <SectionCard title={t} hint={<>How {who}&apos;s own posts were received in {range}{d.brands.length > 1 ? ", against the other brands' own posts" : ""}.</>}>
        {d.own.length === 0 ? <Empty>{who} posted nothing tracked in these days.</Empty> : (
          <MiniTable head={<><th className={TH}>Platform</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Negative</th>{d.brands.length > 1 && <th className={TH_NUM}>Others</th>}<th className={TH_NUM}>Replies</th></>}>
            {d.own.map((o) => (
              <tr key={o.platform} className={TR}><td className={TD}><span className="flex items-center gap-1.5"><PlatformTag p={o.platform} />{PLATFORM[o.platform] ?? o.platform}</span></td><td className={TD_NUM}>{int(o.posts)}</td><td className={TD_NUM}>{int(o.comments)}</td>
                <td className={cn(TD_NUM, o.neg_pct != null && o.others_neg_pct != null && o.neg_pct > o.others_neg_pct * 1.5 && cn(NEG, "font-semibold"))}>{pct(o.neg_pct)}</td>{d.brands.length > 1 && <td className={cn(TD_NUM, MUTED)}>{pct(o.others_neg_pct)}</td>}<td className={TD_NUM}>{int(o.replies)}</td></tr>))}
          </MiniTable>
        )}
        {d.own_worst.length > 0 && <><H4>Received worst</H4><PostList>{d.own_worst.map((p) => <PostLine key={p.url} p={p} />)}</PostList></>}
      </SectionCard>
    ),
    service: (t) => (
      <SectionCard title={t} hint="Negative comments about payments, refunds, accounts and the app: service problems to hand over, not reputation stories."
        actions={<AskLink href={ask(`List the service complaints about ${who} between ${dayMonth(f.from)} and ${dayMonth(f.to)} for customer service: what the problem is, the post and the comment.`)}>Ask CeMO for the hand-off list</AskLink>}>
        <p className="text-sm text-gray-700"><b className="mr-1 text-3xl font-bold tabular-nums text-gray-900">{int(d.service.total)}</b> service complaints about {who} in {range}</p>
        {d.service.quotes.length > 0 && <div className="grid gap-2 lg:grid-cols-2">{d.service.quotes.slice(0, 4).map((q, n) => <QuoteLine key={n} q={q} />)}</div>}
      </SectionCard>
    ),
    competitive: (t) => (
      <SectionCard title={t} hint={<>Every brand on the same measures, {range}{scopeWord}. Share of voice is of posts about the brands; negative is of labelled comments.</>}>
        <MiniTable min="min-w-[920px]" head={<><th className={TH}>Brand</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Share of voice</th><th className={TH_NUM}>Reach</th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Negative</th><th className={TH_NUM}>Purchase intent</th><th className={TH}>Issue building</th></>}>
          {d.competitive.map((b) => (
            <tr key={b.id} className={cn(TR, b.is_focus && "bg-brand-palette-50/60")}>
              <td className={TD}><span className="flex flex-wrap items-center gap-1.5"><b className="font-semibold text-gray-900">{b.name}</b>{b.is_client ? <Tag tone="brand">you</Tag> : null}</span></td>
              <td className={TD_NUM}>{int(b.posts)}</td><td className={TD_NUM}>{pct(b.sov)}</td><td className={TD_NUM}>{compact(b.views)}</td><td className={TD_NUM}>{int(b.comments)}</td>
              <td className={TD_NUM}>{pct(b.neg_pct)} <small className={cn("text-xs", b.neg_pct != null && b.neg_pct_prev != null && b.neg_pct > b.neg_pct_prev ? NEG : POS)}>{pts(b.neg_pct, b.neg_pct_prev)}</small></td>
              <td className={TD_NUM}>{pct(b.intent_pct)}</td>
              <td className={TD}>{b.top_issue ? <>{b.top_issue.topic} <small className="text-xs text-gray-500">{int(b.top_issue.negative)} negative, {change(b.top_issue.negative, b.top_issue.negative_prev)}</small></> : <span className={MUTED}>–</span>}</td>
            </tr>))}
        </MiniTable>
      </SectionCard>
    ),
    pace: (t) => d.pace ? (
      <SectionCard title={t} hint={<>How fast the comments about {who} came{scopeWord}, and which way they lean, over the whole wave (the Pulse&apos;s chart).</>}>
        <PulseTrends subject={who} trend={d.pace} commentsOnly titled={false} postsCaveat={null}
          askTrend={<AskLink className="ml-auto" href={`${repAskHref(f.brand, f.days, f.platform)}&q=${encodeURIComponent(`What drove the peaks in comments about ${who}, and is it cooling down?`)}`}>Ask CeMO</AskLink>} />
      </SectionCard>
    ) : null,
    watch: (t) => (
      <SectionCard bare title={t} hint="The posts the team is watching, from the moment they went up: the post as last read, and the comments under it by their own label.">
        <div className={TWO}>{(d.watched ?? []).map((w) => <WatchCard key={w.url} w={w} who={who} />)}</div>
      </SectionCard>
    ),
    daily: (t) => d.daily ? (
      <SectionCard title={t} hint={<>Each day from {dayMonth(d.daily.from)} to {dayMonth(d.daily.to)}{scopeWord}, newest first: {who}&apos;s own posts, the posts and comments about {who}, and who they come from.</>}>
        <DailyTable x={d.daily} who={who} />
      </SectionCard>
    ) : null,
    platforms: (t) => (
      <SectionCard bare title={t} hint={<>The same story on each platform, apart: its post, the crowd under it, what they talk about and how fast, in {range}.</>}>
        <div className={TWO}>{(d.by_platform ?? []).map((x) => <PlatformCard key={x.platform} x={x} who={who} />)}</div>
      </SectionCard>
    ),
    tagged: (t) => {
      const tg = d.tagged!;
      const max = Math.max(1, ...tg.rows.map((r) => r.comments));
      return (
        <SectionCard title={t} hint={<>The accounts commenters tag: {int(tg.tagging)} of {int(tg.comments)} comments ({pct(sharePct(tg.tagging, tg.comments))}) pull someone in. A rival brand asked to step in shows here first.</>}>
          <MiniTable min="min-w-[760px]" head={<><th className={TH}>Account tagged</th><th className={TH_NUM}>Comments</th><th className={TH}>Where</th><th className={TH_NUM}>Negative</th><th className={TH}>In their words</th></>}>
            {tg.rows.map((r) => (
              <tr key={r.handle} className={TR}>
                <td className={TD}>
                  <span className="flex flex-wrap items-center gap-1.5"><b className="font-semibold text-gray-900">@{r.handle}</b>{r.subject ? <Tag tone="brand">you</Tag> : r.poster ? <Tag>the poster</Tag> : null}</span>
                  <span className="mt-1.5 block h-1.5 w-32 overflow-hidden rounded-full bg-gray-100"><i className="block h-full rounded-full bg-brand-palette-600" style={{ width: `${(r.comments / max) * 100}%` }} /></span>
                </td>
                <td className={TD_NUM}>{int(r.comments)}</td>
                <td className={TD}><span className="flex flex-wrap gap-1">{r.platforms.map((p) => <PlatformTag key={p} p={p} />)}</span></td>
                <td className={cn(TD_NUM, NEG)}>{r.negative ? int(r.negative) : "–"}</td>
                <td className={cn(TD, "max-w-80")}><a href={r.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-gray-700 underline-offset-2 hover:text-brand-palette-700 hover:underline">“{r.example.length > 120 ? r.example.slice(0, 118) + "…" : r.example}”</a></td>
              </tr>))}
          </MiniTable>
        </SectionCard>
      );
    },
    health: (t) => (
      <SectionCard title={t} hint="What is tracked, since when, and what is left out. Posts that do not name their brand stay stored but never count.">
        <MiniTable min="min-w-[720px]" head={<><th className={TH}>Platform</th><th className={TH}>Tracked</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Not about the brand</th><th className={TH_NUM}>Comments read</th><th className={TH_NUM}>Comments the posts report</th></>}>
          {d.coverage.map((c) => (
            <tr key={c.platform} className={TR}><td className={TD}><span className="flex items-center gap-1.5"><PlatformTag p={c.platform} />{PLATFORM[c.platform] ?? c.platform}</span></td><td className={cn(TD, "whitespace-nowrap")}>{dayMonth(c.first)} to {dayMonth(c.last)}</td><td className={TD_NUM}>{int(c.posts)}</td>
              <td className={TD_NUM}>{int(c.off_topic)} <small className="text-xs text-gray-500">{pct((c.off_topic / Math.max(1, c.posts)) * 100, 0)}</small></td><td className={TD_NUM}>{int(c.comments)}</td><td className={TD_NUM}>{int(c.reported_comments)}</td></tr>))}
        </MiniTable>
      </SectionCard>
    ),
  };
  const level = noNorm ? null : st.level;
  return (
    <section data-tw className={DASH_PAGE}>
      <PageHeader title="Dashboard" subtitle={<>{who}{d.tracked_since ? ` · tracked since ${dayMonth(d.tracked_since)} ${d.tracked_since.slice(0, 4)}` : ""} · {range}{scopeWord}{noPrev ? "" : ` vs the ${f.days} days before`} · data through {dayMonth(d.as_of)} {d.as_of.slice(0, 4)}</>}
        actions={<>
          {view.crisis && <Link className={buttonClass("outline", "sm")} href="/pulse" title="The crisis view: the wave hour by hour, what is moving and who is driving it">Crisis view</Link>}
          {view.builder && <Customise sections={layout.all} builder codename={view.codename} client={view.clientName} />}
          <DashTemplates builder={view.builder} codename={view.codename} />
        </>} />
      <PrFilters brand={f.brand} days={f.days} platform={f.platform} brands={d.brands} platforms={d.platforms} client={client} />
      <DashAsk who={who} brand={f.brand} days={f.days} platform={f.platform} />
      <Notes lines={d.notes} />

      {!showStatus && withPosts && (
        <div className={CARD}>
          <LeanBar label={`posts about ${who}`} x={P} neg="against" pos={`defending ${who}`} />
          <LeanBar label={d.per_comment ? `comments about ${who}` : "comments under them"} x={Cm} neg="negative" pos={`defending ${who}`} />
          {other > 0 && <p className="text-xs text-gray-500">{int(other)} more comments in these threads are about something else; they are left out of every number here.</p>}
        </div>
      )}
      {showStatus && (
        <div className={cn(CARD, "lg:flex-row lg:items-start lg:gap-6")}>
          <div className="flex shrink-0 flex-col gap-2 lg:w-64">
            <small className="text-xs text-gray-500">Reputation status · {st.day ? dayMonth(st.day.d) : "–"}</small>
            <StatusPill tone={level ? L.tone : "neutral"} className="self-start px-3 py-1 text-sm">{noNorm ? "No norm yet" : L.label}</StatusPill>
            {/* the ladder: every level named, the current one marked as in the Stepper (DESIGN.md 6.2) */}
            <ol aria-label="Levels" className="flex flex-wrap gap-1">
              {LEVEL_ORDER.map((lv) => (
                <li key={lv} aria-current={lv === level ? "step" : undefined}
                  className={cn("rounded-lg px-2 py-0.5 text-[11px]", lv === level ? "bg-brand-palette-50 font-semibold text-brand-palette-700" : "bg-gray-100/70 text-gray-500")}>{LEVEL[lv].label}</li>
              ))}
            </ol>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="text-sm leading-relaxed text-gray-700">{noNorm ? null : <b className="font-semibold text-gray-900">{L.line}</b>} {st.reason}</p>
            <LadderStrip label="Status over the last 30 days" days={st.history.map((h) => ({ d: h.d, level: h.norm ? h.level : "none", title: `${dayMonth(h.d)}: ${h.norm ? LEVEL[h.level].label : "no norm yet"}${h.neg_pct != null ? `, ${h.neg_pct}% negative of ${int(h.comments)}` : ""}` }))} />
            <small className="flex flex-wrap items-center gap-x-3 text-xs text-gray-500">{st.rule} {view.alert && <LadderDrawer brand={f.brand} alert={view.alert} builder={view.builder} />}</small>
          </div>
          {(st.level !== "calm" || noNorm) && <Link className={buttonClass("outline", "sm", "shrink-0 self-start")} href={ask(`What is driving the negative talk about ${who} around ${st.day ? dayMonth(st.day.d) : "the latest day"}, and should we respond?`)}>Ask CeMO</Link>}
        </div>
      )}

      <StatRow n={tiles.length}>
        {tiles.map((t) => <StatTile key={t.key} label={t.label} value={t.value} delta={t.delta} sub={t.sub} />)}
      </StatRow>

      {view.builder && view.scope && <PanelAsk scope={view.scope} />}
      <Sections arranged={{ ...layout, shown: layout.shown.filter((x) => !unmeasured.has(x.key)) }} render={render} who={hiddenFor} showHref={showHref} panels={view.panels} builder={view.builder} scope={view.scope} />
    </section>
  );
}
