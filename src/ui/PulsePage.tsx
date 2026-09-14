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
  const ask = (q: string) => `/?q=${encodeURIComponent(q)}`;
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Pulse</h1><span className="meta">What is being said about {d.subject}, across {t.platforms} platforms</span></div>
        <span className="pill live">Comments through {d.asOf} WIB</span>
      </div>
      <div className="wrap wide">
        <div className="stats">
          <div className="stat"><b>{fmtNum(t.comments)}</b><span>comments from {fmtNum(t.accounts)} accounts on {fmtNum(t.posts)} posts</span></div>
          <div className="stat"><b style={{ color: negPct != null && negPct >= 50 ? "var(--red, #c0392b)" : undefined }}>{negPct != null ? `${negPct}%` : "–"}</b><span>{t.labelled ? `negative, of ${fmtNum(t.labelled)} labelled${t.labelled < t.comments ? ` · ${fmtNum(t.comments - t.labelled)} still unlabelled` : ""}` : "negative · labelling has not started"}</span></div>
          <div className="stat"><b>{sum.spike_started ? when(sum.spike_started, sum.bucket === "day") : "–"}</b><span>{sum.spike_started ? `negative comments spiked${sum.bucket === "day" ? "" : " (hourly)"}; peak ${when(sum.peak_bucket ?? null, sum.bucket === "day")} with ${fmtNum(sum.peak_negative)}` : "no spike yet by the rule"}</span></div>
          <div className="stat"><b>{fmtNum(t.earned_posts)}</b><span>posts by other accounts about {d.subject}</span></div>
        </div>

        <div className="pulse-grid">
          <div className="card">
            <h4>Last 72 hours, comments per hour <span>by platform · WIB</span></h4>
            <div className="body">{d.hourly.x.length >= 3 ? <Chart spec={{ type: "stacked_bar", x: d.hourly.x.map((h) => h.slice(5)), series: d.hourly.series, y_label: "comments" }} /> : <p className="quiet">Not enough hours of data yet.</p>}</div>
          </div>
          <div className="card">
            <h4>Since the video went up, comments per day <span>by platform</span></h4>
            <div className="body">{d.daily.x.length >= 3 ? <Chart spec={{ type: "stacked_bar", x: d.daily.x.map((h) => h.slice(5)), series: d.daily.series, y_label: "comments" }} /> : <p className="quiet">Not enough days of data yet.</p>}</div>
            {d.root && <div className="caveats">YouTube comment times older than a day come rounded from the export (“3 weeks ago”), so early days are approximate.</div>}
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
