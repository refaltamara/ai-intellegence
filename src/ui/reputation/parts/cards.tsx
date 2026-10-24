/**
 * The PR dashboard's larger cards around one subject: posts and comments apart, a platform of a case, a watched
 * post, and the day-by-day table. Presentation only.
 */
import { compact, dayMonth, int, pct } from "@/competitor/view";
import type { PlatformSplit, PostsComments, Quote, Split } from "@/reputation/dashboard";
import type { Daily, Lean, Watched } from "@/reputation/daily";
import { SUB } from "../../kit/Table";
import { Empty } from "../../kit/Section";
import { cn } from "../../cn";
import { AskLink, PlatformTag, Tag } from "../../dashboard/parts";
import { ask, Figures, H4, ITEM_CARD, LeanStrip, MiniBars, MiniTable, MUTED, NEG, negOf, PLATFORM, POS, QuoteLine, sharePct, TD, TD_NUM, TH, TH_NUM, time, TR, VoiceDot, voiceColor, voiceName } from "./common";

/** Posts and comments apart: how many, and how many lean against and for. */
export function SplitTable({ sp, who, compact: small }: { sp: PostsComments; who: string; compact?: boolean }) {
  const row = (label: string, x: Split, against: string) => (
    <tr className={TR}>
      <td className={TD}>{label}</td><td className={TD_NUM}>{int(x.n)}</td>
      <td className={cn(TD_NUM, NEG)}>{int(x.negative)}<small className="ml-1 text-xs"> {x.labelled ? `${pct(sharePct(x.negative, x.labelled))}` : ""}</small></td>
      <td className={cn(TD_NUM, POS)}>{int(x.positive)}<small className="ml-1 text-xs"> {x.labelled ? `${pct(sharePct(x.positive, x.labelled))}` : ""}</small></td>
      {!small && <td className={cn(TD_NUM, MUTED)}>{int(x.neutral)}</td>}
      <td className={cn(TD, "text-xs text-gray-500")}>{x.n > x.labelled ? `${int(x.n - x.labelled)} not read yet` : against}</td>
    </tr>
  );
  return (
    <MiniTable head={<><th className={TH}><span className="sr-only">Kind</span></th><th className={TH_NUM}>Total</th><th className={TH_NUM}>Negative</th><th className={TH_NUM}>Positive</th>{!small && <th className={TH_NUM}>Neutral</th>}<th className={TH}><span className="sr-only">Note</span></th></>}>
      {row("Posts", sp.posts, `against or defending ${who}`)}
      {row("Comments", sp.comments, "under those posts")}
    </MiniTable>
  );
}

/** One platform of a case: its post, the crowd under it by label, the topics, and the pace hour by hour. */
export function PlatformCard({ x, who }: { x: PlatformSplit; who: string }) {
  const c = x.comments;
  const p = x.top_post;
  const onTopic = x.topics.reduce((a, t) => a + t.n, 0);
  return (
    <article className={ITEM_CARD}>
      <header className="flex flex-wrap items-center gap-2">
        <PlatformTag p={x.platform} />
        <h3 className="text-base font-semibold text-gray-900">{PLATFORM[x.platform] ?? x.platform}</h3>
        <small className="text-xs text-gray-500">{int(x.posts.n)} post{x.posts.n === 1 ? "" : "s"}{x.posts.labelled ? ` · ${int(x.posts.negative)} against ${who}` : ""}</small>
      </header>
      {p && (
        <a href={p.url} target="_blank" rel="noreferrer" className="flex flex-col gap-1 rounded-2xl bg-gray-50 p-3 text-sm text-gray-700 hover:bg-brand-palette-50">
          <span><b className="font-semibold text-gray-900">@{p.handle ?? "brand account"}</b> · {dayMonth(p.posted_at.slice(0, 10))} {time(p.posted_at)} WIB</span>
          <span className="leading-relaxed">“{p.caption.length > 140 ? p.caption.slice(0, 138) + "…" : p.caption}”</span>
        </a>
      )}
      {c.n === 0 ? <Empty>No comments loaded for {PLATFORM[x.platform] ?? x.platform} yet.</Empty> : (
        <>
          <Figures items={[
            { v: int(c.n), sub: <>comments about {who}{x.other ? ` · ${int(x.other)} about something else` : ""}</> },
            { v: pct(sharePct(c.negative, c.labelled)), sub: <>negative · {pct(sharePct(c.positive, c.labelled))} defending</>, tone: "neg" },
            { v: x.first_after_min != null ? `${int(x.first_after_min)} min` : "–", sub: "to the first comment" },
          ]} />
          <LeanStrip negative={c.negative} neutral={c.neutral} positive={c.positive} n={Math.max(1, c.n)} title={`${int(c.negative)} negative · ${int(c.neutral)} neutral · ${int(c.positive)} defending`} />
          <H4>What they talk about</H4>
          <ul className="flex flex-col gap-1.5">{x.topics.map((t) => (
            <li key={t.topic} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-3 text-sm">
              <span className="truncate text-gray-700" title={t.topic}>{t.catch_all ? `${t.topic} (no topic fits)` : t.topic}</span>
              <span className="block h-2 overflow-hidden rounded-full bg-gray-100"><i className="block h-full rounded-full bg-brand-palette-600" style={{ width: `${(t.n / Math.max(1, onTopic)) * 100}%` }} /></span>
              <span className="whitespace-nowrap text-right tabular-nums"><b className="font-semibold text-gray-900">{pct(sharePct(t.n, onTopic), 0)}</b> <small className="text-xs text-gray-500">{int(t.n)}</small></span>
            </li>
          ))}</ul>
          <H4>Pace, {x.bucket === "hour" ? "comments an hour, WIB" : "comments a day"}</H4>
          <MiniBars label="Comments over time" data={x.series.map((s) => ({ key: s.at, v: s.n, title: `${x.bucket === "hour" ? `${dayMonth(s.at.slice(0, 10))} ${time(s.at)}` : dayMonth(s.at)}: ${int(s.n)} comments` }))} />
          <small className="text-xs text-gray-500">{x.series.length ? `${x.bucket === "hour" ? time(x.series[0].at) : dayMonth(x.series[0].at)} to ${x.bucket === "hour" ? time(x.series.at(-1)!.at) : dayMonth(x.series.at(-1)!.at)}` : ""}{x.peak ? ` · busiest ${x.bucket === "hour" ? `hour ${time(x.peak.at)}` : dayMonth(x.peak.at.slice(0, 10))}, ${int(x.peak.n)} comments` : ""}</small>
          {x.liked.length > 0 && <><H4>Most liked</H4><div className="flex flex-col gap-2">{x.liked.map((q, n) => <QuoteLine key={n} q={q} />)}</div></>}
        </>
      )}
    </article>
  );
}

/**
 * The sentiment under a watched post in two sentences, from its counts only (the team asked for the summary of this
 * post, 22 Oct 2026): the whole crowd, then each voice the labeller named.
 */
function watchSummary(w: Watched, who: string): string {
  const c = w.comments;
  const lean = (x: Lean) => {
    const neg = sharePct(x.negative, x.read), pos = sharePct(x.positive, x.read);
    return x.read === 0 ? "not read yet" : x.negative === x.read ? "all negative" : x.positive === x.read ? `all defending ${who}` : `${pct(neg)} negative, ${pct(pos)} defending ${who}`;
  };
  const first = `${int(c.n)} comment${c.n === 1 ? "" : "s"} about ${who} so far${w.last_comment ? ` (to ${dayMonth(w.last_comment.slice(0, 10))} ${time(w.last_comment)} WIB)` : ""}: ${lean(c)}.`;
  const named = w.voices.filter((v) => v.voice !== "unclear" && v.n > 0);
  const second = named.length ? ` ${named.map((v) => `${voiceName(v.voice)}: ${int(v.n)}, ${lean(v)}`).join("; ")}.` : "";
  const sorted = w.topics.filter((t) => t.n > 0 && !t.catch_all).sort((a, b) => b.n - a.n).slice(0, 2);
  const third = sorted.length ? ` Most talk about ${sorted.map((t) => `${t.label.toLowerCase()} (${int(t.n)})`).join(" and ")}.` : "";
  return first + second + third;
}

/** The post's own topics, and the comments under it day by day: what the newer commenters say, and how they lean. */
function WatchTopics({ w }: { w: Watched }) {
  const total = w.topics.reduce((a, t) => a + t.n, 0);
  const named = w.topics.map((t) => t.label);
  return (
    <>
      <H4>What they talk about</H4>
      <MiniTable head={<><th className={TH}><span className="sr-only">Topic</span></th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Share</th><th className={TH_NUM}>Negative</th><th className={TH_NUM}>Defending</th></>}>
        {w.topics.map((t) => (
          <tr key={t.label} className={TR}><td className={TD}>{t.label}</td><td className={TD_NUM}>{int(t.n)}</td><td className={cn(TD_NUM, MUTED)}>{pct(sharePct(t.n, total), 0)}</td><td className={cn(TD_NUM, NEG)}>{t.read ? pct(negOf(t)) : "–"}</td><td className={cn(TD_NUM, POS)}>{t.read ? pct(sharePct(t.positive, t.read)) : "–"}</td></tr>))}
      </MiniTable>
      {w.days.length > 0 && (
        <>
          <H4>Day by day under this post</H4>
          <MiniTable min="min-w-[560px]" head={<><th className={TH}>Day</th><th className={TH_NUM}>New comments</th><th className={TH_NUM}>Negative</th><th className={TH_NUM}>Defending</th>{named.map((l) => <th className={TH_NUM} key={l}>{l}</th>)}</>}>
            {[...w.days].reverse().map((d) => (
              <tr key={d.d} className={TR}><td className={TD}>{dayMonth(d.d)}</td><td className={TD_NUM}>{int(d.n)}</td><td className={cn(TD_NUM, NEG)}>{d.read ? pct(negOf(d)) : "–"}</td><td className={cn(TD_NUM, POS)}>{d.read ? pct(sharePct(d.positive, d.read)) : "–"}</td>
                {named.map((l) => <td className={TD_NUM} key={l}>{d.topics[l] ? int(d.topics[l]) : <span className={MUTED}>–</span>}</td>)}</tr>))}
          </MiniTable>
        </>
      )}
    </>
  );
}

/** A post the team is watching (settings.pr.watch): the post as last read, and the crowd under it. */
export function WatchCard({ w, who }: { w: Watched; who: string }) {
  const c = w.comments;
  const q = (x: Watched["against"][number]): Quote => ({ text: x.text, translation: null, likes: x.likes, platform: w.platform, url: w.url, sentiment: x.sentiment, theme: x.voice && x.voice !== "unclear" ? x.voice : null });
  const reach = [w.views != null ? `${compact(w.views)} views` : null, w.likes != null ? `${int(w.likes)} likes` : null, w.shares ? `${int(w.shares)} reposts` : null].filter(Boolean).join(" · ");
  return (
    <article className={ITEM_CARD}>
      <header className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2"><PlatformTag p={w.platform} /><h3 className="text-base font-semibold text-gray-900">{w.label ?? `@${w.handle ?? "account"}`}</h3></span>
        <small className="text-xs text-gray-500">@{w.handle ?? "account"}{w.source === "owned" ? " (own account)" : ""} · {dayMonth(w.posted_at.slice(0, 10))} {time(w.posted_at)} WIB · <a href={w.url} target="_blank" rel="noreferrer" className="font-semibold text-gray-700 underline-offset-2 hover:text-brand-palette-700 hover:underline">Open post ↗</a></small>
      </header>
      <a href={w.url} target="_blank" rel="noreferrer" className="rounded-2xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-700 hover:bg-brand-palette-50">“{w.caption.length > 260 ? w.caption.slice(0, 258) + "…" : w.caption}”</a>
      {c.read > 0 && <p className="text-sm leading-relaxed text-gray-800">{watchSummary(w, who)}</p>}
      {reach && <small className="text-xs text-gray-500">{reach}{w.read_at ? ` when last read, ${dayMonth(w.read_at.slice(0, 10))} ${time(w.read_at)} WIB` : ""}</small>}
      {c.n === 0 ? <Empty>No comments loaded for this post yet.</Empty> : (
        <>
          <Figures items={[
            { v: int(c.n), sub: <>comments about {who}{w.other ? ` · ${w.other_by.length ? w.other_by.map((o) => `${int(o.n)} ${o.label.toLowerCase()}`).join(", ") : `${int(w.other)} about something else`}` : ""}{c.n > c.read ? ` · ${int(c.n - c.read)} not read yet` : ""}</> },
            { v: pct(negOf(c)), sub: <>negative · {pct(sharePct(c.positive, c.read))} defending {who}</>, tone: "neg" },
            { v: w.first_after_min != null ? `${int(w.first_after_min)} min` : "–", sub: "to the first comment" },
          ]} />
          <LeanStrip negative={c.negative} neutral={c.read - c.negative - c.positive} positive={c.positive} n={Math.max(1, c.n)} title={`${int(c.negative)} negative · ${int(c.read - c.negative - c.positive)} neutral · ${int(c.positive)} defending`} />
          {w.voices.some((v) => v.voice !== "unclear") && (
            <>
              <H4>Who is commenting</H4>
              <MiniTable head={<><th className={TH}><span className="sr-only">Voice</span></th><th className={TH_NUM}>Comments</th><th className={TH_NUM}>Negative</th><th className={TH_NUM}>Defending</th></>}>
                {w.voices.map((v) => (
                  <tr key={v.voice} className={TR}><td className={TD}><VoiceDot v={v.voice} />{voiceName(v.voice)}</td><td className={TD_NUM}>{int(v.n)}</td><td className={cn(TD_NUM, NEG)}>{pct(negOf(v))}</td><td className={cn(TD_NUM, POS)}>{pct(sharePct(v.positive, v.read))}</td></tr>))}
              </MiniTable>
            </>
          )}
          {w.topics.length > 0 && <WatchTopics w={w} />}
          <H4>Pace, {w.bucket === "hour" ? "comments an hour, WIB" : "comments a day"}</H4>
          <MiniBars label="Comments over time" data={w.series.map((s) => ({ key: s.at, v: s.n, title: `${w.bucket === "hour" ? `${dayMonth(s.at.slice(0, 10))} ${time(s.at)}` : dayMonth(s.at)}: ${int(s.n)} comments, ${int(s.negative)} negative` }))} />
          <small className="text-xs text-gray-500">{w.first_comment && w.last_comment ? `Comments loaded from ${dayMonth(w.first_comment.slice(0, 10))} ${time(w.first_comment)} to ${dayMonth(w.last_comment.slice(0, 10))} ${time(w.last_comment)} WIB` : ""}{w.peak ? ` · busiest ${w.bucket === "hour" ? `hour ${time(w.peak.at)}` : dayMonth(w.peak.at.slice(0, 10))}, ${int(w.peak.n)} comments` : ""}{w.own_replies ? ` · ${int(w.own_replies)} ${w.own_replies === 1 ? "reply" : "replies"} by ${who} left out` : ""}</small>
          {w.against.length > 0 && <><H4>Most liked against {who}</H4><div className="flex flex-col gap-2">{w.against.map((x, k) => <QuoteLine key={k} q={q(x)} />)}</div></>}
          {w.defending.length > 0 && <><H4>Most liked defending {who}</H4><div className="flex flex-col gap-2">{w.defending.map((x, k) => <QuoteLine key={k} q={q(x)} />)}</div></>}
        </>
      )}
      <footer className="flex justify-end border-0 border-t border-card-border pt-2"><AskLink href={ask(`What are people saying under ${w.label ?? `@${w.handle}'s post`} (${w.url}), Malaysians and Indonesians apart? Is it landing?`)}>Ask CeMO</AskLink></footer>
    </article>
  );
}

/** Day by day: the subject's own posts and the talk about it, and which side it comes from. */
export function DailyTable({ x, who }: { x: Daily; who: string }) {
  const named = x.voices.filter((v) => v !== "unclear");
  const total = (r: Daily["rows"][number]) => x.voices.reduce((a, v) => a + r.voices[v].posts.n + r.voices[v].comments.n, 0);
  const max = Math.max(1, ...x.rows.map(total));
  const cell = (l: Lean, word: string) => l.n === 0 ? <span className={MUTED}>–</span> : <>{int(l.n)}<small className={cn(SUB, l.read ? NEG : MUTED)}>{l.read ? `${pct(negOf(l))} ${word}` : "not read yet"}</small></>;
  return (
    <div className="flex flex-col gap-3">
      <MiniTable min="min-w-[960px]" head={<><th className={TH}>Day</th><th className={TH_NUM}>{who}&apos;s posts</th><th className={TH_NUM}>Comments on them</th><th className={TH_NUM}>Posts by others</th><th className={TH_NUM}>Comments about {who}</th>
        {named.map((v) => <th className={TH_NUM} key={v}><VoiceDot v={v} />{v}</th>)}<th className={TH}>Who is talking</th>
        {x.aside.map((a) => <th className={cn(TH_NUM, "bg-gray-50")} key={a.id}>{a.label}</th>)}</>}>
        {[...x.rows].reverse().map((r) => {
          const t = total(r);
          return (
            <tr key={r.d} className={cn(TR, r.arriving && "bg-amber-50/60")}>
              <td className={TD}><span className="flex flex-wrap items-center gap-1.5"><b className="font-semibold text-gray-900">{dayMonth(r.d)}</b>{r.arriving ? <Tag>still arriving</Tag> : null}</span></td>
              <td className={TD_NUM} title={Object.entries(r.own.by).map(([h, k]) => `@${h}: ${k}`).join(" · ")}>{r.own.n ? int(r.own.n) : <span className={MUTED}>–</span>}{r.own.n > 0 && Object.keys(r.own.by).length > 1 ? <small className={SUB}>{Object.entries(r.own.by).map(([h, k]) => `@${h} ${k}`).join(" · ")}</small> : null}</td>
              <td className={TD_NUM}>{cell(r.own.comments, "negative")}</td>
              <td className={TD_NUM}>{cell(r.mentions, "against")}</td>
              <td className={TD_NUM}>{cell(r.comments, "negative")}</td>
              {named.map((v) => {
                const both: Lean = { n: r.voices[v].posts.n + r.voices[v].comments.n, read: r.voices[v].posts.read + r.voices[v].comments.read, negative: r.voices[v].posts.negative + r.voices[v].comments.negative, positive: r.voices[v].posts.positive + r.voices[v].comments.positive };
                return <td className={TD_NUM} key={v}>{cell(both, "negative")}</td>;
              })}
              <td className={cn(TD, "min-w-32 align-middle")}>
                <span className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" style={{ width: `${Math.max(4, (t / max) * 100)}%` }} title={x.voices.map((v) => `${voiceName(v)}: ${int(r.voices[v].posts.n + r.voices[v].comments.n)}`).join(" · ")}>
                  {x.voices.map((v) => <i key={v} className="block h-full" style={{ width: `${t ? ((r.voices[v].posts.n + r.voices[v].comments.n) / t) * 100 : 0}%`, background: voiceColor(v) }} />)}
                </span>
              </td>
              {x.aside.map((a) => {
                const c = r.aside[a.id];
                return (
                  <td className={cn(TD_NUM, "bg-gray-50")} key={a.id} title={`${int(c.posts)} posts, ${int(c.comments)} comments: ${Object.entries(c.voices).map(([v, k]) => `${voiceName(v)} ${int(k)}`).join(" · ")}`}>
                    {c.posts + c.comments === 0 ? <span className={MUTED}>–</span> : <>{int(c.posts)}{c.comments ? <small className="text-xs text-gray-500"> +{int(c.comments)} comments</small> : null}
                      <small className="mt-0.5 flex justify-end gap-2 text-xs text-gray-500">{x.voices.filter((v) => c.voices[v]).map((v) => <span key={v}><VoiceDot v={v} />{int(c.voices[v])}</span>)}</small></>}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </MiniTable>
      <p className="text-xs leading-relaxed text-gray-500">
        Posts by others count those about {who}; posts the labeller set aside as about something else are left out{x.aside.length ? ` of every column but the last ${x.aside.length === 1 ? "one" : x.aside.length}, which count them by why they were set aside` : ""}. &quot;Against&quot; and &quot;negative&quot; are shares of those already read. {named.length ? `${named.join(" and ")} is read from each post's and comment's language; the columns count posts and comments together. ` : ""}Times are WIB.
      </p>
    </div>
  );
}

