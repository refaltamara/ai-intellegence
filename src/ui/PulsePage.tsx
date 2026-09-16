import { Fragment } from "react";
import Link from "next/link";
import type { PulseData, PulseEvent, WatchPost } from "@/pulse/page";
import { Chart } from "@/ui/Chart";
import { TrendChart } from "@/ui/TrendChart";
import { fmtNum } from "@/ui/format";
import { PLATFORM_LABEL } from "@/skills/common";

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

export function PulsePage({ d }: { d: PulseData }) {
  const t = d.totals;
  // Shares are taken on the comments that are about the subject. Folding in the thread
  // noise — sellers, memes, strangers arguing with each other — halves the number and
  // measures the crawl instead of the crisis.
  const negPct = pct(t.on_topic_negative, t.on_topic);
  const sum = d.sentiment.summary as { spike_started?: string | null; peak_bucket?: string | null; peak_negative?: number; bucket?: string };
  const seedRows = d.seeding.rows as { kind: string; platform: string; what: string; accounts: number; comments: number; first_at: string; post_url: string | null }[];
  const themeRows = d.themes.rows as { term: string; comments: number; share_pct: number; examples: string[] }[];
  const driverRows = d.drivers.rows as { url: string; platform: string; account: string; source: string; stance: string | null; views: number | null; comments: number; negative: number; positive: number; unlabelled: number; caption: string | null; posted_at: string }[];
  const againstPct = pct(t.posts_against, t.posts_stance_labelled);
  const lag = d.postsAsOf && d.asOf && d.postsAsOf > d.asOf;
  const ask = (q: string) => `/?q=${encodeURIComponent(q)}`;
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Pulse</h1><span className="meta">What is being said about {d.subject}, across {t.platforms} platforms</span></div>
        <span className="pill live">Posts through {d.postsAsOf} · comments through {d.asOf} WIB</span>
      </div>
      <div className="wrap wide">
        <div className="stats">
          <div className="stat"><b>{fmtNum(t.on_topic)}</b><span>comments about {d.subject}, from {fmtNum(t.accounts)} accounts on {fmtNum(t.posts_with_comments)} posts{t.off_topic ? ` · ${fmtNum(t.off_topic)} more in these threads are about something else` : ""}</span></div>
          <div className="stat"><b style={{ color: negPct != null && negPct >= 50 ? "var(--red)" : undefined }}>{negPct != null ? `${negPct}%` : "–"}</b><span>{t.on_topic_labelled ? `negative, of the ${fmtNum(t.on_topic)} about her${t.on_topic_labelled < t.on_topic ? ` · ${fmtNum(t.on_topic - t.on_topic_labelled)} still unlabelled` : ""} · ${pct(t.on_topic_positive, t.on_topic) ?? 0}% defend her` : "negative · labelling has not started"}</span></div>
          <div className="stat"><b style={{ color: againstPct != null && againstPct >= 50 ? "var(--red, #c0392b)" : undefined }}>{againstPct != null ? `${againstPct}%` : "–"}</b><span>{t.posts_stance_labelled ? `of posts are against ${d.subject}, of ${fmtNum(t.posts_stance_labelled)} with a stance${t.earned_posts > t.posts_stance_labelled ? ` · ${fmtNum(t.earned_posts - t.posts_stance_labelled - t.posts_no_caption)} waiting, ${fmtNum(t.posts_no_caption)} have no text in the export` : ""}` : `posts by other accounts · ${fmtNum(t.earned_posts)} waiting for a stance`}</span></div>
          <div className="stat"><b>{fmtNum(t.earned_posts)}</b><span>posts by other accounts about {d.subject}{sum.spike_started ? ` · comments spiked ${when(sum.spike_started, sum.bucket === "day")}` : ""}</span></div>
        </div>

        <Now d={d} />

        <div className="card" style={{ marginBottom: 12 }}>
          <h4>Comments per hour, and which way they lean <span>{trendSpan(d)} · WIB · bars are volume, lines are share of the comments about {d.subject}</span></h4>
          <div className="body">
            <TrendChart
              x={d.trend.points.map((p) => p.h)}
              bars={[
                { name: `About ${d.subject}`, data: d.trend.points.map((p) => p.on_topic), color: "var(--blue)" },
                { name: "Other talk in the same threads", data: d.trend.points.map((p) => p.off_topic), color: "#D5DDE8" },
              ]}
              lines={[
                { name: "Negative", data: d.trend.points.map((p) => share(p.negative, p.on_topic)), color: "var(--red)" },
                { name: `Defending ${d.subject}`, data: d.trend.points.map((p) => share(p.positive, p.on_topic)), color: "var(--green)" },
              ]}
              barLabel="Comments" lineLabel="share of comments about her"
              peakNote={d.trend.peak ? `${fmtNum(d.trend.peak.comments)} in one hour` : undefined}
            />
          </div>
          <div className="caveats">Share lines are blank in hours with fewer than ten comments about {d.subject}, where a percentage would be noise. The last hour is partial — it is still filling.</div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <h4>Posts about {d.subject} per hour, by stance <span>what other accounts publish, not the replies under it</span></h4>
          <div className="body">
            <TrendChart
              x={d.trend.points.map((p) => p.h)}
              bars={[
                { name: "Against her", data: d.trend.points.map((p) => p.against), color: "var(--red)" },
                { name: "Neutral", data: d.trend.points.map((p) => p.neutral_posts), color: "#8593A8" },
                { name: "Defending her", data: d.trend.points.map((p) => p.for_), color: "var(--green)" },
                { name: "No stance yet", data: d.trend.points.map((p) => Math.max(0, p.posts - p.against - p.neutral_posts - p.for_)), color: "#E6EBF2" },
              ]}
              lines={[{ name: "Share against her", data: d.trend.points.map((p) => share(p.against, p.posts)), color: "var(--red)" }]}
              barLabel="Posts" lineLabel="share of posts that hour" height={260}
              peakNote={d.trend.peak_posts ? `${fmtNum(d.trend.peak_posts.posts)} posts in one hour` : undefined}
            />
            {d.posts_daily.series.length > 0 && <><p className="quiet" style={{ margin: "14px 0 4px", fontWeight: 600 }}>And per day, since the wave started</p><Chart spec={{ type: "stacked_bar", x: d.posts_daily.x.map((h) => h.slice(5)), series: d.posts_daily.series, y_label: "posts" }} /></>}
          </div>
          <div className="caveats">The density of the conversation itself: new Threads, tweets and videos about {d.subject}. Instagram and YouTube capture {d.subject}&apos;s own posts only, so nothing earned appears there.</div>
        </div>

        <Watchlist d={d} />

        <Exposure d={d} />

        {lag && <p className="lag">Comments are loaded through {when(d.asOf)} WIB; the post charts above run to {when(d.postsAsOf)}. The comment sections below cover the earlier window.</p>}

        <div className="pulse-grid">
          <div className="card">
            <h4>Comments per hour <span>last 72 hours of comment data · by platform · WIB</span></h4>
            <div className="body">{d.hourly.x.length >= 3 ? <Chart spec={{ type: "stacked_bar", x: d.hourly.x.map((h) => h.slice(5)), series: d.hourly.series, y_label: "comments" }} /> : <p className="quiet">Not enough hours of data yet.</p>}</div>
          </div>
          <div className="card">
            <h4>Comments per day, since the wave started <span>by platform</span></h4>
            <div className="body">{d.daily.x.length >= 3 ? <Chart spec={{ type: "stacked_bar", x: d.daily.x.map((h) => h.slice(5)), series: d.daily.series, y_label: "comments" }} /> : <p className="quiet">Not enough days of data yet.</p>}</div>
            {d.root && <div className="caveats">YouTube comment times older than a day come rounded from the export (“3 weeks ago”), so early days are approximate.</div>}
          </div>
        </div>

        <div className="pulse-grid">
          <div className="card">
            <h4>Where the anger is <span>the same comments, split by whose post they sit under</span></h4>
            <div className="body">
              <div className="split">
                <SourceBar label={`Under ${d.subject}'s own posts`} comments={t.owned_comments} negative={t.owned_negative} total={t.on_topic} />
                <SourceBar label="Under everyone else's posts" comments={t.earned_comments} negative={t.earned_negative} total={t.on_topic} />
              </div>
              <p className="quiet" style={{ marginTop: 10 }}>
                Away from her own accounts this is an argument with two sides; on her own feed it is a pile-on written to her, and it is the part she cannot leave. {pct(t.owned_comments, t.on_topic) ?? 0}% of everything said about {d.subject} is now written under her own posts.
              </p>
            </div>
            {t.labelled < t.comments && <div className="caveats">Labelling is still running and works post by post, so some posts are labelled unevenly until it finishes.</div>}
          </div>
          <div className="card">
            <h4>Before and after {d.subject}&apos;s reply <span>{d.reply_effect ? `${when(d.reply_effect.at)} WIB · three days either side` : "no reply from the subject in the data"}</span></h4>
            <div className="body">
              {d.reply_effect ? (
                <div className="tablewrap still" style={{ border: 0 }}>
                  <table>
                    <thead><tr><th></th><th className="num">Comments</th><th className="num">Labelled</th><th className="num">Negative</th></tr></thead>
                    <tbody>
                      <SplitRow label="Before, all platforms" s={d.reply_effect.before} />
                      <SplitRow label="After, all platforms" s={d.reply_effect.after} />
                      <SplitRow label={`Before, ${label(d.reply_effect.same_platform.platform)} only`} s={d.reply_effect.same_platform.before} />
                      <SplitRow label={`After, ${label(d.reply_effect.same_platform.platform)} only`} s={d.reply_effect.same_platform.after} />
                    </tbody>
                  </table>
                  <p className="quiet" style={{ padding: "10px 12px 0" }}>Compare the negative share, not the counts: volume after a reply says how loud, the share says whether it helped.</p>
                </div>
              ) : <p className="quiet">When the subject replies under their own post, this card compares the comments before and after.</p>}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <h4>How it spread <span>every platform on one clock, WIB</span></h4>
          <div className="tablewrap still" style={{ border: 0 }}>
            <table>
              <thead><tr><th>When</th><th>Where</th><th>What</th><th>Reach</th></tr></thead>
              <tbody>{d.events.map((e, i) => <EventRow key={i} e={e} />)}</tbody>
            </table>
          </div>
        </div>
        <div className="pulse-grid">
          <div>
            {d.root && (
              <div className="card">
                <h4>The root <span>{when(d.root.posted_at, true)}</span></h4>
                <div className="body">
                  <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>“{d.root.caption}…”</p>
                  <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>{fmtNum(d.root.views)} views · {fmtNum(d.root.likes)} likes · {fmtNum(d.root.comments)} comments, {fmtNum(d.root.early_comments)} of them in the first two weeks · <a href={d.root.url} target="_blank" rel="noreferrer">open</a></p>
                  {d.reply && <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8 }}><b>{d.subject} replied</b> {when(d.reply.at)} WIB, {fmtNum(d.reply.likes)} likes: “{d.reply.text.slice(0, 150)}…”</p>}
                </div>
              </div>
            )}
          </div>
          <div className="card">
            <h4>Per platform <span>negative share of the comments about her</span></h4>
            <div className="tablewrap still" style={{ border: 0 }}>
              <table>
                <thead><tr><th>Platform</th><th className="num">Posts</th><th className="num">About her</th><th className="num">Negative</th><th>First post</th><th>Peak hour</th></tr></thead>
                <tbody>{d.spread.map((s) => (
                  <tr key={s.platform}>
                    <td>{label(s.platform)}</td><td className="num">{fmtNum(s.posts)}</td>
                    <td className="num">{fmtNum(s.on_topic)}{s.on_topic < s.comments ? <small style={{ display: "block", color: "var(--text-3)" }}>{fmtNum(s.comments - s.on_topic)} not about her</small> : null}</td>
                    <td className="num" style={{ color: s.on_topic && (s.negative / s.on_topic) >= 0.5 ? "var(--red)" : undefined, fontWeight: 600 }}>{s.on_topic ? `${pct(s.negative, s.on_topic)}%` : "–"}{s.positive ? <small style={{ display: "block", color: "var(--text-3)", fontWeight: 400 }}>{pct(s.positive, s.on_topic)}% defending</small> : null}</td>
                    <td>{s.first_post ? `${when(s.first_post)} @${s.first_post_handle}` : "own posts only"}</td>
                    <td>{s.peak_hour ? `${when(s.peak_hour)} · ${fmtNum(s.peak_comments)}` : "–"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="pulse-grid">
          <div className="card">
            <h4>Where the contents stand <span>posts by other accounts, for or against {d.subject}, weighted by reach</span></h4>
            <div className="tablewrap still" style={{ border: 0 }}>
              <table>
                <thead><tr><th>Platform</th><th className="num">Posts</th><th className="num">Against</th><th className="num">Neutral</th><th className="num">For</th><th>Hostile share of reach</th></tr></thead>
                <tbody>{d.stance.map((r) => {
                  const labelled = r.posts - r.unlabelled;
                  const useViews = r.views_total > 0;
                  const tot = useViews ? r.views_against + r.views_for + r.views_neutral : r.likes_against + r.likes_for + r.likes_neutral;
                  const hostile = tot > 0 ? Math.round(((useViews ? r.views_against : r.likes_against) / tot) * 100) : null;
                  return (
                    <tr key={r.platform}>
                      <td>{label(r.platform)}</td><td className="num">{fmtNum(r.posts)}</td>
                      <td className="num">{labelled ? fmtNum(r.against) : "–"}</td><td className="num">{labelled ? fmtNum(r.neutral) : "–"}</td><td className="num">{labelled ? fmtNum(r.for_) : "–"}</td>
                      <td>{hostile == null ? (r.unlabelled ? <span className="quiet">stance labels pending</span> : "–") : <><div className="bar" style={{ width: 90, display: "inline-block", verticalAlign: "middle", marginRight: 8 }}><i style={{ width: `${hostile}%`, background: "var(--red, #c0392b)" }} /></div>{hostile}% <small style={{ color: "var(--text-3)" }}>of {useViews ? "views" : "likes"}{r.unlabelled ? `, ${r.unlabelled} posts unlabelled` : ""}</small></>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <div className="caveats">Stance is labelled after the comments; Threads reports no views, so its reach is likes. {d.subject}&apos;s own posts carry no stance, and {fmtNum(t.posts_no_caption)} posts arrived with no text in the export, so they count for density only.</div>
          </div>
          <div className="card">
            <h4>Who is commenting <span>{fmtNum(d.commenters.accounts)} accounts · {fmtNum(d.commenters.comments)} comments</span></h4>
            <div className="body">
              <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 12 }}>
                <div className="stat" style={{ padding: 12 }}><b style={{ fontSize: 20 }}>{pct(d.commenters.once, d.commenters.accounts) ?? 0}%</b><span>commented once ({fmtNum(d.commenters.once)} accounts, {pct(d.commenters.comments_from_once, d.commenters.comments) ?? 0}% of comments)</span></div>
                <div className="stat" style={{ padding: 12 }}><b style={{ fontSize: 20 }}>{fmtNum(d.commenters.many)}</b><span>accounts with 5+ comments, carrying {pct(d.commenters.comments_from_many, d.commenters.comments) ?? 0}% of comments</span></div>
                <div className="stat" style={{ padding: 12 }}><b style={{ fontSize: 20 }}>{fmtNum(d.commenters.cross_post)}</b><span>accounts on 2+ posts · {fmtNum(d.commenters.cross_platform)} handles seen on 2+ platforms</span></div>
              </div>
              {d.commenters.first_time.series[0].data.some((v) => v != null) && <Chart spec={{ type: "line", x: d.commenters.first_time.x.map((h) => h.slice(5)), series: d.commenters.first_time.series, y_label: "% first-time" }} />}
              <p className="quiet" style={{ marginTop: 8 }}>A pile-on is mostly first-time accounts; a mobilised one shows repeat accounts across posts and the same handles on several platforms. Handles are matched as text, not as people.</p>
              <ul className="themes" style={{ marginTop: 10 }}>{d.commenters.top.slice(0, 5).map((c) => <li key={c.platform + c.handle}><b>@{c.handle}</b> <span>{label(c.platform)} · {fmtNum(c.comments)} comments on {fmtNum(c.posts)} posts · {fmtNum(c.likes)} likes{c.negative ? ` · ${fmtNum(c.negative)} negative` : ""}</span></li>)}</ul>
            </div>
          </div>
        </div>

        <div className="pulse-grid three">
          <div className="card">
            <h4>What they are saying <span>{(d.themes.summary as { sentiment?: string }).sentiment === "negative" ? "in negative comments" : "all comments, labels still landing"}</span></h4>
            <div className="body">
              {d.themes.status !== "ok" || !themeRows.length ? <p className="quiet">{d.themes.message ?? "Nothing recurring yet."}</p> : (
                <ul className="themes">{themeRows.map((r) => <li key={r.term}><b>{r.term}</b> <span>{fmtNum(r.comments)} · {r.share_pct}%</span>{r.examples[0] && <small>“{r.examples[0].slice(0, 110)}”</small>}</li>)}</ul>
              )}
              <Link className="askit" href={ask(`What are the main complaints in the negative comments about ${d.subject}?`)}>Ask about this</Link>
            </div>
          </div>
          <div className="card">
            <h4>Who is driving it <span>posts by comments drawn</span></h4>
            <div className="body">
              <ul className="themes">{driverRows.map((r) => <li key={r.url}><b>{r.source === "owned" ? `${d.subject} (own ${label(r.platform)})` : `@${r.account} · ${label(r.platform)}`}</b> <span>{fmtNum(r.comments)} comments{r.negative ? ` · ${fmtNum(r.negative)} neg` : ""}{r.stance ? ` · ${r.stance}` : ""}</span>{r.caption && <small>“{r.caption.slice(0, 100)}”</small>}</li>)}</ul>
              <Link className="askit" href={ask(`Which posts and accounts are driving the negative comments about ${d.subject}?`)}>Ask about this</Link>
            </div>
          </div>
          <div className="card">
            <h4>Coordinated patterns <span>{(d.seeding.summary as { signal?: string }).signal ?? ""}</span></h4>
            <div className="body">
              {!seedRows.length ? <p className="quiet">No coordinated pattern found. Organic so far.</p> : (
                <ul className="themes">{seedRows.map((r, i) => <li key={i}><b>{r.kind === "same_wording" ? `Same wording, ${r.accounts} accounts` : r.kind === "repeat_account" ? `${r.what}, ${r.comments} comments` : `Burst, ${r.accounts} first-time commenters`}</b> <span>{label(r.platform)} · {when(r.first_at)}</span><small>{r.kind === "same_wording" ? `“${r.what.slice(0, 100)}”` : r.kind === "burst" ? "on one post within ten minutes" : "across several posts"}</small></li>)}</ul>
              )}
              <p className="quiet" style={{ marginTop: 8 }}>Patterns, not proof: memes and pile-ons look like this too.</p>
              <Link className="askit" href={ask(`Is anyone seeding the comments about ${d.subject}?`)}>Ask about this</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A share of a base, blank where the base is too small to mean anything. */
const share = (n: number, base: number) => (base >= 10 ? Math.round((n / base) * 1000) / 10 : null);
/** "13 Sep 06:00 → 16 Sep 08:00, 75 hours" */
function trendSpan(d: PulseData): string {
  const p = d.trend.points;
  if (!p.length) return "no data yet";
  return `${when(p[0].h)} → ${when(p[p.length - 1].h)} · ${p.length} hours`;
}

/**
 * Where it stands right now. Every number is computed in SQL; the sentence only
 * chooses words for the direction of two of them, on bands wide enough that a
 * quiet hour cannot flip the verdict.
 */
function Now({ d }: { d: PulseData }) {
  const s = d.status;
  const move = (now: number, prev: number, band = 0.15) => (prev <= 0 ? (now > 0 ? 1 : 0) : (now - prev) / prev > band ? 1 : (now - prev) / prev < -band ? -1 : 0);
  const tone = (now: number | null, prev: number | null) => (now == null || prev == null ? 0 : now - prev > 3 ? 1 : now - prev < -3 ? -1 : 0);
  const vol = move(s.now6.comments, s.prev6.comments);
  const ton = tone(s.now6.negative_pct, s.prev6.negative_pct);
  const headline = `${vol > 0 ? "Getting louder" : vol < 0 ? "Quieting down" : "Holding steady"}, ${ton > 0 ? "and angrier" : ton < 0 ? "and less angry" : "and the tone has not moved"}.`;
  const per = (n: number, hours: number) => Math.round(n / hours);
  const delta = (now: number, prev: number) => (prev <= 0 ? null : Math.round(((now - prev) / prev) * 100));
  const cStep = delta(s.now6.comments, s.prev6.comments);
  const pStep = delta(s.now6.posts, s.prev6.posts);
  const nStep = s.now6.negative_pct != null && s.prev6.negative_pct != null ? Math.round((s.now6.negative_pct - s.prev6.negative_pct) * 10) / 10 : null;
  const dStep = s.now6.positive_pct != null && s.prev6.positive_pct != null ? Math.round((s.now6.positive_pct - s.prev6.positive_pct) * 10) / 10 : null;
  return (
    <div className="card now" style={{ marginBottom: 12 }}>
      <h4>How it is going <span>the last six hours against the six before · comments through {when(d.asOf)} WIB</span></h4>
      <div className="body">
        <p className="now-head">{headline}</p>
        <p className="quiet" style={{ marginTop: 2 }}>
          {fmtNum(s.now6.comments)} comments and {fmtNum(s.now6.posts)} posts in the last six hours — {fmtNum(per(s.now6.comments, 6))} comments an hour, against {fmtNum(per(s.prev6.comments, 6))} in the six before and {fmtNum(per(s.prev_day.comments, 24))} across the day before that.
          {s.now6.negative_pct != null && ` Of the comments about ${d.subject} in those hours, ${s.now6.negative_pct}% were negative and ${s.now6.positive_pct ?? 0}% defended her.`}
          {d.trend.peak && s.hours_since_peak != null && ` The busiest hour of the whole crisis was ${when(d.trend.peak.h)} WIB with ${fmtNum(d.trend.peak.comments)} comments, ${s.hours_since_peak} hours ago.`}
        </p>
        <div className="steps">
          <Step label="Comments an hour" value={fmtNum(per(s.now6.comments, 6))} step={cStep} suffix="%" good="down" sub={`${fmtNum(per(s.prev6.comments, 6))} in the previous six hours`} />
          <Step label="Posts an hour" value={fmtNum(per(s.now6.posts, 6))} step={pStep} suffix="%" good="down" sub={`${fmtNum(per(s.prev6.posts, 6))} in the previous six hours`} />
          <Step label="Negative" value={s.now6.negative_pct != null ? `${s.now6.negative_pct}%` : "–"} step={nStep} suffix="pp" good="down" sub={s.prev6.negative_pct != null ? `${s.prev6.negative_pct}% in the previous six hours` : "not enough comments before"} />
          <Step label={`Defending ${d.subject}`} value={s.now6.positive_pct != null ? `${s.now6.positive_pct}%` : "–"} step={dStep} suffix="pp" good="up" sub={s.prev6.positive_pct != null ? `${s.prev6.positive_pct}% in the previous six hours` : "not enough comments before"} />
        </div>
      </div>
      <div className="caveats">Volume and tone move separately: fewer comments at the same negative share means the crowd is thinning, not softening. The final hour is partial, so the rate reads slightly low.</div>
    </div>
  );
}

function Step({ label, value, step, suffix, good, sub }: { label: string; value: string; step: number | null; suffix: string; good: "up" | "down"; sub: string }) {
  const dir = step == null || step === 0 ? 0 : step > 0 ? 1 : -1;
  const ok = dir === 0 ? null : (dir > 0 ? "up" : "down") === good;
  return (
    <div className="step">
      <span className="lbl">{label}</span>
      <b>{value} {step != null && step !== 0 && <i style={{ color: ok ? "var(--green)" : "var(--red)" }}>{dir > 0 ? "▲" : "▼"} {Math.abs(step)}{suffix}</i>}</b>
      <span className="s">{sub}</span>
    </div>
  );
}

/** The posts still drawing a crowd. Sorted by what is alive now, not by what was loudest yesterday. */
function Watchlist({ d }: { d: PulseData }) {
  const live = [...d.watch].sort((a, b) => b.last6h - a.last6h || b.last24h - a.last24h || b.comments - a.comments);
  const byPlatform = new Map<string, WatchPost[]>();
  for (const w of live) byPlatform.set(w.platform, [...(byPlatform.get(w.platform) ?? []), w]);
  const order = [...byPlatform.entries()].sort((a, b) => b[1].reduce((s, w) => s + w.last24h, 0) - a[1].reduce((s, w) => s + w.last24h, 0));
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h4>Most commented posts, and which are still moving <span>top three per platform · a dot means it took comments in the last six hours</span></h4>
      <div className="tablewrap still" style={{ border: 0 }}>
        <table className="watch">
          <thead><tr><th>Post</th><th className="num">Comments</th><th className="num">Last 24h</th><th className="num">Last 6h</th><th className="num">Negative</th><th>Reach</th></tr></thead>
          <tbody>
            {order.map(([platform, rows]) => (
              <Fragment key={platform}>
                <tr className="group"><td colSpan={6}>{label(platform)}</td></tr>
                {rows.map((w) => <WatchRow key={w.url} w={w} subject={d.subject} />)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="caveats">This is where a reply lands or a fire keeps burning: a post that is still taking comments hours after it went up is the one to answer. Her own posts are marked, because a comment there is written to her, not about her.</div>
    </div>
  );
}

function WatchRow({ w, subject }: { w: WatchPost; subject: string }) {
  const noise = w.comments - w.on_topic;
  return (
    <tr>
      <td style={{ maxWidth: 480 }}>
        <span className="who">
          {w.last6h > 0 && <i className="dot" title="took comments in the last six hours" />}
          {w.source === "owned" ? <b>{subject}&apos;s own post</b> : <b>@{w.handle}</b>}
          <span className="quiet"> · {when(w.posted_at)}</span>
          {w.stance && w.source !== "owned" && <span className={`tag ${w.stance}`}>{w.stance === "negative" ? "against her" : w.stance === "positive" ? "defending her" : "neutral"}</span>}
        </span>
        <a href={w.url} target="_blank" rel="noreferrer" className="cap">“{w.caption || "no text in the export"}”</a>
      </td>
      <td className="num">{fmtNum(w.comments)}{noise > 0 && <small style={{ display: "block", color: "var(--text-3)" }}>{fmtNum(noise)} not about her</small>}</td>
      <td className="num">{fmtNum(w.last24h)}</td>
      <td className="num" style={{ fontWeight: w.last6h > 0 ? 700 : 400 }}>{fmtNum(w.last6h)}</td>
      <td className="num" style={{ color: w.negative_pct != null && w.negative_pct >= 50 ? "var(--red)" : undefined, fontWeight: 600 }}>
        {w.negative_pct == null ? "–" : `${w.negative_pct}%`}
        {w.positive > 0 && <small style={{ display: "block", color: "var(--text-3)", fontWeight: 400 }}>{fmtNum(w.positive)} defending</small>}
      </td>
      <td style={{ color: "var(--text-3)", fontSize: 12 }}>{w.views ? `${fmtNum(w.views)} views` : w.likes ? `${fmtNum(w.likes)} likes` : "–"}</td>
    </tr>
  );
}

/**
 * Commercial exposure: the line where a reputation problem starts costing money.
 * Boycott calls and the partner brands named beside the subject, counted only
 * against the words the workspace was given — so a quiet number here means quiet,
 * not "we did not look".
 */
function Exposure({ d }: { d: PulseData }) {
  const c = d.commercial;
  const step = c.posts_prev_24h > 0 ? Math.round(((c.posts_24h - c.posts_prev_24h) / c.posts_prev_24h) * 100) : null;
  const max = Math.max(1, ...c.daily.map((x) => x.posts + x.comments));
  const quiet = c.posts === 0 && c.comments === 0;
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h4>Commercial exposure <span>calls to boycott, and the partner brands named beside {d.subject}</span></h4>
      <div className="body">
        {quiet ? (
          <p className="quiet">Nobody is calling for a boycott yet, and no partner brand has been named. This card counts only the words this workspace was given — the boycott vocabulary and the partner brands on its watchlist.</p>
        ) : (
          <>
            <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 14 }}>
              <div className="stat" style={{ padding: 12 }}>
                <b style={{ fontSize: 20 }}>{fmtNum(c.posts)}</b>
                <span>posts calling for a boycott · {fmtNum(c.posts_24h)} in the last 24 hours{step != null ? `, ${step >= 0 ? "up" : "down"} ${Math.abs(step)}% on the day before` : ""}</span>
              </div>
              <div className="stat" style={{ padding: 12 }}>
                <b style={{ fontSize: 20 }}>{fmtNum(c.comments)}</b>
                <span>comments saying the same · {fmtNum(c.comments_24h)} in the last 24 hours, against {fmtNum(c.comments_prev_24h)} the day before</span>
              </div>
              <div className="stat" style={{ padding: 12 }}>
                <b style={{ fontSize: 20 }}>{fmtNum(Math.max(0, ...c.daily.map((x) => x.reach ?? 0)))}</b>
                <span>views on the largest of them</span>
              </div>
            </div>
            <p className="quiet" style={{ margin: "0 0 6px", fontWeight: 600 }}>Boycott calls per day, posts and comments together</p>
            <div className="expo-days">
              {c.daily.map((x) => (
                <div key={x.d} className="day" title={`${x.posts} posts · ${x.comments} comments`}>
                  <span className="col"><i style={{ height: `${Math.round(((x.posts + x.comments) / max) * 100)}%` }} /></span>
                  <b>{x.posts + x.comments}</b>
                  <span className="lbl">{when(x.d, true)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {c.partners.length > 0 && (
          <div className="tablewrap still" style={{ border: 0, marginTop: 8 }}>
            <table>
              <thead><tr><th>Partner brand</th><th className="num">Posts</th><th className="num">Comments</th><th className="num">Last 24h</th><th>First named</th><th>Last named</th></tr></thead>
              <tbody>
                {c.partners.map((p) => {
                  const live = p.posts_24h + p.comments_24h;
                  return (
                    <tr key={p.name}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="num">{fmtNum(p.posts)}</td>
                      <td className="num">{fmtNum(p.comments)}</td>
                      <td className="num" style={{ fontWeight: live ? 700 : 400, color: live ? "var(--red)" : undefined }}>{fmtNum(live)}</td>
                      <td style={{ color: "var(--text-3)", fontSize: 12 }}>{when(p.first_at)}</td>
                      <td style={{ color: "var(--text-3)", fontSize: 12 }}>{when(p.last_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!c.configured && !quiet && <p className="quiet" style={{ marginTop: 10 }}>No partner brands are on this workspace's watchlist yet, so only the boycott calls above are counted. Once they are added they are counted across the whole history, not just from that day.</p>}

        {c.top.length > 0 && (
          <ul className="themes" style={{ marginTop: 14 }}>
            {c.top.map((p) => (
              <li key={p.url}>
                <b>@{p.handle}</b> <span>{label(p.platform)} · {when(p.posted_at)} · {p.views ? `${fmtNum(p.views)} views` : p.likes ? `${fmtNum(p.likes)} likes` : "reach not reported"}</span>
                <small><a href={p.url} target="_blank" rel="noreferrer">“{p.caption}”</a></small>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="caveats">A boycott call is a post or comment using one of the workspace&apos;s boycott words; a partner is named when one of its words appears. Both are matched on text, so a mention is not the same as a threat — read the posts before you brief anyone.</div>
    </div>
  );
}

/** Owned against earned: the bar is the negative share, the width underneath is how much of the conversation sits there. */
function SourceBar({ label: l, comments, negative, total }: { label: string; comments: number; negative: number; total: number }) {
  const neg = pct(negative, comments);
  return (
    <div className="srow">
      <span className="lbl">{l}<small>{fmtNum(comments)} comments · {pct(comments, total) ?? 0}% of everything said about her</small></span>
      <span className="bar"><i style={{ width: `${neg ?? 0}%`, background: "var(--red)" }} /></span>
      <b style={{ color: neg != null && neg >= 50 ? "var(--red)" : undefined }}>{neg == null ? "–" : `${neg}%`}<small>negative</small></b>
    </div>
  );
}

function SplitRow({ label: l, s }: { label: string; s: { comments: number; labelled: number; negative: number } }) {
  const p = pct(s.negative, s.labelled);
  return <tr><td>{l}</td><td className="num">{fmtNum(s.comments)}</td><td className="num">{fmtNum(s.labelled)}</td><td className="num" style={{ fontWeight: 600, color: p != null && p >= 50 ? "var(--red, #c0392b)" : undefined }}>{p == null ? "–" : `${p}%`}</td></tr>;
}

function EventRow({ e }: { e: PulseEvent }) {
  const tone = e.kind === "root" ? "var(--blue)" : e.kind === "reply" ? "var(--green)" : e.kind === "peak" ? "var(--red, #c0392b)" : e.kind === "takeoff" ? "var(--amber)" : "var(--text-2)";
  return (
    <tr>
      <td style={{ whiteSpace: "nowrap", color: "var(--text-3)" }}>{when(e.at)}</td>
      <td>{label(e.platform)}</td>
      <td style={{ color: tone, fontWeight: e.kind === "root" || e.kind === "reply" || e.kind === "peak" ? 600 : 500 }}>{e.url ? <a href={e.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{e.what}</a> : e.what}</td>
      <td style={{ color: "var(--text-3)", fontSize: 12 }}>{e.detail}</td>
    </tr>
  );
}
