/**
 * The PR dashboard (DECISIONS, 3 Oct 2026): the reputation view every PR team needs,
 * whatever the company. Status first (Calm → Watch → Issue → Crisis → Recovering),
 * then the issues building and whether they are about us or the whole category, what
 * is rising, the narratives, the amplifiers, our own channels and the customer-service
 * list, the competitive view, and data health. Every figure comes from
 * src/reputation/dashboard.ts; "Ask CeMO" opens Chats with a question, never numbers.
 */
import Link from "next/link";
import { change, compact, dayMonth, int, pct, pts } from "@/competitor/view";
import type { Issue, Kpi, Level, PostRef, PostsComments, PrDashboardData, Quote, Split } from "@/reputation/dashboard";
import { PrFilters } from "./PrFilters";
import { LadderDrawer } from "./LadderDrawer";
import { Sections } from "../dashboard/Sections";
import { Customise } from "../dashboard/Customise";
import type { DashLayout } from "@/dashboard/sections";

const PF: Record<string, string> = { tiktok: "TT", instagram: "IG", threads: "TH", x: "X", youtube: "YT" };
const PLATFORM: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };
const LEVEL: Record<Level, { label: string; tone: string; line: string }> = {
  calm: { label: "Calm", tone: "calm", line: "Nothing out of the ordinary." },
  watch: { label: "Watch", tone: "watch", line: "Negative talk is above normal. Keep an eye on it." },
  issue: { label: "Issue", tone: "issue", line: "Negative talk is well above its normal level. Decide whether to respond." },
  crisis: { label: "Crisis", tone: "crisis", line: "Negative talk is far above normal, at volume. Escalate." },
  recovering: { label: "Recovering", tone: "recovering", line: "Back to normal after an issue in the last week. Watch for a second wave." },
};
const SCOPE: Record<Issue["scope"], { label: string; tone: string }> = {
  only_us: { label: "Only us", tone: "issue" },
  category: { label: "Whole category", tone: "recovering" },
  mixed: { label: "Us and some others", tone: "watch" },
};
const STAGE: Record<Issue["stage"], string> = { building: "Building", peaking: "Peaking", fading: "Fading", steady: "Steady" };

const ask = (q: string) => `/?q=${encodeURIComponent(q)}`;
const pf = (p: string) => <span className={`pf ${p}`}>{PF[p] ?? p}</span>;

function Delta({ k, kind, good = "up" }: { k: Kpi; kind: "count" | "pct" | "score"; good?: "up" | "down" }) {
  if (k.now == null || k.prev == null) return <span className="delta flat">No earlier window to compare</span>;
  const diff = k.now - k.prev;
  const dir = Math.abs(diff) < 1e-9 ? "flat" : (diff > 0) === (good === "up") ? "up" : "down";
  const text = kind === "count" ? change(k.now, k.prev) : kind === "pct" ? pts(k.now, k.prev) : `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)}`;
  return <span className={`delta ${dir}`}>{text} vs previous</span>;
}

function QuoteLine({ q }: { q: Quote }) {
  return (
    <blockquote className="prq">
      <p>“{q.text.length > 220 ? q.text.slice(0, 218) + "…" : q.text}”</p>
      {q.translation && q.translation !== q.text && <small className="tr">{q.translation.length > 200 ? q.translation.slice(0, 198) + "…" : q.translation}</small>}
      <footer>{pf(q.platform)}{q.likes > 0 ? `${int(q.likes)} like${q.likes === 1 ? "" : "s"} · ` : ""}{q.theme && q.theme !== "unknown" ? `${q.theme} · ` : ""}<a href={q.url} target="_blank" rel="noreferrer">Open post ↗</a></footer>
    </blockquote>
  );
}

const STANCE: Record<string, { label: string; tone: string }> = { negative: { label: "against", tone: "down" }, positive: { label: "defending", tone: "up" }, neutral: { label: "neutral", tone: "" } };

function PostLine({ p, extra }: { p: PostRef; extra?: string }) {
  // Threads reports no views: likes stand in, and a post that is a voice itself shows its own stance
  const reach = p.views != null ? `${compact(p.views)} views` : p.likes != null ? `${int(p.likes)} likes` : "– views";
  const st = p.stance ? STANCE[p.stance] : null;
  return (
    <li className="prpost">
      {pf(p.platform)}
      <div>
        <a href={p.url} target="_blank" rel="noreferrer"><b>{p.handle ? `@${p.handle}` : "Unknown account"}</b>{p.source === "owned" ? <span className="tag me">own post</span> : null}{st ? <span className={`tag ${st.tone}`}>{st.label}</span> : null}</a>
        <p>{p.caption || <i className="muted">No caption</i>}</p>
        <small>{dayMonth(p.posted_at)} · {reach}{p.comments || !st ? ` · ${int(p.comments)} comments${p.negative ? `, ${int(p.negative)} negative` : ""}` : ""}{extra ? ` · ${extra}` : ""}</small>
      </div>
    </li>
  );
}

const sharePct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** Posts and comments apart: how many, and how many lean against and for. */
function SplitTable({ sp, who, compact: small }: { sp: PostsComments; who: string; compact?: boolean }) {
  const row = (label: string, x: Split, against: string) => (
    <tr>
      <td>{label}</td><td className="num">{int(x.n)}</td>
      <td className="num down">{int(x.negative)}<small> {x.labelled ? `${pct(sharePct(x.negative, x.labelled))}` : ""}</small></td>
      <td className="num up">{int(x.positive)}<small> {x.labelled ? `${pct(sharePct(x.positive, x.labelled))}` : ""}</small></td>
      {!small && <td className="num muted">{int(x.neutral)}</td>}
      <td className="muted" style={{ fontSize: 11 }}>{x.n > x.labelled ? `${int(x.n - x.labelled)} not read yet` : against}</td>
    </tr>
  );
  return (
    <table className="prsplit">
      <thead><tr><th></th><th className="num">Total</th><th className="num">Negative</th><th className="num">Positive</th>{!small && <th className="num">Neutral</th>}<th></th></tr></thead>
      <tbody>
        {row("Posts", sp.posts, `against or defending ${who}`)}
        {row("Comments", sp.comments, "under those posts")}
      </tbody>
    </table>
  );
}

/** One stacked bar: negative, neutral, positive, and what is still unread. */
function LeanBar({ label, x, neg, pos }: { label: string; x: Split; neg: string; pos: string }) {
  const w = (v: number) => `${x.n ? (v / x.n) * 100 : 0}%`;
  return (
    <div className="prlean">
      <span className="lbl"><b>{int(x.n)}</b> {label}</span>
      <span className="bar">
        <i style={{ width: w(x.negative), background: "var(--red)" }} title={`${int(x.negative)} ${neg}`} />
        <i style={{ width: w(x.neutral), background: "#94A3B8" }} title={`${int(x.neutral)} neutral`} />
        <i style={{ width: w(x.positive), background: "var(--green)" }} title={`${int(x.positive)} ${pos}`} />
        <i style={{ width: w(x.n - x.labelled), background: "var(--line)" }} title={`${int(x.n - x.labelled)} not read yet`} />
      </span>
      <span className="nums"><b className="down">{pct(sharePct(x.negative, x.labelled))}</b> {neg} · <b className="up">{pct(sharePct(x.positive, x.labelled))}</b> {pos}{x.n > x.labelled ? ` · ${int(x.n - x.labelled)} not read yet` : ""}</span>
    </div>
  );
}

function Bars({ data, max }: { data: { d: string; negative: number }[]; max: number }) {
  return (
    <div className="prbars" aria-label="Negative comments per day">
      {data.map((x) => <i key={x.d} title={`${dayMonth(x.d)}: ${int(x.negative)} negative`} style={{ height: `${Math.max(2, (x.negative / Math.max(1, max)) * 100)}%` }} />)}
    </div>
  );
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
  const said = withPosts ? "posts and comments" : "comments";
  const noNorm = st.baseline.neg_pct == null && !!st.day && st.level === "calm";
  const cv = d.conversation;
  const P = cv.now.posts, Cm = cv.now.comments;
  const shareK = (x: Split, k: "negative" | "positive"): number | null => sharePct(x[k], x.labelled);
  // around one subject: the posts and the comments each get their own tiles, so it is clear which is which
  const caseTiles: typeof tilesBase = [
    { key: "mentions", label: "Posts about " + who, value: int(k.mentions.now ?? 0), delta: <Delta k={k.mentions} kind="count" />, sub: `${int(P.labelled)} by other accounts carry a stance`, tone: "blue" },
    { key: "against", label: "Posts against", value: pct(shareK(P, "negative")), delta: <Delta k={{ now: shareK(P, "negative"), prev: shareK(cv.prev.posts, "negative") }} kind="pct" good="down" />, sub: `${int(P.negative)} posts; ${int(P.positive)} defending ${who}`, tone: "coral" },
    { key: "comments", label: "Comments", value: int(Cm.n), delta: <Delta k={{ now: Cm.n, prev: cv.prev.comments.n }} kind="count" />, sub: Cm.n > Cm.labelled ? `${int(Cm.n - Cm.labelled)} not read yet` : "under those posts; off-topic left out", tone: "mint" },
    { key: "neg", label: "Comments negative", value: pct(shareK(Cm, "negative")), delta: <Delta k={{ now: shareK(Cm, "negative"), prev: shareK(cv.prev.comments, "negative") }} kind="pct" good="down" />, sub: `${int(Cm.negative)} comments; ${int(Cm.positive)} defending ${who}`, tone: "coral" },
  ];
  const tilesBase: { key: string; label: string; value: string; delta: React.ReactNode; sub: string; tone: string }[] = [
    { key: "mentions", label: "Mentions", value: int(k.mentions.now ?? 0), delta: <Delta k={k.mentions} kind="count" />, sub: `Posts about ${who}`, tone: "blue" },
    { key: "reach", label: "Reach", value: k.reach.now == null ? "–" : compact(k.reach.now), delta: k.reach.now == null ? <span className="delta flat">Not reported</span> : <Delta k={k.reach} kind="count" />, sub: k.reach.now == null ? "These platforms report no views" : "Views of those posts", tone: "violet" },
    { key: "comments", label: withPosts ? "Posts and comments" : "Comments", value: int(k.comments.now ?? 0), delta: <Delta k={k.comments} kind="count" />, sub: withPosts ? `${int(d.voice_posts)} posts with a stance, and the comments under them; ${who}'s own replies left out` : "Under those posts; brand replies left out", tone: "mint" },
    { key: "neg", label: "Negative", value: pct(k.neg_pct.now), delta: <Delta k={k.neg_pct} kind="pct" good="down" />, sub: `Share of labelled ${said}`, tone: "coral" },
    { key: "csat", label: "CSAT", value: k.csat.now == null ? "–" : k.csat.now.toFixed(2), delta: <Delta k={k.csat} kind="score" />, sub: "Average of 1 to 5, per comment", tone: "blue" },
    { key: "intent", label: "Purchase intent", value: pct(k.intent_pct.now), delta: <Delta k={k.intent_pct} kind="pct" />, sub: "Comments that want to buy or sign up", tone: "mint" },
  ];
  const extra = tilesBase.filter((t) => ["reach", "csat", "intent"].includes(t.key));
  // a case workspace leaves out what does not apply (settings.pr.hide: status, reach, csat, intent)
  const tiles = (withPosts ? [...caseTiles, ...extra] : tilesBase).filter((t) => !hide.includes(t.key));
  const showStatus = !hide.includes("status");
  const ampViews = d.amplifiers.some((a) => a.views > 0);
  // a section with nothing it could measure here stays out: service needs comment themes, the competitive view a second brand
  const unmeasured = new Set([...(d.service.measured ? [] : ["service"]), ...(d.brands.length > 1 ? [] : ["competitive"]), ...(d.conversation.by_voice.length ? [] : ["voices"])]);
  const maxIssue = Math.max(1, ...d.issues.flatMap((i) => i.daily.map((x) => x.negative)));
  const render: Record<string, (t: string) => React.ReactNode> = {
    issues: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><span>The topics carrying {who}&apos;s negative {said} in {range}{d.brands.length > 1 ? ", and whether the same complaint hits the other brands" : ""}.</span></header>
        {d.issues.length === 0 ? <div className="dcard empty">No topic carries enough negative {said} about {who} in these days to call an issue.</div> : (
          <div className="prissues">
            {d.issues.map((i) => {
              const sc = SCOPE[i.scope];
              return (
                <article className="dcard prissue" key={i.topic_id ?? i.topic}>
                  <header>
                    <h3>{i.topic}</h3>
                    {d.brands.length > 1 && <span className={`chip ${sc.tone}`}>{sc.label}</span>}
                    <span className="chip">{STAGE[i.stage]}</span>
                  </header>
                  {withPosts ? (
                    <div className="nums">
                      <SplitTable sp={i.split} who={who} compact />
                      <Bars data={i.daily} max={maxIssue} />
                    </div>
                  ) : <div className="nums">
                    <div><b>{int(i.negative)}</b><small>negative {said}<br />{i.negative_prev ? `${change(i.negative, i.negative_prev)} vs previous` : "none before"}</small></div>
                    <div><b>{pct(i.neg_pct)}</b><small>of {int(i.comments)} {said} on it{d.brands.length > 1 && <><br />others: {pct(i.industry.neg_pct)}</>}</small></div>
                    <Bars data={i.daily} max={maxIssue} />
                  </div>}
                  <p className="scope">
                    {d.brands.length < 2 ? "" : i.scope === "only_us" ? `${who}'s negative share on this topic is well above the other brands' (${pct(i.neg_pct)} against ${pct(i.industry.neg_pct)}). It is about us.` : i.scope === "category" ? `The other brands see the same or worse${i.industry.brands_up.length ? ` (${i.industry.brands_up.join(", ")})` : ""}: a category complaint, not ours alone.` : `Some other brands see it too${i.industry.brands_up.length ? ` (${i.industry.brands_up.join(", ")})` : ""}, but not the whole category.`}
                    {d.brands.length < 2 ? "" : " "}Mostly on {i.platforms.slice(0, 2).map((p) => PLATFORM[p.platform] ?? p.platform).join(" and ")}{i.peak_day ? `; peak ${dayMonth(i.peak_day)}` : ""}.
                  </p>
                  {i.themes.length > 0 && <div className="prthemes">{i.themes.map((t) => <span className="tag" key={t.theme}>{t.theme} · {int(t.n)}</span>)}</div>}
                  {i.quotes.slice(0, 2).map((q, n) => <QuoteLine key={n} q={q} />)}
                  {i.posts.length > 0 && <><h4>Where it happens</h4><ul className="prposts">{i.posts.slice(0, 2).map((p) => <PostLine key={p.url} p={p} />)}</ul></>}
                  <footer>
                    <Link className="askwhy" href={ask(`Why are ${i.catch_all ? "complaints outside our topics" : `"${i.topic}" complaints`} about ${who} building between ${dayMonth(f.from)} and ${dayMonth(f.to)}? Is it only us?`)}>Ask CeMO</Link>
                    <Link className="askwhy" href={ask(`Draft a holding statement for ${who} on the ${i.catch_all ? "complaints outside our topics" : `"${i.topic}"`} negative comments between ${dayMonth(f.from)} and ${dayMonth(f.to)}, with a short Q&A for spokespeople.`)}>Draft holding statement</Link>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
    ),
    rising: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><span>Posts about {who} from the last three days by views (likes where views are not reported), with where they are likely to end up from how posts here usually grow.</span></header>
        <div className="dcard">
          {d.rising.length === 0 ? <div className="empty">No new posts about {who} in the last three days.</div> : (
            <ul className="prposts">{d.rising.map((r) => <PostLine key={r.url} p={r} extra={r.projected && r.views != null && r.projected > r.views * 1.05 ? `likely about ${compact(r.projected)} views` : r.neg_pct != null ? `${pct(r.neg_pct)} of comments negative` : undefined} />)}</ul>
          )}
        </div>
      </div>
    ),
    amplifiers: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><span>The accounts whose posts about {who} reached most people in {range}, and how {ampViews ? "the comments under them" : "their posts"} leaned.</span></header>
        <div className="dcard tablewrap still">
          {d.amplifiers.length === 0 ? <div className="empty">No creator posts about {who} in these days.</div> : (
            <table><thead><tr><th>Account</th><th className="num">{ampViews ? "Reach" : "Likes"}</th><th className="num">Comments</th><th className="num">{ampViews || d.amplifiers.some((a) => a.neg_pct != null) ? "Negative" : "Stance"}</th></tr></thead>
              <tbody>{d.amplifiers.map((a) => (
                <tr key={a.platform + a.handle}>
                  <td>{pf(a.platform)}<a href={a.top_url} target="_blank" rel="noreferrer">@{a.handle}</a><small className="muted"> {a.tier ? a.tier : ""}{a.followers ? ` · ${compact(a.followers)} followers` : ""}{a.posts > 1 ? ` · ${a.posts} posts` : ""}</small></td>
                  <td className="num">{ampViews ? compact(a.views) : int(a.likes)}</td><td className="num">{int(a.comments)}</td>
                  <td className={`num ${(a.neg_pct != null && a.neg_pct >= 25) || (a.neg_pct == null && a.stanced > 0 && a.against * 2 > a.stanced) ? "down" : ""}`}>{a.neg_pct != null ? pct(a.neg_pct) : a.stanced === 1 ? (a.against ? "against" : "not against") : a.stanced > 1 ? `${int(a.against)} of ${int(a.stanced)} against` : "–"}</td>
                </tr>))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    ),
    narratives: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><span>What people say about {who}, by topic: how much of the conversation each holds, and how it leans.</span></header>
        <div className="dcard tablewrap still">
          <table className="prnarr"><thead><tr><th>Topic</th>{withPosts ? <><th className="num">Posts</th><th className="num">Against</th><th className="num">Comments</th><th className="num">Negative</th></> : <th className="num">Comments</th>}<th className="num">Share</th><th className="num">Change</th>{!withPosts && <th className="num">Negative</th>}{!hide.includes("csat") && <th className="num">CSAT</th>}<th>In their words</th></tr></thead>
            <tbody>{d.narratives.filter((x) => x.comments > 0).map((x) => (
              <tr key={x.topic_id}>
                <td><b>{x.catch_all ? `${x.topic} (no topic fits)` : x.topic}</b></td>
                {withPosts ? <>
                  <td className="num">{int(x.split.posts.n)}</td><td className="num down">{pct(sharePct(x.split.posts.negative, x.split.posts.labelled))}</td>
                  <td className="num">{int(x.split.comments.n)}</td><td className="num down">{pct(sharePct(x.split.comments.negative, x.split.comments.labelled))}</td>
                </> : <td className="num">{int(x.comments)}</td>}
                <td className="num">{pct(x.share)}</td>
                <td className="num">{change(x.comments, x.comments_prev)}</td>
                {!withPosts && <td className="num">{pct(x.neg_pct)} <small className={x.neg_pct != null && x.neg_pct_prev != null && x.neg_pct > x.neg_pct_prev ? "down" : "up"}>{pts(x.neg_pct, x.neg_pct_prev)}</small></td>}
                {!hide.includes("csat") && <td className="num">{x.csat == null ? "–" : x.csat.toFixed(2)}</td>}
                <td className="q">{x.quote ? <a href={x.quote.url} target="_blank" rel="noreferrer">“{x.quote.text.length > 110 ? x.quote.text.slice(0, 108) + "…" : x.quote.text}”</a> : "–"}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    ),
    voices: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><span>Which side each post and comment about {who} is written from, and how it leans, in {range}.</span></header>
        <div className="dcard tablewrap still">
          <table><thead><tr><th>Voice</th><th className="num">Posts</th><th className="num">Against</th><th className="num">Defending</th><th className="num">Comments</th><th className="num">Negative</th><th className="num">Defending</th></tr></thead>
            <tbody>{d.conversation.by_voice.map((v) => (
              <tr key={v.voice}>
                <td><b>{v.voice === "unclear" ? "Not clear" : v.voice}</b></td>
                <td className="num">{int(v.posts.n)}</td><td className="num down">{pct(sharePct(v.posts.negative, v.posts.labelled))}</td><td className="num up">{pct(sharePct(v.posts.positive, v.posts.labelled))}</td>
                <td className="num">{int(v.comments.n)}</td><td className="num down">{pct(sharePct(v.comments.negative, v.comments.labelled))}</td><td className="num up">{pct(sharePct(v.comments.positive, v.comments.labelled))}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    ),
    own: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><span>How {who}&apos;s own posts were received in {range}{d.brands.length > 1 ? ", against the other brands' own posts" : ""}.</span></header>
        <div className="dcard">
          {d.own.length === 0 ? <div className="empty">{who} posted nothing tracked in these days.</div> : (
            <div className="tablewrap still"><table><thead><tr><th>Platform</th><th className="num">Posts</th><th className="num">Comments</th><th className="num">Negative</th>{d.brands.length > 1 && <th className="num">Others</th>}<th className="num">Replies</th></tr></thead>
              <tbody>{d.own.map((o) => (
                <tr key={o.platform}><td>{pf(o.platform)}{PLATFORM[o.platform] ?? o.platform}</td><td className="num">{int(o.posts)}</td><td className="num">{int(o.comments)}</td>
                  <td className={`num ${o.neg_pct != null && o.others_neg_pct != null && o.neg_pct > o.others_neg_pct * 1.5 ? "down" : ""}`}>{pct(o.neg_pct)}</td>{d.brands.length > 1 && <td className="num muted">{pct(o.others_neg_pct)}</td>}<td className="num">{int(o.replies)}</td></tr>))}
              </tbody></table></div>
          )}
          {d.own_worst.length > 0 && <><h4>Received worst</h4><ul className="prposts">{d.own_worst.map((p) => <PostLine key={p.url} p={p} />)}</ul></>}
        </div>
      </div>
    ),
    service: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><span>Negative comments about payments, refunds, accounts and the app: service problems to hand over, not reputation stories.</span></header>
        <div className="dcard">
          <p className="prbig"><b>{int(d.service.total)}</b> service complaints about {who} in {range}</p>
          {d.service.quotes.slice(0, 4).map((q, n) => <QuoteLine key={n} q={q} />)}
          <footer className="prfoot"><Link className="askwhy" href={ask(`List the service complaints about ${who} between ${dayMonth(f.from)} and ${dayMonth(f.to)} for customer service: what the problem is, the post and the comment.`)}>Ask CeMO for the hand-off list</Link></footer>
        </div>
      </div>
    ),
    competitive: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><span>Every brand on the same measures, {range}{scopeWord}. Share of voice is of posts about the brands; negative is of labelled comments.</span></header>
        <div className="dcard tablewrap still">
          <table><thead><tr><th>Brand</th><th className="num">Posts</th><th className="num">Share of voice</th><th className="num">Reach</th><th className="num">Comments</th><th className="num">Negative</th><th className="num">CSAT</th><th className="num">Purchase intent</th><th>Issue building</th></tr></thead>
            <tbody>{d.competitive.map((b) => (
              <tr key={b.id} className={b.is_focus ? "me" : ""}>
                <td><b>{b.name}</b>{b.is_client ? <span className="tag me">you</span> : null}</td>
                <td className="num">{int(b.posts)}</td><td className="num">{pct(b.sov)}</td><td className="num">{compact(b.views)}</td><td className="num">{int(b.comments)}</td>
                <td className="num">{pct(b.neg_pct)} <small className={b.neg_pct != null && b.neg_pct_prev != null && b.neg_pct > b.neg_pct_prev ? "down" : "up"}>{pts(b.neg_pct, b.neg_pct_prev)}</small></td>
                <td className="num">{b.csat == null ? "–" : b.csat.toFixed(2)}</td><td className="num">{pct(b.intent_pct)}</td>
                <td>{b.top_issue ? <>{b.top_issue.topic} <small className="muted">{int(b.top_issue.negative)} negative, {change(b.top_issue.negative, b.top_issue.negative_prev)}</small></> : <span className="muted">–</span>}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    ),
    health: (t) => (
      <div className="dsection">
        <header><h2>{t}</h2><span>What is tracked, since when, and what is left out. Posts that do not name their brand stay stored but never count.</span></header>
        <div className="dcard tablewrap still">
          <table><thead><tr><th>Platform</th><th>Tracked</th><th className="num">Posts</th><th className="num">Not about the brand</th><th className="num">Comments read</th><th className="num">Comments the posts report</th></tr></thead>
            <tbody>{d.coverage.map((c) => (
              <tr key={c.platform}><td>{pf(c.platform)}{PLATFORM[c.platform] ?? c.platform}</td><td>{dayMonth(c.first)} to {dayMonth(c.last)}</td><td className="num">{int(c.posts)}</td>
                <td className="num">{int(c.off_topic)} <small className="muted">{pct((c.off_topic / Math.max(1, c.posts)) * 100, 0)}</small></td><td className="num">{int(c.comments)}</td><td className="num">{int(c.reported_comments)}</td></tr>))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  };
  return (
    <section className="screen dash pr">
      <div className="topbar">
        <div><h1>Dashboard</h1><span className="meta">{who} · {range}{scopeWord} vs the {f.days} days before · data through {dayMonth(d.as_of)} {d.as_of.slice(0, 4)}</span></div>
        <div className="topright">
          <PrFilters brand={f.brand} days={f.days} platform={f.platform} brands={d.brands} platforms={d.platforms} client={client} />
          <Customise sections={layout.all} builder={view.builder} codename={view.codename} client={view.clientName} />
        </div>
      </div>
      <div className="wrap wide">
        {d.notes.length > 0 && <div className="dcaveats">{d.notes.map((c) => <p key={c}>{c}</p>)}</div>}

        {!showStatus && withPosts && (
          <div className="dcard prconv">
            <LeanBar label={`posts about ${who}`} x={P} neg="against" pos={`defending ${who}`} />
            <LeanBar label="comments under them" x={Cm} neg="negative" pos={`defending ${who}`} />
          </div>
        )}
        {showStatus && <div className={`prstatus ${noNorm ? "nonorm" : L.tone}`}>
          <div className="lv">
            <span className="dot" />
            <div><small>Reputation status · {st.day ? dayMonth(st.day.d) : "–"}</small><b>{noNorm ? "No norm yet" : L.label}</b></div>
          </div>
          <div className="prwhy">
            <p>{noNorm ? null : <b>{L.line}</b>} {st.reason}</p>
            <div className="prladder" aria-label="Status over the last 30 days">
              {st.history.map((h) => <i key={h.d} className={h.norm ? h.level : "none"} title={`${dayMonth(h.d)}: ${h.norm ? LEVEL[h.level].label : "no norm yet"}${h.neg_pct != null ? `, ${h.neg_pct}% negative of ${int(h.comments)}` : ""}`} />)}
            </div>
            <small className="rule">{st.rule} {view.alert && <LadderDrawer brand={f.brand} alert={view.alert} builder={view.builder} />}</small>
          </div>
          {(st.level !== "calm" || noNorm) && <Link className="btn sm" href={ask(`What is driving the negative talk about ${who} around ${st.day ? dayMonth(st.day.d) : "the latest day"}, and should we respond?`)}>Ask CeMO</Link>}
        </div>}

        <div className={`kpis ${tiles.length >= 6 ? "six" : tiles.length === 5 ? "five" : "four"}`}>
          {tiles.map((t) => (
            <div className="kpi" data-tone={t.tone} key={t.key}>
              <span className="label">{t.label}</span>
              <b>{t.value}</b>
              {t.delta}
              <small>{t.sub}</small>
            </div>
          ))}
        </div>

        <Sections arranged={{ ...layout, shown: layout.shown.filter((x) => !unmeasured.has(x.key)) }} render={render} who={hiddenFor} showHref={showHref} />
      </div>
    </section>
  );
}
