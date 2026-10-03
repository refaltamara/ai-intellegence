/**
 * The Social Media dashboard (DECISIONS, 3 Oct 2026): a brand's own accounts, standard for
 * every social team. Every figure comes from src/social/dashboard.ts; "Ask CeMO" opens Chats
 * with a question, never numbers.
 */
import Link from "next/link";
import { change, compact, dayMonth, int, pct, pts } from "@/competitor/view";
import { BAND_HOURS, BAND_ORDER, type Kpi, type OwnPost, type Quote, type SocialData } from "@/social/dashboard";
import { PrFilters } from "../reputation/PrFilters";

const PF: Record<string, string> = { tiktok: "TT", instagram: "IG", threads: "TH", x: "X", youtube: "YT" };
const PLATFORM: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };
const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ask = (q: string) => `/?q=${encodeURIComponent(q)}`;
const pf = (p: string) => <span className={`pf ${p}`}>{PF[p] ?? p}</span>;
const times = (x: number) => (x >= 100 ? `×${int(x)}` : `×${x.toFixed(1)}`);

function Delta({ k, kind, ok, good = "up" }: { k: Kpi; kind: "count" | "pct"; ok: boolean; good?: "up" | "down" }) {
  if (!ok || k.now == null || k.prev == null) return <span className="delta flat">Too few posts before to compare</span>;
  const diff = k.now - k.prev;
  const dir = Math.abs(diff) < 1e-9 ? "flat" : (diff > 0) === (good === "up") ? "up" : "down";
  return <span className={`delta ${dir}`}>{kind === "count" ? change(k.now, k.prev) : pts(k.now, k.prev)} vs before</span>;
}

function PostLine({ p, extra }: { p: OwnPost; extra?: string }) {
  return (
    <li className="prpost">
      {pf(p.platform)}
      <div>
        <a href={p.url} target="_blank" rel="noreferrer"><b>{p.handle ? `@${p.handle}` : "Own account"}</b><span className="tag">{p.format}</span></a>
        <p>{p.caption || <i className="muted">No caption</i>}</p>
        <small>{dayMonth(p.posted_at)} · {int(p.engagements)} engagements{p.views != null ? ` · ${compact(p.views)} views` : ""} · {int(p.comments)} comments{p.neg_pct != null ? `, ${pct(p.neg_pct)} negative` : ""}{extra ? ` · ${extra}` : ""}</small>
      </div>
    </li>
  );
}

function QuoteLine({ q }: { q: Quote }) {
  return (
    <blockquote className="prq">
      <p>“{q.text.length > 200 ? q.text.slice(0, 198) + "…" : q.text}”</p>
      {q.translation && q.translation !== q.text && <small className="tr">{q.translation.length > 180 ? q.translation.slice(0, 178) + "…" : q.translation}</small>}
      <footer>{pf(q.platform)}{q.likes > 0 ? `${int(q.likes)} like${q.likes === 1 ? "" : "s"} · ` : ""}<a href={q.url} target="_blank" rel="noreferrer">Open post ↗</a></footer>
    </blockquote>
  );
}

export function SocialDashboard({ d, client }: { d: SocialData; client: string | null }) {
  const f = d.filters;
  const who = d.focus.name;
  const range = `${dayMonth(f.from)} to ${dayMonth(f.to)}`;
  const k = d.kpis;
  const ok = d.comparable;
  const weeks = Math.max(1, f.days / 7);
  const tiles = [
    { key: "posts", label: "Posts", value: int(k.posts.now ?? 0), delta: <Delta k={k.posts} kind="count" ok={ok} />, sub: `${((k.posts.now ?? 0) / weeks).toFixed(1)} a week from own accounts`, tone: "blue" },
    { key: "eng", label: "Engagement", value: compact(k.engagements.now), delta: <Delta k={k.engagements} kind="count" ok={ok} />, sub: "Likes, comments, shares and saves as each platform counts them", tone: "violet" },
    { key: "med", label: "Typical post", value: k.median_eng.now == null ? "–" : int(k.median_eng.now), delta: <Delta k={k.median_eng} kind="count" ok={ok} />, sub: "Median engagement per post", tone: "mint" },
    { key: "views", label: "Typical video views", value: compact(k.video_views.now), delta: <Delta k={k.video_views} kind="count" ok={ok} />, sub: "Median, where the platform reports views", tone: "blue" },
    { key: "neg", label: "Negative comments", value: pct(k.neg_pct.now), delta: <Delta k={k.neg_pct} kind="pct" ok={ok} good="down" />, sub: `${int(k.comments.now ?? 0)} comments under these posts`, tone: "coral" },
    { key: "reply", label: "Reply rate", value: pct(k.reply_rate.now), delta: <Delta k={k.reply_rate} kind="pct" ok={ok} />, sub: "Brand replies per comment", tone: "mint" },
  ];
  const maxEng = Math.max(1, ...d.timing.map((t) => t.median_eng ?? 0));
  const cell = (dow: number, band: string) => d.timing.find((t) => t.dow === dow && t.band === band);
  const bestCell = [...d.timing].filter((t) => t.median_eng != null).sort((a, b) => (b.median_eng ?? 0) - (a.median_eng ?? 0))[0];
  return (
    <section className="screen dash pr social">
      <div className="topbar">
        <div><h1>Dashboard</h1><span className="meta">{who}&apos;s own accounts · {range} vs the {f.days} days before · data through {dayMonth(d.as_of)} {d.as_of.slice(0, 4)}</span></div>
        <PrFilters brand={f.brand} days={f.days} platform={f.platform} brands={d.brands} platforms={d.platforms} client={client} windows={[7, 30, 90]} def={30} />
      </div>
      <div className="wrap wide">
        {d.notes.length > 0 && <div className="dcaveats">{d.notes.map((c) => <p key={c}>{c}</p>)}</div>}

        <div className="kpis six">
          {tiles.map((t) => (
            <div className="kpi" data-tone={t.tone} key={t.key}>
              <span className="label">{t.label}</span>
              <b>{t.value}</b>
              {t.delta}
              <small>{t.sub}</small>
            </div>
          ))}
        </div>

        <div className="dsection">
          <header><h2>Needs attention</h2><span>Posts from the last week doing under half of their account&apos;s usual for their age, or drawing a wave of negative comments.{d.curve.length >= 4 ? ` Own posts here collect about ${pct(d.curve[1].share * 100, 0)} of their first-week likes by day 1 and ${pct(d.curve[3].share * 100, 0)} by day 3, so day one tells.` : ""}</span></header>
          <div className="dcard">
            {d.watch.length === 0 ? <div className="empty">Nothing under-performing or drawing a comment storm in the last week.</div> : (
              <ul className="prposts">{d.watch.map((w) => <PostLine key={w.url} p={w} extra={w.why === "storm" ? "comment storm" : `day ${w.day}, about ${int(w.expected)} expected by now`} />)}</ul>
            )}
          </div>
        </div>

        <div className="dsection">
          <header><h2>Accounts</h2><span>Each of {who}&apos;s own accounts in {range}.</span></header>
          <div className="dcard tablewrap still">
            {d.accounts.length === 0 ? <div className="empty">No own posts in these days.</div> : (
              <table><thead><tr><th>Account</th><th className="num">Posts</th><th className="num">A week</th><th className="num">Typical post</th><th className="num">Typical views</th><th className="num">Eng. rate</th><th className="num">Comments</th><th className="num">Negative</th><th className="num">Replies</th></tr></thead>
                <tbody>{d.accounts.map((a) => (
                  <tr key={a.platform + a.handle}><td>{pf(a.platform)}@{a.handle}</td><td className="num">{int(a.posts)}</td><td className="num">{a.per_week.toFixed(1)}</td><td className="num">{int(a.median_eng)}</td><td className="num">{a.median_views == null ? "–" : compact(a.median_views)}</td><td className="num">{a.er == null ? "–" : pct(a.er, 2)}</td><td className="num">{int(a.comments)}</td><td className="num">{pct(a.neg_pct)}</td><td className="num">{int(a.replies)}</td></tr>))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="two-eq">
          <div className="dsection">
            <header><h2>Formats</h2><span>Share of posts against share of engagement: a format above the line earns more than its share.</span></header>
            <div className="dcard">
              {d.formats.length === 0 ? <div className="empty">No own posts in these days.</div> : (
                <div className="fmtbars">
                  {d.formats.map((x) => (
                    <div key={x.format} className="fmt">
                      <b>{x.format}</b>
                      <div className="bars"><i className="p" style={{ width: `${x.post_share ?? 0}%` }} /><i className="e" style={{ width: `${x.eng_share ?? 0}%` }} /></div>
                      <small>{pct(x.post_share, 0)} of posts · {pct(x.eng_share, 0)} of engagement · typical {int(x.median_eng)}{x.median_views != null ? ` · ${compact(x.median_views)} views` : ""}</small>
                    </div>
                  ))}
                  <p className="legend"><i className="p" /> posts <i className="e" /> engagement</p>
                </div>
              )}
            </div>
          </div>
          <div className="dsection">
            <header><h2>When to post</h2><span>Typical engagement by day and time (WIB); cells with fewer than three posts are blank.{bestCell ? ` Best: ${DOW[bestCell.dow]} ${bestCell.band.toLowerCase()}.` : ""}</span></header>
            <div className="dcard">
              <table className="heat"><thead><tr><th />{BAND_ORDER.map((b) => <th key={b}>{b}<small>{BAND_HOURS[b]}</small></th>)}</tr></thead>
                <tbody>{[1, 2, 3, 4, 5, 6, 7].map((dow) => (
                  <tr key={dow}><th>{DOW[dow]}</th>{BAND_ORDER.map((b) => {
                    const c = cell(dow, b);
                    const v = c?.median_eng ?? null;
                    return <td key={b} title={c ? `${int(c.posts)} posts${v != null ? `, typical ${int(v)}` : ""}` : "no posts"} style={v != null ? { background: `rgba(15,168,151,${0.12 + 0.75 * (v / maxEng)})` } : undefined}>{v != null ? compact(v) : c ? <small>{c.posts}</small> : ""}</td>;
                  })}</tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="two-eq">
          <div className="dsection">
            <header><h2>Best posts</h2><span>Against their own account&apos;s typical post in {range}.</span></header>
            <div className="dcard">{d.best.length === 0 ? <div className="empty">No account has enough measured posts to compare.</div> : <ul className="prposts">{d.best.map((p) => <PostLine key={p.url} p={p} extra={p.index != null ? `${times(p.index)} the account's usual` : undefined} />)}</ul>}</div>
          </div>
          <div className="dsection">
            <header><h2>Weakest posts</h2><span>The ones to learn from, against the same account&apos;s usual.</span></header>
            <div className="dcard">{d.weakest.length === 0 ? <div className="empty">No account has enough measured posts to compare.</div> : <ul className="prposts">{d.weakest.map((p) => <PostLine key={p.url} p={p} extra={p.index != null ? `${times(p.index)} the account's usual` : undefined} />)}</ul>}</div>
          </div>
        </div>

        <div className="dsection">
          <header><h2>Competitors&apos; own channels</h2><span>Every brand&apos;s own accounts on the same measures, {range}.</span></header>
          <div className="dcard tablewrap still">
            <table><thead><tr><th>Brand</th><th className="num">Posts</th><th className="num">A week</th><th className="num">Typical post</th><th className="num">Typical views</th><th className="num">Comments</th><th className="num">Negative</th><th>Best post</th></tr></thead>
              <tbody>{d.competitors.map((c) => (
                <tr key={c.id} className={c.is_focus ? "me" : ""}><td><b>{c.name}</b></td><td className="num">{int(c.posts)}</td><td className="num">{c.per_week.toFixed(1)}</td><td className="num">{int(c.median_eng)}</td><td className="num">{c.median_views == null ? "–" : compact(c.median_views)}</td><td className="num">{int(c.comments)}</td><td className="num">{pct(c.neg_pct)}</td>
                  <td className="q">{c.top ? <a href={c.top.url} target="_blank" rel="noreferrer">{pf(c.top.platform)}{int(c.top.engagements)} · {c.top.caption.slice(0, 70)}{c.top.caption.length > 70 ? "…" : ""}</a> : <span className="muted">–</span>}</td></tr>))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dsection">
          <header><h2>Community</h2><span>What people say under {who}&apos;s own posts in {range}: topics, how they lean, and who wants to buy.</span>
            <Link className="askwhy" href={ask(`Draft replies to the most-liked comments under ${who}'s own posts between ${dayMonth(f.from)} and ${dayMonth(f.to)}.`)}>Draft replies</Link></header>
          <div className="two-eq">
            <div className="dcard tablewrap still">
              <table><thead><tr><th>Topic</th><th className="num">Comments</th><th className="num">Share</th><th className="num">Negative</th><th className="num">Purchase intent</th></tr></thead>
                <tbody>{d.topics.map((t) => <tr key={t.topic}><td>{t.topic}</td><td className="num">{int(t.comments)}</td><td className="num">{pct(t.share)}</td><td className="num">{pct(t.neg_pct)}</td><td className="num">{pct(t.intent_pct)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="dcard">
              <h4>Liked most, positive</h4>
              {d.quotes.positive.map((q, i) => <QuoteLine key={i} q={q} />)}
              <h4>Liked most, negative</h4>
              {d.quotes.negative.map((q, i) => <QuoteLine key={i} q={q} />)}
            </div>
          </div>
        </div>

        <div className="dsection">
          <header><h2>Data health</h2><span>Own-account capture per brand and platform. A day with far more posts than an account publishes is flagged above.</span>
            <Link className="askwhy" href={ask(`What worked on ${who}'s own accounts between ${dayMonth(f.from)} and ${dayMonth(f.to)}, and what should we post next week?`)}>Ask CeMO what to post next</Link></header>
          <div className="dcard tablewrap still">
            <table><thead><tr><th>Brand</th><th>Platform</th><th>Accounts</th><th className="num">Own posts</th><th>Captured</th><th className="num">Busiest day</th></tr></thead>
              <tbody>{d.capture.map((c) => (
                <tr key={c.brand + c.platform} className={c.brand === who ? "me" : ""}><td>{c.brand}</td><td>{pf(c.platform)}{PLATFORM[c.platform] ?? c.platform}</td><td>{c.handles.map((h) => `@${h}`).join(", ")}</td><td className="num">{int(c.posts)}</td><td>{dayMonth(c.first)} to {dayMonth(c.last)}</td><td className={`num ${c.busiest >= 20 ? "down" : ""}`}>{int(c.busiest)}{c.busiest_day ? ` · ${dayMonth(c.busiest_day)}` : ""}</td></tr>))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
