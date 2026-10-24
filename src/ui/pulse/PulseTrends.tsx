"use client";
/**
 * The Pulse's two trend cards, comments and posts, by hour or by day (Refal, 13 Oct 2026). The hourly chart covers five
 * days at most and, once the talk thins out, draws its share lines on a handful of comments, so they jump between 0%
 * and 100%. The page opens by day when the wave is longer than the hourly window or when most of its hours are too thin
 * to read; either view is one click away. A share is drawn only on PULSE_MIN_READ comments read (posts with a stance).
 */
import { useState, type ReactNode } from "react";
import type { Trend, TrendPoint } from "@/pulse/page";
import { TrendChart } from "@/ui/TrendChart";
import { fmtNum } from "@/ui/format";
import { PULSE_MIN_READ } from "@/config/pulse";
import { SERIES } from "../kit/chart";
import { Segmented } from "../kit/Segmented";
import { SectionCard } from "../kit/Section";

/**
 * Volume in the product's first series blue (the caveat calls it "the blue bar"), what is not read yet in a pale
 * mix of it, other talk in grey. Lean is polarity, so it keeps red against green with grey between.
 */
const C = {
  about: SERIES[0],
  waiting: `color-mix(in srgb, ${SERIES[0]} 30%, white)`,
  other: "var(--color-gray-300)",
  negative: "var(--color-red-600)",
  neutral: "var(--color-gray-500)",
  positive: "var(--color-green-600)",
  none: "var(--color-gray-200)",
};
const NOTE = "text-xs leading-relaxed text-gray-500";

/** a card with its title, or, where the page titles it already, the span line and the controls alone */
function Frame({ titled, title, hint, actions, children }: { titled: boolean; title: ReactNode; hint: ReactNode; actions: ReactNode; children: ReactNode }) {
  if (titled) return <SectionCard title={title} hint={hint} actions={actions}>{children}</SectionCard>;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">{hint}</p>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

type Grain = "hour" | "day";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-07 09:00" → "7 Oct 09:00"; "2026-10-07" → "7 Oct" */
const when = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (!m) return s;
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  return m[4] ? `${day} ${m[4]}:${m[5]}` : day;
};
/** a share of a base, blank where the base is too small to mean anything */
const share = (n: number, base: number) => (base >= PULSE_MIN_READ ? Math.round((n / base) * 1000) / 10 : null);

/** day when the wave outruns the hourly window, or when most hours with talk about the subject are too thin to read */
export function defaultGrain(trend: Pick<Trend, "points" | "days" | "cut">): Grain {
  if (!trend.days.length) return "hour";
  if (trend.cut) return "day";
  const talk = trend.points.filter((p) => p.on_topic > 0);
  const readable = talk.filter((p) => p.labelled >= PULSE_MIN_READ).length;
  return talk.length && readable / talk.length < 0.5 ? "day" : "hour";
}

export function PulseTrends({ subject, trend, askTrend, askStance, postsDaily, postsCaveat, commentsOnly = false, titled = true }: {
  subject: string;
  trend: Trend;
  /** the comments card alone (the reputation dashboard's "Comments per hour") */
  commentsOnly?: boolean;
  /** false where the page already titles the card (the dashboard's section header): the card keeps its span, switch and ask */
  titled?: boolean;
  askTrend?: ReactNode;
  askStance?: ReactNode;
  /** the posts-per-day-by-platform chart that follows the stance chart */
  postsDaily?: ReactNode;
  postsCaveat: ReactNode;
}) {
  const [grain, setGrain] = useState<Grain>(() => defaultGrain(trend));
  const pts: TrendPoint[] = grain === "day" ? trend.days : trend.points;
  const unit = grain === "day" ? "day" : "hour";
  const span = pts.length ? `${when(pts[0].h)} → ${when(pts[pts.length - 1].h)} · ${pts.length} ${unit}${pts.length === 1 ? "" : "s"}` : "no data yet";
  const peakOf = (k: (p: TrendPoint) => number) => pts.reduce<TrendPoint | null>((a, p) => (a == null || k(p) > k(a) ? p : a), null);
  const peakC = peakOf((p) => p.comments), peakP = peakOf((p) => p.posts);
  const switcher = trend.days.length > 0 && (
    <Segmented label="Per hour or per day" size="sm" value={grain} onChange={setGrain} options={[{ key: "day", label: "Per day" }, { key: "hour", label: "Per hour" }]} />
  );

  return (
    <>
      <Frame titled={titled} title={<>Comments per {unit}, and which way they lean</>} hint={<>{span} · WIB · bars are volume, the three lines are shares of the blue bar</>} actions={<>{switcher}{askTrend}</>}>
        <TrendChart
          grain={grain}
          x={pts.map((p) => p.h)}
          bars={[
            { name: `About ${subject}`, data: pts.map((p) => p.labelled), color: C.about },
            { name: "Waiting to be read", data: pts.map((p) => Math.max(0, p.on_topic - p.labelled)), color: C.waiting },
            { name: "Other talk in the same threads", data: pts.map((p) => p.off_topic), color: C.other },
          ]}
          lines={[
            { name: "Negative", data: pts.map((p) => share(p.negative, p.labelled)), color: C.negative },
            { name: "Neutral", data: pts.map((p) => share(p.neutral, p.labelled)), color: C.neutral },
            { name: `Defending ${subject}`, data: pts.map((p) => share(p.positive, p.labelled)), color: C.positive },
          ]}
          barLabel="Comments" lineLabel={`share of the comments read that ${unit}`}
          peakNote={peakC && peakC.comments > 0 ? `${fmtNum(peakC.comments)} in one ${unit}` : undefined}
        />
        <p className={NOTE}>The three lines are shares of the same blue bar and add up to 100%: every comment about {subject} is negative, neutral or defending {subject}. Neutral means it is about {subject} or the controversy but takes no side: anger at the government or the news, unless it blames {subject}. Pale blue is comments the labeller has not reached yet, which is why a bar can be tall and its lines short. Lines are blank under {PULSE_MIN_READ} comments read in the {unit}, where a percentage would be noise, and the last {unit} is still filling.{trend.cut && grain === "hour" ? " The hourly view covers the last five days; the wave started earlier, so switch to days to see all of it." : ""}</p>
      </Frame>

      {!commentsOnly && (
        <Frame titled title={<>Posts about {subject} per {unit}, by stance</>} hint="what other accounts publish, not the replies under it" actions={<>{switcher}{askStance}</>}>
          <TrendChart
            grain={grain}
            x={pts.map((p) => p.h)}
            bars={[
              { name: `Against ${subject}`, data: pts.map((p) => p.against), color: C.negative },
              { name: "Neutral", data: pts.map((p) => p.neutral_posts), color: C.neutral },
              { name: `Defending ${subject}`, data: pts.map((p) => p.for_), color: C.positive },
              { name: "No stance yet", data: pts.map((p) => Math.max(0, p.posts - p.against - p.neutral_posts - p.for_)), color: C.none },
            ]}
            lines={[{ name: `Share against ${subject}`, data: pts.map((p) => share(p.against, p.against + p.neutral_posts + p.for_)), color: C.negative }]}
            barLabel="Posts" lineLabel={`share of the posts with a stance that ${unit}`} height={260}
            peakNote={peakP && peakP.posts > 0 ? `${fmtNum(peakP.posts)} posts in one ${unit}` : undefined}
          />
          {postsDaily}
          <p className={NOTE}>{postsCaveat} The line is blank under {PULSE_MIN_READ} posts with a stance in the {unit}.</p>
        </Frame>
      )}
    </>
  );
}
