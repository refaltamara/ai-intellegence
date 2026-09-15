import Link from "next/link";
import type { PulseData, PulseEvent } from "@/pulse/page";
import { Chart } from "@/ui/Chart";
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
  const negPct = pct(t.negative, t.labelled);
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
          <div className="stat"><b>{fmtNum(t.comments)}</b><span>comments from {fmtNum(t.accounts)} accounts, on {fmtNum(t.posts_with_comments)} posts</span></div>
          <div className="stat"><b style={{ color: negPct != null && negPct >= 50 ? "var(--red, #c0392b)" : undefined }}>{negPct != null ? `${negPct}%` : "–"}</b><span>{t.labelled ? `negative, of ${fmtNum(t.labelled)} labelled${t.labelled < t.comments ? ` · ${fmtNum(t.comments - t.labelled)} still unlabelled` : ""}` : "negative · labelling has not started"}</span></div>
          <div className="stat"><b style={{ color: againstPct != null && againstPct >= 50 ? "var(--red, #c0392b)" : undefined }}>{againstPct != null ? `${againstPct}%` : "–"}</b><span>{t.posts_stance_labelled ? `of posts are against ${d.subject}, of ${fmtNum(t.posts_stance_labelled)} with a stance${t.earned_posts > t.posts_stance_labelled ? ` · ${fmtNum(t.earned_posts - t.posts_stance_labelled - t.posts_no_caption)} waiting, ${fmtNum(t.posts_no_caption)} have no text in the export` : ""}` : `posts by other accounts · ${fmtNum(t.earned_posts)} waiting for a stance`}</span></div>
          <div className="stat"><b>{fmtNum(t.earned_posts)}</b><span>posts by other accounts about {d.subject}{sum.spike_started ? ` · comments spiked ${when(sum.spike_started, sum.bucket === "day")}` : ""}</span></div>
        </div>

        <div className="pulse-grid">
          <div className="card">
            <h4>Posts about {d.subject} per hour <span>by other accounts · last 72 hours · WIB</span></h4>
            <div className="body">{d.posts_hourly.series.length ? <Chart spec={{ type: "stacked_bar", x: d.posts_hourly.x.map((h) => h.slice(5)), series: d.posts_hourly.series, y_label: "posts" }} /> : <p className="quiet">No posts by other accounts in the last 72 hours.</p>}
              {d.posts_daily.series.length > 0 && <><p className="quiet" style={{ margin: "10px 0 4px", fontWeight: 600 }}>Posts by other accounts per day, since the video went up</p><Chart spec={{ type: "stacked_bar", x: d.posts_daily.x.map((h) => h.slice(5)), series: d.posts_daily.series, y_label: "posts" }} /></>}
            </div>
            <div className="caveats">The density of the conversation itself: new Threads, tweets and videos about {d.subject}, separate from the replies under them. Instagram and YouTube capture {d.subject}&apos;s own posts only.</div>
          </div>
          <div className="card">
            <h4>Posts per hour by stance <span>against, neutral, for</span></h4>
            <div className="body">{d.posts_hourly_stance.series.length ? <Chart spec={{ type: "stacked_bar", x: d.posts_hourly_stance.x.map((h) => h.slice(5)), series: d.posts_hourly_stance.series, y_label: "posts" }} /> : <p className="quiet">No posts by other accounts in the last 72 hours.</p>}</div>
            <div className="caveats">Stance is what the post itself says about {d.subject}. The replies under it are counted as comment sentiment, below.</div>
          </div>
        </div>

        {lag && <p className="lag">Comments are loaded through {when(d.asOf)} WIB; the post charts above run to {when(d.postsAsOf)}. The comment sections below cover the earlier window.</p>}

        <div className="pulse-grid">
          <div className="card">
            <h4>Comments per hour <span>last 72 hours of comment data · by platform · WIB</span></h4>
            <div className="body">{d.hourly.x.length >= 3 ? <Chart spec={{ type: "stacked_bar", x: d.hourly.x.map((h) => h.slice(5)), series: d.hourly.series, y_label: "comments" }} /> : <p className="quiet">Not enough hours of data yet.</p>}</div>
          </div>
          <div className="card">
            <h4>Since the video went up, comments per day <span>by platform</span></h4>
            <div className="body">{d.daily.x.length >= 3 ? <Chart spec={{ type: "stacked_bar", x: d.daily.x.map((h) => h.slice(5)), series: d.daily.series, y_label: "comments" }} /> : <p className="quiet">Not enough days of data yet.</p>}</div>
            {d.root && <div className="caveats">YouTube comment times older than a day come rounded from the export (“3 weeks ago”), so early days are approximate.</div>}
          </div>
        </div>

        <div className="pulse-grid">
          <div className="card">
            <h4>Is the mood moving? <span>negative share of labelled comments per hour · blank under 10 labelled</span></h4>
            <div className="body">{d.negative_trend.series[0].data.some((v) => v != null) ? <Chart spec={{ type: "line", x: d.negative_trend.x.map((h) => h.slice(5)), series: d.negative_trend.series, y_label: "% negative" }} /> : <p className="quiet">Not enough labelled comments per hour yet.</p>}</div>
            {t.labelled < t.comments && <div className="caveats">Labelling is still running and works post by post, so some hours are labelled unevenly until it finishes.</div>}
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
            <h4>Per platform <span>negative share of labelled comments</span></h4>
            <div className="tablewrap still" style={{ border: 0 }}>
              <table>
                <thead><tr><th>Platform</th><th className="num">Posts</th><th className="num">Comments</th><th className="num">Negative</th><th>First post</th><th>Peak hour</th></tr></thead>
                <tbody>{d.spread.map((s) => (
                  <tr key={s.platform}>
                    <td>{label(s.platform)}</td><td className="num">{fmtNum(s.posts)}</td><td className="num">{fmtNum(s.comments)}</td>
                    <td className="num">{s.labelled ? `${pct(s.negative, s.labelled)}%` : "–"}{s.labelled && s.labelled < s.comments ? <small style={{ color: "var(--text-3)" }}> of {fmtNum(s.labelled)}</small> : null}</td>
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
