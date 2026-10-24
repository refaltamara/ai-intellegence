/**
 * Pieces the PR dashboard's sections share: a quote, a post line, the lean of a crowd as one stacked strip, the
 * status ladder's day cells, the voices' colours and the small tables inside a card. Presentation only: every
 * figure arrives counted from src/reputation/dashboard.ts.
 */
import type { ReactNode } from "react";
import { compact, dayMonth, int, pct } from "@/competitor/view";
import type { Level, PostRef, Quote, Split } from "@/reputation/dashboard";
import type { Lean } from "@/reputation/daily";
import { OTHER, SERIES } from "../../kit/chart";
import { TABLE, TABLE_FRAME, TD, TD_NUM, TH, TH_NUM, THEAD, TR } from "../../kit/Table";
import type { PillTone } from "../../kit/StatusPill";
import { cn } from "../../cn";
import { PlatformTag, Tag } from "../../dashboard/parts";

export const PLATFORM: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };
export const LEVEL: Record<Level, { label: string; tone: PillTone; line: string }> = {
  calm: { label: "Calm", tone: "ok", line: "Nothing out of the ordinary." },
  watch: { label: "Watch", tone: "waiting", line: "Negative talk is above normal. Keep an eye on it." },
  issue: { label: "Issue", tone: "error", line: "Negative talk is well above its normal level. Decide whether to respond." },
  crisis: { label: "Crisis", tone: "critical", line: "Negative talk is far above normal, at volume. Escalate." },
  recovering: { label: "Recovering", tone: "neutral", line: "Back to normal after an issue in the last week. Watch for a second wave." },
};
export const LEVEL_ORDER: Level[] = ["calm", "watch", "issue", "crisis", "recovering"];
/** one day's cell on the ladder strip; the level is also in its title and in the counts beside it */
export const LEVEL_CELL: Record<Level | "none", string> = {
  calm: "bg-green-600",
  watch: "bg-amber-400",
  issue: "bg-red-500",
  crisis: "bg-red-800",
  recovering: "bg-gray-400",
  none: "bg-gray-200",
};

export const ask = (q: string) => `/?q=${encodeURIComponent(q)}`;
export const sharePct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
export const negOf = (x: Lean) => sharePct(x.negative, x.read);
export const time = (s: string) => s.slice(11, 16);

/** the labeller's voices (read from the language), each with its own colour; "unclear" last and grey */
const VOICE_COLOR: Record<string, string> = { Malaysian: SERIES[1], Indonesian: SERIES[0], unclear: "var(--color-gray-300)" };
export const voiceColor = (v: string) => VOICE_COLOR[v] ?? OTHER;
export const voiceName = (v: string) => (v === "unclear" ? "Not clear" : v);
export function VoiceDot({ v }: { v: string }) {
  return <i aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle" style={{ background: voiceColor(v) }} />;
}

/** a small table inside a card: the kit table at text-sm, scrolling sideways on a phone */
export function MiniTable({ head, children, min = "min-w-[420px]" }: { head: ReactNode; children: ReactNode; min?: string }) {
  return (
    <div className={TABLE_FRAME}>
      <table className={cn(TABLE, min)}>
        <thead className={THEAD}><tr>{head}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export { TD, TD_NUM, TH, TH_NUM, TR };
/** negative and defending figures: the word says which, the colour only repeats it */
export const NEG = "text-red-700";
export const POS = "text-green-700";
export const MUTED = "text-gray-500";

/** a heading inside a card */
export function H4({ children }: { children: ReactNode }) {
  return <h4 className="text-sm font-semibold text-gray-900">{children}</h4>;
}

/** the lean of a crowd as one strip: negative, neutral, positive, and what is still unread, with 2px gaps */
export function LeanStrip({ negative, neutral, positive, unread = 0, n, title }: { negative: number; neutral: number; positive: number; unread?: number; n: number; title?: string }) {
  const w = (v: number) => `${n ? (v / n) * 100 : 0}%`;
  return (
    <span role="img" aria-label={title} title={title} className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-gray-100">
      {negative > 0 && <i className="block h-full bg-red-600" style={{ width: w(negative) }} />}
      {neutral > 0 && <i className="block h-full bg-gray-400" style={{ width: w(neutral) }} />}
      {positive > 0 && <i className="block h-full bg-green-600" style={{ width: w(positive) }} />}
      {unread > 0 && <i className="block h-full bg-gray-200" style={{ width: w(unread) }} />}
    </span>
  );
}

/** One stacked bar: negative, neutral, positive, and what is still unread. */
export function LeanBar({ label, x, neg, pos }: { label: string; x: Split; neg: string; pos: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-gray-700"><b className="font-semibold tabular-nums text-gray-900">{int(x.n)}</b> {label}</span>
      <LeanStrip negative={x.negative} neutral={x.neutral} positive={x.positive} unread={x.n - x.labelled} n={x.n}
        title={`${int(x.negative)} ${neg} · ${int(x.neutral)} neutral · ${int(x.positive)} ${pos}${x.n > x.labelled ? ` · ${int(x.n - x.labelled)} not read yet` : ""}`} />
      <span className="text-xs text-gray-500"><b className={cn("font-semibold", NEG)}>{pct(sharePct(x.negative, x.labelled))}</b> {neg} · <b className={cn("font-semibold", POS)}>{pct(sharePct(x.positive, x.labelled))}</b> {pos}{x.n > x.labelled ? ` · ${int(x.n - x.labelled)} not read yet` : ""}</span>
    </div>
  );
}

/** the 30 days (or 90) of status as a strip of day cells, each named in its title */
export function LadderStrip({ days, label }: { days: { d: string; level: Level | "none"; title: string }[]; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex h-5 w-full gap-0.5">
      {days.map((h) => <i key={h.d} title={h.title} className={cn("block h-full min-w-0 flex-1 rounded-[3px]", LEVEL_CELL[h.level])} />)}
    </span>
  );
}

/** quotes and post lines sit in a quiet card */
const ITEM = "flex min-w-0 flex-col gap-1.5 rounded-2xl border border-card-border bg-white p-3";

export function QuoteLine({ q, max = 220, maxTr = 200, theme = true }: { q: Quote; max?: number; maxTr?: number; theme?: boolean }) {
  return (
    <blockquote className={ITEM}>
      <p className="text-sm leading-relaxed text-gray-800">“{q.text.length > max ? q.text.slice(0, max - 2) + "…" : q.text}”</p>
      {q.translation && q.translation !== q.text && <small className="text-xs italic leading-relaxed text-gray-500">{q.translation.length > maxTr ? q.translation.slice(0, maxTr - 2) + "…" : q.translation}</small>}
      <footer className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500">
        <PlatformTag p={q.platform} />
        <span>{q.likes > 0 ? `${int(q.likes)} like${q.likes === 1 ? "" : "s"} · ` : ""}{theme && q.theme && q.theme !== "unknown" ? `${q.theme} · ` : ""}<a href={q.url} target="_blank" rel="noreferrer" className="font-semibold text-gray-700 underline-offset-2 hover:text-brand-palette-700 hover:underline">Open post ↗</a></span>
      </footer>
    </blockquote>
  );
}

const STANCE: Record<string, { label: string; tone: "down" | "up" | "neutral" }> = { negative: { label: "against", tone: "down" }, positive: { label: "defending", tone: "up" }, neutral: { label: "neutral", tone: "neutral" } };

/** a post: who, its caption and its numbers; a list of them is a column of cards */
export function PostItem({ platform, url, head, tags, caption, meta }: { platform: string; url: string; head: ReactNode; tags?: ReactNode; caption: string; meta: ReactNode }) {
  return (
    <li className={cn(ITEM, "flex-row items-start gap-3")}>
      <PlatformTag p={platform} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <a href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-gray-900 underline-offset-2 hover:text-brand-palette-700 hover:underline">{head}</a>
          {tags}
        </span>
        <p className="line-clamp-2 text-sm leading-relaxed text-gray-700" title={caption || undefined}>{caption || <i className="text-gray-500">No caption</i>}</p>
        <small className="text-xs text-gray-500">{meta}</small>
      </div>
    </li>
  );
}

export function PostList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-2">{children}</ul>;
}

export function PostLine({ p, extra }: { p: PostRef; extra?: string }) {
  // Threads reports no views: likes stand in, and a post that is a voice itself shows its own stance
  const reach = p.views != null ? `${compact(p.views)} views` : p.likes != null ? `${int(p.likes)} likes` : "– views";
  const st = p.stance ? STANCE[p.stance] : null;
  return (
    <PostItem platform={p.platform} url={p.url} caption={p.caption} head={p.handle ? `@${p.handle}` : "Unknown account"}
      tags={<>{p.source === "owned" ? <Tag tone="brand">own post</Tag> : null}{st ? <Tag tone={st.tone}>{st.label}</Tag> : null}</>}
      meta={<>{dayMonth(p.posted_at)} · {reach}{p.comments || !st ? ` · ${int(p.comments)} comments${p.negative ? `, ${int(p.negative)} negative` : ""}` : ""}{extra ? ` · ${extra}` : ""}</>} />
  );
}

/** a big figure with its line under it, three across inside a card */
export function Figures({ items }: { items: { v: ReactNode; sub: ReactNode; tone?: "neg" }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((x, i) => (
        <div key={i} className="flex min-w-0 flex-col">
          <b className={cn("text-xl font-bold tabular-nums", x.tone === "neg" ? NEG : "text-gray-900")}>{x.v}</b>
          <small className="text-xs leading-relaxed text-gray-500">{x.sub}</small>
        </div>
      ))}
    </div>
  );
}

/** volume over time as thin bars (comments a day or an hour) */
export function MiniBars({ data, label, tone, max: top }: { data: { key: string; v: number; title: string }[]; label: string; tone?: "neg"; max?: number }) {
  const max = top ?? Math.max(1, ...data.map((x) => x.v));
  return (
    <div role="img" aria-label={label} className="flex h-16 items-end gap-0.5">
      {data.map((x) => <i key={x.key} title={x.title} className={cn("block min-w-0 flex-1 rounded-t-[3px]", tone === "neg" ? "bg-red-600" : "bg-brand-palette-600")} style={{ height: `${Math.max(3, (x.v / max) * 100)}%` }} />)}
    </div>
  );
}

/** a card inside a section (an issue, a platform, a watched post) */
export const ITEM_CARD = "flex min-w-0 flex-col gap-4 rounded-2xl border border-card-border bg-white p-4 md:p-5";
