"use client";
/** What a Pulse card shows, by kind. Numbers arrive computed (src/pulses/cards.ts); this only lays them out. */
import Link from "next/link";
import { change as changeText, compact, dayMonth, hourLabel, int, PATTERN_NAME, patternSignal, pct, postingBehind, productName, pts, TIER_NAME } from "@/competitor/view";
import { askHref, type AskRef } from "@/dashboard/askref";
import type { CardData, RenderedCard } from "@/pulses/cards";
import { Chart } from "../Chart";
import { MentionsChart } from "../dashboard/MentionsChart";

const TIER_SHORT: Record<string, string> = { nano: "Nano", micro: "Micro", mid: "Mid-tier", macro: "Macro", mega: "Mega" };
const TIER_TONE: Record<string, string> = { nano: "mint", micro: "blue", mid: "violet", macro: "sun", mega: "coral" };

function Delta({ c, prev, points }: { c: Extract<CardData, { kind: "kpi" }>["change"]; prev: string; points?: boolean }) {
  if (!c) return <span className="delta flat">No {prev} to compare</span>;
  if (c.isNew) return <span className="delta up">New vs {prev}</span>;
  const v = c.pct ?? 0;
  const text = points ? pts(v, 0, 2) : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;
  return <span className={`delta ${v > 0 ? "up" : v < 0 ? "down" : "flat"}`}>{text} vs {prev}</span>;
}

function cell(v: unknown): string {
  if (v == null) return "–";
  if (typeof v === "number") return Math.abs(v) >= 100_000 ? compact(v) : Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(2);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export function CardBody({ card, names, onRefresh, refreshing }: { card: RenderedCard; names: Map<string, string>; onRefresh?: () => void; refreshing?: boolean }) {
  const d = card.data;
  const base = card.ask as Omit<AskRef, "k">;
  const prev = card.period.prev;
  switch (d.kind) {
    case "kpi":
      return (
        <div className="pc-kpi">
          <b>{d.metric === "er" ? pct(d.now, 2) : d.metric === "posts" ? int(d.now ?? 0) : compact(d.now)}</b>
          <Delta c={d.change} prev={prev} points={d.metric === "er"} />
          <small>{d.sub}</small>
          <Link className="askwhy" href={askHref({ ...base, k: "kpi", metric: d.metric })}>Ask why</Link>
        </div>
      );
    case "rankings":
      return d.rows.length ? (
        <table className="pc-table">
          <thead><tr><th>#</th><th>Brand</th><th className="num">Views</th><th className="num">Content</th><th className="num">ER</th><th className="num">Growth</th><th /></tr></thead>
          <tbody>
            {d.rows.map((r, i) => (
              <tr key={r.brand_id}>
                <td className="muted">{i + 1}</td>
                <td><Link href={`/data/${r.brand_id}`} className="bn">{r.name}</Link>{r.flags.length > 0 && <span className="umark" title="Unusual for this brand" />}</td>
                <td className="num strong">{compact(r.views)}</td>
                <td className="num">{int(r.posts)}</td>
                <td className={`num ${r.er_ranked ? "" : "muted"}`}>{pct(r.er, 2)}</td>
                <td className={`num gr ${r.views_change?.isNew ? "new" : (r.views_change?.pct ?? 0) >= 0 ? "up" : "down"}`}>{r.prev ? changeText(r.views, r.prev.views) : "–"}</td>
                <td className="askcell"><Link className="askwhy" href={askHref({ ...base, k: "brand", brand: r.brand_id })}>Ask why</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">No brand has content in {card.period.label}.</div>;
    case "trend":
      return <MentionsChart weeks={d.weeks} series={d.series} base={base} chosen={d.chosen} />;
    case "tiers":
      return (
        <div className="pc-tiers">
          {d.tiers.map((t) => (
            <Link key={t.tier} className="pc-tier" data-tone={TIER_TONE[t.tier]} href={askHref({ ...base, k: "tier", tier: t.tier })} title="Ask why">
              <span className="top"><b>{TIER_SHORT[t.tier]}</b><span>{pct(t.share_pct)}</span></span>
              <span className="bar"><i style={{ width: `${Math.min(100, t.share_pct ?? 0)}%` }} /></span>
              <small>{int(t.creators)} creators · {int(t.posts)} posts · {compact(t.views)} views · ER {pct(t.er, 2)}</small>
            </Link>
          ))}
        </div>
      );
    case "creators":
      return d.rows.length ? (
        <ol className="creators">
          {d.rows.map((c, i) => (
            <li key={c.creator_id}>
              <span className="n">{i + 1}</span>
              <div className="who">
                {c.profile_url ? <a href={c.profile_url} target="_blank" rel="noreferrer">@{c.handle}</a> : <b>@{c.handle}</b>}
                <small><span className={`pf ${c.platform}`}>{c.platform === "tiktok" ? "TT" : "IG"}</span>{c.tier ? TIER_SHORT[c.tier] : "Unknown tier"} · {int(c.posts)} post{c.posts === 1 ? "" : "s"} · {c.brands.slice(0, 2).map((b) => names.get(b) ?? b).join(", ")}</small>
              </div>
              <span className="v">{card.config.by === "comments" ? int(c.comments) : compact(c.views)}<small>{card.config.by === "comments" ? "comments" : "views"}</small></span>
              <Link className="askwhy" href={askHref({ ...base, k: "creator", creator: c.creator_id })}>Ask why</Link>
            </li>
          ))}
        </ol>
      ) : <div className="empty">No creator posts in {card.period.label}.</div>;
    case "content":
      return d.cards.length ? (
        <div className="postgrid">
          {d.cards.map((c) => (
            <article className="postcard" key={c.url}>
              <header><span className={`pf ${c.platform}`}>{c.platform === "tiktok" ? "TT" : "IG"}</span><b>{c.handle ? `@${c.handle}` : "Unknown account"}</b><time>{dayMonth(c.posted_at)}</time></header>
              <p>{c.caption || <i className="muted">No caption</i>}</p>
              <div className="tags">{c.brands.slice(0, 3).map((b) => <span key={b} className="tag">{names.get(b) ?? b}</span>)}</div>
              <dl><div><dt>Views</dt><dd>{compact(c.views)}</dd></div><div><dt>Engagement</dt><dd>{c.engagements == null ? "–" : compact(c.engagements)}</dd></div><div><dt>ER</dt><dd>{pct(c.er, 2)}</dd></div></dl>
              <footer><a href={c.url} target="_blank" rel="noreferrer">Open post ↗</a><Link className="askwhy" href={askHref({ ...base, k: "post", url: c.url })}>Ask why</Link></footer>
            </article>
          ))}
        </div>
      ) : <div className="empty">No posts match.</div>;
    case "tier_mix":
      return d.rows.length ? (
        <div className="pc-mix">
          <div className="legend">{["nano", "micro", "mid", "macro", "mega"].map((t) => <span key={t}><i className={`t-${t}`} />{TIER_NAME[t]}</span>)}</div>
          <table className="pc-table">
            <thead><tr><th>Brand</th><th className="num">Creator posts</th><th>Share of content</th><th>Share of views</th><th>Biggest tier by views</th></tr></thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.key} className={r.client ? "client" : ""}>
                  <td><Link className="bn" href={askHref({ ...base, k: "brand", brand: r.key })} title="Ask why">{r.name}</Link></td>
                  <td className="num">{int(r.posts)}</td>
                  <td><span className="mixbar">{r.tiers.map((t) => t.posts > 0 ? <i key={t.tier} className={`t-${t.tier}`} style={{ flexGrow: t.posts }} title={`${TIER_NAME[t.tier]} ${t.content_share}%`} /> : null)}</span></td>
                  <td><span className="mixbar">{r.tiers.map((t) => t.views > 0 ? <i key={t.tier} className={`t-${t.tier}`} style={{ flexGrow: t.views }} title={`${TIER_NAME[t.tier]} ${t.views_share}%`} /> : null)}</span></td>
                  <td className="muted">{r.top ? `${TIER_NAME[r.top.tier]} · ${int(r.top.posts)} posts · ${compact(r.top.views)} (${r.top.views_share}%)` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <small className="muted">Median views per creator post: {d.benchmark.filter((b) => b.median_views != null && b.posts >= 5).map((b) => `${TIER_NAME[b.tier]} ${compact(b.median_views)}`).join(" · ") || "–"}. Brand accounts left out.</small>
        </div>
      ) : <div className="empty">No creator posts in {card.period.label}.</div>;
    case "products":
      return d.rows.length ? (
        <table className="pc-table">
          <thead><tr><th>Brand</th><th>Categories named in captions (posts · views)</th><th>In the TikTok cart</th><th className="num">Names none</th></tr></thead>
          <tbody>
            {d.rows.map((p) => (
              <tr key={p.key} className={p.client ? "client" : ""}>
                <td><Link className="bn" href={askHref({ ...base, k: "brand", brand: p.key })} title="Ask why">{p.name}</Link></td>
                <td><span className="cats">{p.categories.map((c) => <span key={c.key} className="tag">{c.label} <b>{int(c.posts)}</b> · {compact(c.views)}</span>)}</span></td>
                <td className="muted">{p.cart.slice(0, 2).map((c) => `${productName(c.name)} (${int(c.posts)})`).join("; ") || "–"}</td>
                <td className="num muted">{p.unnamed_share}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">No posts in {card.period.label}.</div>;
    case "posting": {
      const P = d.posting;
      const max = Math.max(1, ...P.days.map((x) => x.posts));
      return (
        <div className="pc-posting">
          <div className="days" style={{ ["--n" as string]: P.days.length }}>
            {P.days.map((x) => (
              <span key={x.date} className={x.current ? "cur" : ""} title={`${dayMonth(x.date)}: ${int(x.posts)} posts, ${int(x.promo_posts)} with promo language`}>
                <i style={{ height: `${(x.posts / max) * 100}%` }} />
              </span>
            ))}
          </div>
          <div className="axis"><span>{dayMonth(P.days[0]?.date ?? "")}</span><span>{prev} · then {card.period.label}</span><span>{dayMonth(P.days[P.days.length - 1]?.date ?? "")}</span></div>
          <table className="pc-table">
            <thead><tr><th>Brand</th><th>Peak day</th><th>Concentration</th><th>What sits behind it</th></tr></thead>
            <tbody>
              {P.brands.map((b) => (
                <tr key={b.key} className={b.client ? "client" : ""}>
                  <td><b>{b.name}</b></td>
                  <td>{b.peak_day ? dayMonth(b.peak_day) : "–"}</td>
                  <td>{b.peak_posts_share}% of posts, {b.peak_views_share}% of views</td>
                  <td className="muted">{postingBehind(b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {P.window && <small className="muted">{P.window.share}% of posts go up between {hourLabel(P.window.from)} and {hourLabel(P.window.to)}{P.peak_hour != null ? `, peaking at ${hourLabel(P.peak_hour)}` : ""}.</small>}
        </div>
      );
    }
    case "closeup": {
      const c = d.closeup;
      if (!c) return <div className="empty">No posts for this brand in {card.period.label}.</div>;
      return (
        <div className="pc-closeup">
          <div className="stats">
            <div><b>{int(c.posts)}</b><small>content</small></div>
            <div><b>{compact(c.views)}</b><small>views</small></div>
            <div><b>{compact(c.likes)}</b><small>likes</small></div>
            <div><b>{c.er != null ? `${c.er.toFixed(1)}%` : "–"}</b><small>eng. rate</small></div>
          </div>
          <dl>{d.lines.map((l) => <div key={l.label}><dt>{l.label}</dt><dd className={l.muted ? "muted" : ""}>{l.text}</dd></div>)}</dl>
          <div className="pc-foot">
            {c.top_post ? <a href={c.top_post.url} target="_blank" rel="noreferrer">Top post {c.top_post.handle ? `@${c.top_post.handle}` : ""} · {compact(c.top_post.views)} ↗</a> : <span />}
            <Link className="askwhy" href={askHref({ ...base, k: "brand", brand: c.key })}>Ask why</Link>
          </div>
        </div>
      );
    }
    case "patterns":
      return d.patterns.length ? (
        <ul className="pc-patterns">
          {d.patterns.map((p, i) => (
            <li key={`${p.kind}-${p.key}-${i}`}>
              <span className="pk">{PATTERN_NAME[p.kind]}</span>
              <div>
                <b>{p.name}</b> <span className="muted">{patternSignal(p)}</span>
                <small>{int(p.accounts)} account{p.accounts === 1 ? "" : "s"} · {int(p.posts)} post{p.posts === 1 ? "" : "s"} · {compact(p.views)} views · {p.views_share}% of the brand's views</small>
              </div>
              {p.examples[0] ? <a href={p.examples[0].url} target="_blank" rel="noreferrer">{p.examples[0].handle ? `@${p.examples[0].handle}` : "post"} ↗</a> : <span />}
            </li>
          ))}
        </ul>
      ) : <div className="empty">No clippers, seeding tags, affiliate bursts or one-creator weeks in {card.period.label}.</div>;
    case "skill":
      return (
        <div className="pc-skill">
          {d.status !== "ok" && <p className="muted">{d.message ?? `The analysis returned ${d.status}.`}</p>}
          {d.chart && d.chart.series?.length ? <div className="chart"><Chart spec={d.chart} /></div> : null}
          {d.rows.length > 0 && (
            <table className="pc-table">
              <thead><tr>{d.columns.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
              <tbody>{d.rows.map((r, i) => <tr key={i}>{d.columns.map((c) => <td key={c} className={typeof r[c] === "number" ? "num" : ""}>{cell(r[c])}</td>)}</tr>)}</tbody>
            </table>
          )}
          <div className="pc-foot">
            <span className="muted">{d.rows_total} row{d.rows_total === 1 ? "" : "s"}{d.window ? ` · ${dayMonth(d.window.from)}–${dayMonth(d.window.to)}` : ""}{d.ran_at ? ` · run ${new Date(d.ran_at).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" })}` : ""}</span>
            {onRefresh && <button className="btn sm" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Running…" : "Refresh"}</button>}
          </div>
        </div>
      );
    case "error":
      return <div className="errbox">{d.message}</div>;
  }
}
