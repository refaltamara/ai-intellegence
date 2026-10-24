import { Fragment } from "react";
import type { PulseData, PulseEvent, WatchPost } from "@/pulse/page";
import { Chart } from "@/ui/Chart";
import { PulseTrends } from "@/ui/pulse/PulseTrends";
import { fmtNum } from "@/ui/format";
import { PLATFORM_LABEL } from "@/skills/common";
import { pulseAskHref, type PulseCard } from "@/dashboard/askref";
import { PulseAsk } from "@/ui/pulse/PulseAsk";
import { PageHeader } from "@/ui/kit/PageHeader";
import { StatusPill } from "@/ui/kit/StatusPill";
import { Delta } from "@/ui/kit/StatTile";
import { Empty, Notes, SectionCard } from "@/ui/kit/Section";
import { SUB, TABLE, TD, TD_NUM, TH, TH_NUM, THEAD, TR } from "@/ui/kit/Table";
import { SERIES } from "@/ui/kit/chart";
import { AskLink, Bar, DASH_PAGE, Tag, TWO } from "@/ui/dashboard/parts";
import { cn } from "@/ui/cn";

const label = (p: string) => PLATFORM_LABEL[p] ?? p;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-13 15:15" → "13 Sep 15:15"; a bare date or midnight day bucket → "13 Sep" */
const when = (s: string | null, dayOnly = false) => {
  if (!s) return "–";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (!m) return s;
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  return dayOnly || !m[4] ? day : `${day} ${m[4]}:${m[5]}`;
};

const NOTE = "text-xs leading-relaxed text-gray-500";
const TEXT = "text-sm leading-relaxed text-gray-700";
const LINK = "font-semibold text-brand-palette-700 underline-offset-2 hover:text-brand-palette-800 hover:underline";
/** half or more negative reads in red, with the number itself saying so */
const hot = (on: boolean) => (on ? "font-semibold text-red-700" : "font-semibold text-gray-900");

/** a table inside a card: it scrolls sideways on a phone instead of squeezing */
function CardTable({ head, children, min = "min-w-[560px]" }: { head: React.ReactNode; children: React.ReactNode; min?: string }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className={cn(TABLE, min)}>
        <thead className={THEAD}><tr>{head}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** a headline number with the sentence that says what it counts */
function Stat({ value, className, children }: { value: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-3xl border border-card-border bg-white p-5">
      <b className={cn("text-3xl font-bold leading-tight tabular-nums text-gray-900", className)}>{value}</b>
      <span className="text-sm leading-relaxed text-gray-500">{children}</span>
    </div>
  );
}

/** a smaller figure inside a card */
function MiniStat({ value, children }: { value: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-gray-50 p-3">
      <b className="text-xl font-bold tabular-nums text-gray-900">{value}</b>
      <span className="text-xs leading-relaxed text-gray-600">{children}</span>
    </div>
  );
}

/** one line of a short ranked list: what, how much, and a quote under it */
function Item({ title, meta, quote }: { title: React.ReactNode; meta?: React.ReactNode; quote?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
      <span className="text-sm"><b className="font-semibold text-gray-900">{title}</b>{meta && <span className="text-gray-500"> {meta}</span>}</span>
      {quote && <small className="text-xs leading-relaxed text-gray-600">{quote}</small>}
    </li>
  );
}
const LIST = "flex flex-col divide-y divide-card-border";

/** `ask` off (a case's page, DECISIONS 10 Oct 2026): no ask box and no "Ask CeMO" on the cards, whose figures are read back for the panel */
export function PulsePage({ d, title = "Dashboard", ask = true, actions }: { d: PulseData; title?: string; ask?: boolean; /** beside the date pill, e.g. a case's "Open its own dashboard" */ actions?: React.ReactNode }) {
  const t = d.totals;
  // Shares are taken on the comments that are about the subject. Folding in the thread
  // noise (sellers, memes, strangers arguing with each other) halves the number and
  // measures the crawl instead of the crisis.
  const negPct = pct(t.on_topic_negative, t.on_topic_labelled);
  const sum = d.sentiment.summary as { spike_started?: string | null; peak_bucket?: string | null; peak_negative?: number; bucket?: string };
  const seedRows = d.seeding.rows as { kind: string; platform: string; what: string; accounts: number; comments: number; first_at: string; post_url: string | null }[];
  const themeRows = d.themes.rows as { term: string; comments: number; share_pct: number; examples: string[] }[];
  const driverRows = d.drivers.rows as { url: string; platform: string; account: string; source: string; stance: string | null; views: number | null; comments: number; negative: number; positive: number; unlabelled: number; caption: string | null; posted_at: string }[];
  const againstPct = pct(t.posts_against, t.posts_stance_labelled);
  const lag = d.postsAsOf && d.asOf && d.postsAsOf > d.asOf;
  return (
    <section data-tw className={DASH_PAGE}>
      <PageHeader title={title} subtitle={<>What is being said about {d.subject}, hour by hour, across {t.platforms} platform{t.platforms === 1 ? "" : "s"}</>}
        actions={<>{actions}<StatusPill tone="neutral">Posts through {d.postsAsOf} · comments through {d.asOf} WIB</StatusPill></>} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat value={fmtNum(t.on_topic)}>comments about {d.subject}, from {fmtNum(t.accounts)} accounts on {fmtNum(t.posts_with_comments)} posts{t.off_topic ? ` · ${fmtNum(t.off_topic)} more in these threads are about something else` : ""}</Stat>
        <Stat value={negPct != null ? `${negPct}%` : "–"} className={negPct != null && negPct >= 50 ? "text-red-700" : undefined}>{t.on_topic_labelled ? `negative, of the ${fmtNum(t.on_topic_labelled)} read so far${t.on_topic_labelled < t.on_topic ? ` · ${fmtNum(t.on_topic - t.on_topic_labelled)} still unlabelled` : ""} · ${pct(t.on_topic_positive, t.on_topic_labelled) ?? 0}% defend ${d.subject}` : "negative · labelling has not started"}</Stat>
        <Stat value={againstPct != null ? `${againstPct}%` : "–"} className={againstPct != null && againstPct >= 50 ? "text-red-700" : undefined}>{t.posts_stance_labelled ? `of posts are against ${d.subject}, of ${fmtNum(t.posts_stance_labelled)} with a stance${t.earned_posts > t.posts_stance_labelled ? ` · ${fmtNum(t.earned_posts - t.posts_stance_labelled - t.posts_no_caption)} waiting, ${fmtNum(t.posts_no_caption)} have no text in the export` : ""}` : `posts by other accounts · ${fmtNum(t.earned_posts)} waiting for a stance`}</Stat>
        <Stat value={fmtNum(t.earned_posts)}>posts by other accounts about {d.subject}{sum.spike_started ? ` · comments spiked ${when(sum.spike_started, sum.bucket === "day")}` : ""}</Stat>
      </div>

      {ask && <PulseAsk subject={d.subject} />}

      <Now d={d} ask={ask} />

      <PulseTrends
        subject={d.subject}
        trend={d.trend}
        askTrend={<AskWhy card="trend" on={ask} />}
        askStance={<AskWhy card="stance" on={ask} />}
        postsDaily={d.posts_daily.series.length > 0 ? <div className="flex flex-col gap-2"><p className="text-sm font-semibold text-gray-900">And per day by platform, since the wave started</p><Chart spec={{ type: "stacked_bar", x: d.posts_daily.x.map((h) => h.slice(5)), series: d.posts_daily.series, y_label: "posts" }} /></div> : undefined}
        postsCaveat={<>The density of the conversation itself: new posts about {d.subject} by other accounts{d.posts_daily.series.length ? ` on ${d.posts_daily.series.map((x) => x.name).join(", ")}` : ""}. A platform where only {d.subject}&apos;s own posts are captured shows nothing here.</>}
      />

      {(d.sides.voices.length > 0 || d.sides.topics.length > 0) && <Sides d={d} ask={ask} />}

      <Watchlist d={d} ask={ask} />

      <Exposure d={d} ask={ask} />

      {lag && <Notes lines={[`Comments are loaded through ${when(d.asOf)} WIB; the post charts above run to ${when(d.postsAsOf)}. The comment sections below cover the earlier window.`]} />}

      <div className={TWO}>
        <SectionCard title="Comments per hour" hint="last 72 hours of comment data · by platform · WIB" actions={<AskWhy card="trend" on={ask} />}>
          {d.hourly.x.length >= 3 ? <Chart spec={{ type: "stacked_bar", x: d.hourly.x.map((h) => h.slice(5)), series: d.hourly.series, y_label: "comments" }} /> : <Empty>Not enough hours of data yet.</Empty>}
        </SectionCard>
        <SectionCard title="Comments per day, since the wave started" hint="by platform" actions={<AskWhy card="trend" on={ask} />}>
          {d.daily.x.length >= 3 ? <Chart spec={{ type: "stacked_bar", x: d.daily.x.map((h) => h.slice(5)), series: d.daily.series, y_label: "comments" }} /> : <Empty>Not enough days of data yet.</Empty>}
          {d.daily.series.some((x) => /youtube/i.test(x.name)) && <p className={NOTE}>YouTube comment times older than a day come rounded from the export (“3 weeks ago”), so early days are approximate.</p>}
        </SectionCard>
      </div>

      <div className={TWO}>
        <SectionCard title="Where the anger is" hint="the same comments, split by whose post they sit under" actions={<AskWhy card="anger" on={ask} />}>
          <div className="flex flex-col gap-4">
            <SourceBar subject={d.subject} label={`Under ${d.subject}'s own posts`} comments={t.owned_comments} negative={t.owned_negative} total={t.on_topic} />
            <SourceBar subject={d.subject} label="Under everyone else's posts" comments={t.earned_comments} negative={t.earned_negative} total={t.on_topic} />
          </div>
          <p className={TEXT}>
            Away from {d.subject}&apos;s own accounts this is an argument with two sides; on its own feed it is a pile-on written to {d.subject}, and it is the part that cannot be left. {pct(t.owned_comments, t.on_topic) ?? 0}% of everything said about {d.subject} is now written under {d.subject}&apos;s own posts.
          </p>
          {t.labelled < t.comments && <p className={NOTE}>Labelling is still running and works post by post, so some posts are labelled unevenly until it finishes.</p>}
        </SectionCard>
        <SectionCard title={<>Before and after {d.subject}&apos;s reply</>} hint={d.reply_effect ? `${when(d.reply_effect.at)} WIB · three days either side` : "no reply from the subject in the data"} actions={<AskWhy card="reply" on={ask} />}>
          {d.reply_effect ? (
            <>
              <CardTable min="min-w-[420px]" head={<><th className={TH}><span className="sr-only">Window</span></th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Labelled</th><th className={TH_NUM}>Negative</th></>}>
                <SplitRow label="Before, all platforms" s={d.reply_effect.before} />
                <SplitRow label="After, all platforms" s={d.reply_effect.after} />
                <SplitRow label={`Before, ${label(d.reply_effect.same_platform.platform)} only`} s={d.reply_effect.same_platform.before} />
                <SplitRow label={`After, ${label(d.reply_effect.same_platform.platform)} only`} s={d.reply_effect.same_platform.after} />
              </CardTable>
              <p className={NOTE}>Compare the negative share, not the counts: volume after a reply says how loud, the share says whether it helped.</p>
            </>
          ) : <Empty>When the subject replies under their own post, this card compares the comments before and after.</Empty>}
        </SectionCard>
      </div>

      <SectionCard title="How it spread" hint="every platform on one clock, WIB" actions={<AskWhy card="spread" on={ask} />}>
        <CardTable head={<><th className={TH}>When</th><th className={TH}>Where</th><th className={TH}>What</th><th className={TH}>Reach</th></>}>
          {d.events.map((e, i) => <EventRow key={i} e={e} />)}
        </CardTable>
      </SectionCard>

      {(d.root || d.spread.length > 0) && (
        <div className={d.root && d.spread.length ? "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" : "flex flex-col gap-6"}>
          {d.root && (
            <SectionCard title="The root" hint={when(d.root.posted_at, true)}>
              <p className={TEXT}>“{d.root.caption}…”</p>
              <p className="text-xs leading-relaxed text-gray-500">{fmtNum(d.root.views)} views · {fmtNum(d.root.likes)} likes · {fmtNum(d.root.comments)} comments, {fmtNum(d.root.early_comments)} of them in the first two weeks · <a href={d.root.url} target="_blank" rel="noreferrer" className={LINK}>open</a></p>
              {d.reply && <p className={TEXT}><b className="font-semibold text-gray-900">{d.subject} replied</b> {when(d.reply.at)} WIB, {fmtNum(d.reply.likes)} likes: “{d.reply.text.slice(0, 150)}…”</p>}
            </SectionCard>
          )}
          {d.spread.length > 0 && (
            <SectionCard title="Per platform" hint={<>negative share of the comments about {d.subject}</>} actions={<AskWhy card="spread" on={ask} />}>
              <CardTable min="min-w-[640px]" head={<><th className={TH}>Platform</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>About {d.subject}</th><th className={TH_NUM}>Negative</th><th className={TH}>First post</th><th className={TH}>Peak hour</th></>}>
                {d.spread.map((s) => (
                  <tr key={s.platform} className={TR}>
                    <td className={TD}>{label(s.platform)}</td><td className={TD_NUM}>{fmtNum(s.posts)}</td>
                    <td className={TD_NUM}>{fmtNum(s.on_topic)}{s.on_topic < s.comments ? <small className={SUB}>{fmtNum(s.comments - s.on_topic)} not about {d.subject}</small> : null}</td>
                    <td className={cn(TD_NUM, hot(!!s.on_topic && s.negative / s.on_topic >= 0.5))}>{s.on_topic ? `${pct(s.negative, s.on_topic)}%` : "–"}{s.positive ? <small className={cn(SUB, "font-regular")}>{pct(s.positive, s.on_topic)}% defending</small> : null}</td>
                    <td className={TD}>{s.first_post ? `${when(s.first_post)} @${s.first_post_handle}` : "own posts only"}</td>
                    <td className={TD}>{s.peak_hour ? `${when(s.peak_hour)} · ${fmtNum(s.peak_comments)}` : "–"}</td>
                  </tr>
                ))}
              </CardTable>
            </SectionCard>
          )}
        </div>
      )}

      <div className={TWO}>
        <SectionCard title="Where the contents stand" hint={<>posts by other accounts, for or against {d.subject}, weighted by reach</>} actions={<AskWhy card="stance" on={ask} />}>
          <CardTable min="min-w-[600px]" head={<><th className={TH}>Platform</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Against</th><th className={TH_NUM}>Neutral</th><th className={TH_NUM}>For</th><th className={TH}>Hostile share of reach</th></>}>
            {d.stance.map((r) => {
              const labelled = r.posts - r.unlabelled;
              const useViews = r.views_total > 0;
              const tot = useViews ? r.views_against + r.views_for + r.views_neutral : r.likes_against + r.likes_for + r.likes_neutral;
              const hostile = tot > 0 ? Math.round(((useViews ? r.views_against : r.likes_against) / tot) * 100) : null;
              return (
                <tr key={r.platform} className={TR}>
                  <td className={TD}>{label(r.platform)}</td><td className={TD_NUM}>{fmtNum(r.posts)}</td>
                  <td className={TD_NUM}>{labelled ? fmtNum(r.against) : "–"}</td><td className={TD_NUM}>{labelled ? fmtNum(r.neutral) : "–"}</td><td className={TD_NUM}>{labelled ? fmtNum(r.for_) : "–"}</td>
                  <td className={TD}>{hostile == null ? (r.unlabelled ? <span className="text-gray-500">stance labels pending</span> : "–") : (
                    <span className="flex items-center gap-2">
                      <span className="w-24 shrink-0"><Bar pct={hostile} colour="var(--color-red-600)" /></span>
                      <span className="tabular-nums">{hostile}% <small className="text-xs text-gray-500">of {useViews ? "views" : "likes"}{r.unlabelled ? `, ${r.unlabelled} posts unlabelled` : ""}</small></span>
                    </span>
                  )}</td>
                </tr>
              );
            })}
          </CardTable>
          <p className={NOTE}>Stance is labelled after the comments; Threads reports no views, so its reach is likes. {d.subject}&apos;s own posts carry no stance, and {fmtNum(t.posts_no_caption)} posts arrived with no text in the export, so they count for density only.</p>
        </SectionCard>
        <SectionCard title="Who is commenting" hint={`${fmtNum(d.commenters.accounts)} accounts · ${fmtNum(d.commenters.comments)} comments`} actions={<AskWhy card="commenters" on={ask} />}>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat value={`${pct(d.commenters.once, d.commenters.accounts) ?? 0}%`}>commented once ({fmtNum(d.commenters.once)} accounts, {pct(d.commenters.comments_from_once, d.commenters.comments) ?? 0}% of comments)</MiniStat>
            <MiniStat value={fmtNum(d.commenters.many)}>accounts with 5+ comments, carrying {pct(d.commenters.comments_from_many, d.commenters.comments) ?? 0}% of comments</MiniStat>
            <MiniStat value={fmtNum(d.commenters.cross_post)}>accounts on 2+ posts · {fmtNum(d.commenters.cross_platform)} handles seen on 2+ platforms</MiniStat>
          </div>
          {d.commenters.first_time.series[0].data.some((v) => v != null) && <Chart spec={{ type: "line", x: d.commenters.first_time.x.map((h) => h.slice(5)), series: d.commenters.first_time.series, y_label: "% first-time" }} />}
          <p className={NOTE}>A pile-on is mostly first-time accounts; a mobilised one shows repeat accounts across posts and the same handles on several platforms. Handles are matched as text, not as people.</p>
          <ul className={LIST}>{d.commenters.top.slice(0, 5).map((c) => <Item key={c.platform + c.handle} title={`@${c.handle}`} meta={`${label(c.platform)} · ${fmtNum(c.comments)} comments on ${fmtNum(c.posts)} posts · ${fmtNum(c.likes)} likes${c.negative ? ` · ${fmtNum(c.negative)} negative` : ""}`} />)}</ul>
        </SectionCard>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <SectionCard title="What they are saying" hint={(d.themes.summary as { sentiment?: string }).sentiment === "negative" ? "in negative comments" : "all comments, labels still landing"} actions={<AskWhy card="themes" on={ask} />}>
          {d.themes.status !== "ok" || !themeRows.length ? <Empty>{d.themes.message ?? "Nothing recurring yet."}</Empty> : (
            <ul className={LIST}>{themeRows.map((r) => <Item key={r.term} title={r.term} meta={`${fmtNum(r.comments)} · ${r.share_pct}%`} quote={r.examples[0] ? `“${r.examples[0].slice(0, 110)}”` : undefined} />)}</ul>
          )}
        </SectionCard>
        <SectionCard title="Who is driving it" hint="posts by comments drawn" actions={<AskWhy card="drivers" on={ask} />}>
          <ul className={LIST}>{driverRows.map((r) => <Item key={r.url} title={r.source === "owned" ? `${d.subject} (own ${label(r.platform)})` : `@${r.account} · ${label(r.platform)}`} meta={`${fmtNum(r.comments)} comments${r.negative ? ` · ${fmtNum(r.negative)} neg` : ""}${r.stance ? ` · ${r.stance}` : ""}`} quote={r.caption ? `“${r.caption.slice(0, 100)}”` : undefined} />)}</ul>
        </SectionCard>
        <SectionCard title="Coordinated patterns" hint={(d.seeding.summary as { signal?: string }).signal ?? ""} actions={<AskWhy card="seeding" on={ask} />}>
          {!seedRows.length ? <Empty>No coordinated pattern found. Organic so far.</Empty> : (
            <ul className={LIST}>{seedRows.map((r, i) => <Item key={i} title={r.kind === "same_wording" ? `Same wording, ${r.accounts} accounts` : r.kind === "repeat_account" ? `${r.what}, ${r.comments} comments` : `Burst, ${r.accounts} first-time commenters`} meta={`${label(r.platform)} · ${when(r.first_at)}`} quote={r.kind === "same_wording" ? `“${r.what.slice(0, 100)}”` : r.kind === "burst" ? "on one post within ten minutes" : "across several posts"} />)}</ul>
          )}
          <p className={NOTE}>Patterns, not proof: memes and pile-ons look like this too.</p>
        </SectionCard>
      </div>
    </section>
  );
}

/** "Ask CeMO" on a card: the chat opens with this card's figures, read again on the server (src/pulse/ask.ts). */
function AskWhy({ card, on }: { card: PulseCard; on: boolean }) {
  if (!on) return null;
  return <AskLink href={pulseAskHref(card)} label="Ask CeMO about this card; its figures go with the question">Ask CeMO</AskLink>;
}

/**
 * Where it stands right now. Every number is computed in SQL; the sentence only
 * chooses words for the direction of two of them, on bands wide enough that a
 * quiet hour cannot flip the verdict.
 */
function Now({ d, ask }: { d: PulseData; ask: boolean }) {
  const s = d.status;
  const move = (now: number, prev: number, band = 0.15) => (prev <= 0 ? (now > 0 ? 1 : 0) : (now - prev) / prev > band ? 1 : (now - prev) / prev < -band ? -1 : 0);
  const tone = (now: number | null, prev: number | null) => (now == null || prev == null ? 0 : now - prev > 3 ? 1 : now - prev < -3 ? -1 : 0);
  // Posts only (no comments loaded yet): volume follows posts and the tone is not claimed.
  const postsOnly = s.now6.comments + s.prev6.comments + s.prev_day.comments === 0;
  const vol = postsOnly ? move(s.now6.posts, s.prev6.posts) : move(s.now6.comments, s.prev6.comments);
  const ton = tone(s.now6.negative_pct, s.prev6.negative_pct);
  const headline = `${vol > 0 ? "Getting louder" : vol < 0 ? "Quieting down" : "Holding steady"}, ${postsOnly ? "in posts; no comments are loaded yet" : ton > 0 ? "and angrier" : ton < 0 ? "and less angry" : "and the tone has not moved"}.`;
  const per = (n: number, hours: number) => Math.round(n / hours);
  const delta = (now: number, prev: number) => (prev <= 0 ? null : Math.round(((now - prev) / prev) * 100));
  const cStep = delta(s.now6.comments, s.prev6.comments);
  const pStep = delta(s.now6.posts, s.prev6.posts);
  const nStep = s.now6.negative_pct != null && s.prev6.negative_pct != null ? Math.round((s.now6.negative_pct - s.prev6.negative_pct) * 10) / 10 : null;
  const dStep = s.now6.positive_pct != null && s.prev6.positive_pct != null ? Math.round((s.now6.positive_pct - s.prev6.positive_pct) * 10) / 10 : null;
  return (
    <SectionCard title="How it is going" hint={`the last six hours against the six before · comments through ${when(d.asOf)} WIB`} actions={<AskWhy card="now" on={ask} />}>
      <div className="flex flex-col gap-1">
        <p className="text-xl font-semibold leading-tight text-gray-900">{headline}</p>
        <p className={TEXT}>
          {fmtNum(s.now6.comments)} comments and {fmtNum(s.now6.posts)} posts in the last six hours: {fmtNum(per(s.now6.comments, 6))} comments an hour, against {fmtNum(per(s.prev6.comments, 6))} in the six before and {fmtNum(per(s.prev_day.comments, 24))} across the day before that.
          {s.now6.negative_pct != null && ` Of the comments about ${d.subject} in those hours, ${s.now6.negative_pct}% were negative and ${s.now6.positive_pct ?? 0}% defended ${d.subject}.`}
          {d.trend.peak && d.trend.peak.comments > 0 && s.hours_since_peak != null && ` The busiest hour of the whole crisis was ${when(d.trend.peak.h)} WIB with ${fmtNum(d.trend.peak.comments)} comments, ${s.hours_since_peak} hours ago.`}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Step label="Comments an hour" value={fmtNum(per(s.now6.comments, 6))} step={cStep} suffix="%" good="down" sub={`${fmtNum(per(s.prev6.comments, 6))} in the previous six hours`} />
        <Step label="Posts an hour" value={fmtNum(per(s.now6.posts, 6))} step={pStep} suffix="%" good="down" sub={`${fmtNum(per(s.prev6.posts, 6))} in the previous six hours`} />
        <Step label="Negative" value={s.now6.negative_pct != null ? `${s.now6.negative_pct}%` : "–"} step={nStep} suffix="pp" good="down" sub={s.prev6.negative_pct != null ? `${s.prev6.negative_pct}% in the previous six hours` : "not enough comments before"} />
        <Step label={`Defending ${d.subject}`} value={s.now6.positive_pct != null ? `${s.now6.positive_pct}%` : "–"} step={dStep} suffix="pp" good="up" sub={s.prev6.positive_pct != null ? `${s.prev6.positive_pct}% in the previous six hours` : "not enough comments before"} />
      </div>
      <p className={NOTE}>Volume and tone move separately: fewer comments at the same negative share means the crowd is thinning, not softening. The final hour is partial, so the rate reads slightly low.</p>
    </SectionCard>
  );
}

function Step({ label, value, step, suffix, good, sub }: { label: string; value: string; step: number | null; suffix: string; good: "up" | "down"; sub: string }) {
  const dir = step == null || step === 0 ? 0 : step > 0 ? 1 : -1;
  const ok = dir === 0 ? null : (dir > 0 ? "up" : "down") === good;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-card-border p-4">
      <span className="text-sm text-gray-500">{label}</span>
      <b className="text-2xl font-bold leading-tight tabular-nums text-gray-900">{value}</b>
      {step != null && step !== 0 && <Delta dir={ok ? "up" : "down"} glyph={dir > 0 ? "▲" : "▼"}>{Math.abs(step)}{suffix}</Delta>}
      <span className="text-xs text-gray-500">{sub}</span>
    </div>
  );
}

/** The posts still drawing a crowd. Sorted by what is alive now, not by what was loudest yesterday. */
function Watchlist({ d, ask }: { d: PulseData; ask: boolean }) {
  const live = [...d.watch].sort((a, b) => b.last6h - a.last6h || b.last24h - a.last24h || b.comments - a.comments);
  const byPlatform = new Map<string, WatchPost[]>();
  for (const w of live) byPlatform.set(w.platform, [...(byPlatform.get(w.platform) ?? []), w]);
  const order = [...byPlatform.entries()].sort((a, b) => b[1].reduce((s, w) => s + w.last24h, 0) - a[1].reduce((s, w) => s + w.last24h, 0));
  return (
    <SectionCard title="Most commented posts, and which are still moving" hint="top three per platform · a dot means it took comments in the last six hours" actions={<AskWhy card="watch" on={ask} />}>
      <CardTable min="min-w-[760px]" head={<><th className={TH}>Post</th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Last 24h</th><th className={TH_NUM}>Last 6h</th><th className={TH_NUM}>Negative</th><th className={TH}>Reach</th></>}>
        {order.map(([platform, rows]) => (
          <Fragment key={platform}>
            <tr className="border-0 border-b border-card-border bg-gray-50"><td colSpan={6} className="px-3 py-2 text-xs font-semibold text-gray-700">{label(platform)}</td></tr>
            {rows.map((w) => <WatchRow key={w.url} w={w} subject={d.subject} />)}
          </Fragment>
        ))}
      </CardTable>
      <p className={NOTE}>This is where a reply lands or a fire keeps burning: a post that is still taking comments hours after it went up is the one to answer. {d.subject}&apos;s own posts are marked, because a comment there is written to {d.subject}, not about it.</p>
    </SectionCard>
  );
}

const STANCE_TONE: Record<string, "down" | "up" | "neutral"> = { negative: "down", positive: "up" };

function WatchRow({ w, subject }: { w: WatchPost; subject: string }) {
  const noise = w.comments - w.on_topic;
  return (
    <tr className={TR}>
      <td className={cn(TD, "max-w-120")}>
        <span className="flex flex-wrap items-center gap-1.5">
          {/* a real state: the post took comments in the last six hours */}
          {w.last6h > 0 && <span title="took comments in the last six hours" className="inline-flex items-center"><i aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-600" /><span className="sr-only">Took comments in the last six hours.</span></span>}
          {w.source === "owned" ? <b className="font-semibold text-gray-900">{subject}&apos;s own post</b> : <b className="font-semibold text-gray-900">@{w.handle}</b>}
          <span className="text-gray-500"> · {when(w.posted_at)}</span>
          {w.stance && w.source !== "owned" && <Tag tone={STANCE_TONE[w.stance] ?? "neutral"}>{w.stance === "negative" ? `against ${subject}` : w.stance === "positive" ? `defending ${subject}` : "neutral"}</Tag>}
        </span>
        <a href={w.url} target="_blank" rel="noreferrer" className="mt-0.5 line-clamp-2 text-sm text-gray-700 underline-offset-2 hover:text-brand-palette-700 hover:underline">“{w.caption || "no text in the export"}”</a>
      </td>
      <td className={TD_NUM}>{fmtNum(w.comments)}{noise > 0 && <small className={SUB}>{fmtNum(noise)} not about {subject}</small>}</td>
      <td className={TD_NUM}>{fmtNum(w.last24h)}</td>
      <td className={cn(TD_NUM, w.last6h > 0 && "font-semibold text-gray-900")}>{fmtNum(w.last6h)}</td>
      <td className={cn(TD_NUM, hot(w.negative_pct != null && w.negative_pct >= 50))}>
        {w.negative_pct == null ? "–" : `${w.negative_pct}%`}
        {w.positive > 0 && <small className={cn(SUB, "font-regular")}>{fmtNum(w.positive)} defending</small>}
      </td>
      <td className={cn(TD, "text-xs text-gray-500")}>{w.views ? `${fmtNum(w.views)} views` : w.likes ? `${fmtNum(w.likes)} likes` : "–"}</td>
    </tr>
  );
}

/**
 * Commercial exposure: the line where a reputation problem starts costing money.
 * Boycott calls and the partner brands named beside the subject, counted only
 * against the words the workspace was given, so a quiet number here means quiet,
 * not "we did not look".
 */
function Exposure({ d, ask }: { d: PulseData; ask: boolean }) {
  const c = d.commercial;
  const step = c.posts_prev_24h > 0 ? Math.round(((c.posts_24h - c.posts_prev_24h) / c.posts_prev_24h) * 100) : null;
  const max = Math.max(1, ...c.daily.map((x) => x.posts + x.comments));
  const quiet = c.posts === 0 && c.comments === 0;
  return (
    <SectionCard title="Commercial exposure" hint={<>calls to boycott, and the partner brands named beside {d.subject}</>} actions={<AskWhy card="exposure" on={ask} />}>
      {quiet ? (
        <Empty>Nobody is calling for a boycott yet, and no partner brand has been named. This card counts only the words this workspace was given: the boycott vocabulary and the partner brands on its watchlist.</Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat value={fmtNum(c.posts)}>posts calling for a boycott · {fmtNum(c.posts_24h)} in the last 24 hours{step != null ? `, ${step >= 0 ? "up" : "down"} ${Math.abs(step)}% on the day before` : ""}</MiniStat>
            <MiniStat value={fmtNum(c.comments)}>comments saying the same · {fmtNum(c.comments_24h)} in the last 24 hours, against {fmtNum(c.comments_prev_24h)} the day before</MiniStat>
            <MiniStat value={fmtNum(Math.max(0, ...c.daily.map((x) => x.reach ?? 0)))}>views on the largest of them</MiniStat>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-900">Boycott calls per day, posts and comments together</p>
            <div className="no-scrollbar flex items-end gap-1.5 overflow-x-auto pb-1">
              {c.daily.map((x) => (
                <div key={x.d} className="flex w-10 shrink-0 flex-col items-center gap-1" title={`${x.posts} posts · ${x.comments} comments`}>
                  <span className="flex h-20 w-full items-end overflow-hidden rounded-md bg-gray-100">
                    <i className="block w-full rounded-t-md" style={{ height: `${Math.round(((x.posts + x.comments) / max) * 100)}%`, background: SERIES[0] }} />
                  </span>
                  <b className="text-xs font-semibold tabular-nums text-gray-900">{x.posts + x.comments}</b>
                  <span className="whitespace-nowrap text-[11px] text-gray-500">{when(x.d, true)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {c.partners.length > 0 && (
        <CardTable head={<><th className={TH}>Partner brand</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Last 24h</th><th className={TH}>First named</th><th className={TH}>Last named</th></>}>
          {c.partners.map((p) => {
            const live = p.posts_24h + p.comments_24h;
            return (
              <tr key={p.name} className={TR}>
                <td className={cn(TD, "font-semibold text-gray-900")}>{p.name}</td>
                <td className={TD_NUM}>{fmtNum(p.posts)}</td>
                <td className={TD_NUM}>{fmtNum(p.comments)}</td>
                <td className={cn(TD_NUM, live && "font-semibold text-red-700")}>{fmtNum(live)}</td>
                <td className={cn(TD, "text-xs text-gray-500")}>{when(p.first_at)}</td>
                <td className={cn(TD, "text-xs text-gray-500")}>{when(p.last_at)}</td>
              </tr>
            );
          })}
        </CardTable>
      )}
      {!c.configured && !quiet && <p className={NOTE}>No partner brands are on this workspace&apos;s watchlist yet, so only the boycott calls above are counted. Once they are added they are counted across the whole history, not just from that day.</p>}

      {c.top.length > 0 && (
        <ul className={LIST}>
          {c.top.map((p) => (
            <Item key={p.url} title={`@${p.handle}`} meta={`${label(p.platform)} · ${when(p.posted_at)} · ${p.views ? `${fmtNum(p.views)} views` : p.likes ? `${fmtNum(p.likes)} likes` : "reach not reported"}`}
              quote={<a href={p.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-brand-palette-700 hover:underline">“{p.caption}”</a>} />
          ))}
        </ul>
      )}
      <p className={NOTE}>A boycott call is a post or comment using one of the workspace&apos;s boycott words; a partner is named when one of its words appears. Both are matched on text, so a mention is not the same as a threat: read the posts before you brief anyone.</p>
    </SectionCard>
  );
}

/**
 * Who is talking and about what (the labeller's voice and topic). In a cross-border pile-on, which side
 * a post is written from matters as much as how angry it is; the topics say what each side is on about.
 */
function Sides({ d, ask }: { d: PulseData; ask: boolean }) {
  const anyComments = [...d.sides.voices, ...d.sides.topics].some((r) => r.c_labelled > 0);
  const table = (rows: PulseData["sides"]["voices"], head: string) => (
    <CardTable min="min-w-[480px]" head={<><th className={TH}>{head}</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Against</th><th className={TH_NUM}>Defending</th>{anyComments && <><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Negative</th></>}</>}>
      {rows.map((r) => (
        <tr key={r.key} className={TR}>
          <td className={TD}>{r.label}</td><td className={TD_NUM}>{fmtNum(r.posts)}</td>
          <td className={cn(TD_NUM, hot(!!r.stanced && r.against / r.stanced >= 0.5))}>{r.stanced ? `${pct(r.against, r.stanced)}%` : "–"}</td>
          <td className={TD_NUM}>{r.stanced ? `${pct(r.for_, r.stanced)}%` : "–"}</td>
          {anyComments && <><td className={TD_NUM}>{fmtNum(r.comments)}</td><td className={TD_NUM}>{r.c_labelled ? `${pct(r.c_negative, r.c_labelled)}%` : "–"}</td></>}
        </tr>
      ))}
    </CardTable>
  );
  return (
    <div className={d.sides.voices.length && d.sides.topics.length ? TWO : "flex flex-col gap-6"}>
      {d.sides.voices.length > 0 && (
        <SectionCard title="Who is talking" hint={<>which side each post{anyComments ? " and comment" : ""} is written from, and how it leans</>} actions={<AskWhy card="sides" on={ask} />}>
          {table(d.sides.voices, "Voice")}
          <p className={NOTE}>Read by the labeller from the words people use, flags and how they name themselves; “not clear” when it cannot tell (often English, or too short). Shares are of the posts with a stance.</p>
        </SectionCard>
      )}
      {d.sides.topics.length > 0 && (
        <SectionCard title="What it is about" hint={<>the workspace&apos;s topics, and how each leans</>} actions={<AskWhy card="sides" on={ask} />}>
          {table(d.sides.topics, "Topic")}
          <p className={NOTE}>Each post{anyComments ? " and comment" : ""} carries one topic; the catch-all is last.</p>
        </SectionCard>
      )}
    </div>
  );
}

/** Owned against earned: the bar is the negative share, the width underneath is how much of the conversation sits there. */
function SourceBar({ label: l, comments, negative, total, subject }: { label: string; comments: number; negative: number; total: number; subject: string }) {
  const neg = pct(negative, comments);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-2">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-gray-900">{l}</span>
        <small className="text-xs text-gray-500">{fmtNum(comments)} comments · {pct(comments, total) ?? 0}% of everything said about {subject}</small>
      </span>
      <b className={cn("text-right text-xl tabular-nums", hot(neg != null && neg >= 50))}>{neg == null ? "–" : `${neg}%`}<small className="block text-xs font-regular text-gray-500">negative</small></b>
      <span className="col-span-2"><Bar pct={neg} colour="var(--color-red-600)" /></span>
    </div>
  );
}

function SplitRow({ label: l, s }: { label: string; s: { comments: number; labelled: number; negative: number } }) {
  const p = pct(s.negative, s.labelled);
  return <tr className={TR}><td className={TD}>{l}</td><td className={TD_NUM}>{fmtNum(s.comments)}</td><td className={TD_NUM}>{fmtNum(s.labelled)}</td><td className={cn(TD_NUM, hot(p != null && p >= 50))}>{p == null ? "–" : `${p}%`}</td></tr>;
}

// the moments that shaped the wave read in their own tone; the words in the row say which moment it is
const EVENT_TONE: Record<string, string> = {
  root: "font-semibold text-gray-900",
  reply: "font-semibold text-green-700",
  peak: "font-semibold text-red-700",
  takeoff: "font-semibold text-amber-800",
};

function EventRow({ e }: { e: PulseEvent }) {
  return (
    <tr className={TR}>
      <td className={cn(TD, "whitespace-nowrap text-gray-500")}>{when(e.at)}</td>
      <td className={TD}>{label(e.platform)}</td>
      <td className={cn(TD, EVENT_TONE[e.kind] ?? "text-gray-700")}>{e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{e.what}</a> : e.what}</td>
      <td className={cn(TD, "text-xs text-gray-500")}>{e.detail}</td>
    </tr>
  );
}
