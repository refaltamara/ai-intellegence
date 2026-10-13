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

export function PulseTrends({ subject, trend, askTrend, askStance, postsDaily, postsCaveat }: {
  subject: string;
  trend: Trend;
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
    <span className="seg sm" role="tablist" aria-label="Per hour or per day" style={{ marginLeft: 8 }}>
      {(["day", "hour"] as const).map((g) => (
        <button key={g} type="button" role="tab" aria-selected={grain === g} className={grain === g ? "on" : ""} onClick={() => setGrain(g)}>{g === "day" ? "Per day" : "Per hour"}</button>
      ))}
    </span>
  );

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <h4>Comments per {unit}, and which way they lean <span>{span} · WIB · bars are volume, the three lines are shares of the blue bar</span>{switcher}{askTrend}</h4>
        <div className="body">
          <TrendChart
            grain={grain}
            x={pts.map((p) => p.h)}
            bars={[
              { name: `About ${subject}`, data: pts.map((p) => p.labelled), color: "var(--blue)" },
              { name: "Waiting to be read", data: pts.map((p) => Math.max(0, p.on_topic - p.labelled)), color: "var(--blue-20)" },
              { name: "Other talk in the same threads", data: pts.map((p) => p.off_topic), color: "#D5DDE8" },
            ]}
            lines={[
              { name: "Negative", data: pts.map((p) => share(p.negative, p.labelled)), color: "var(--red)" },
              { name: "Neutral", data: pts.map((p) => share(p.neutral, p.labelled)), color: "#8593A8" },
              { name: `Defending ${subject}`, data: pts.map((p) => share(p.positive, p.labelled)), color: "var(--green)" },
            ]}
            barLabel="Comments" lineLabel={`share of the comments read that ${unit}`}
            peakNote={peakC && peakC.comments > 0 ? `${fmtNum(peakC.comments)} in one ${unit}` : undefined}
          />
        </div>
        <div className="caveats">The three lines are shares of the same blue bar and add up to 100%: every comment about {subject} is negative, neutral or defending {subject}. Neutral means it is about {subject} or the controversy but takes no side — anger at the government or the news, unless it blames {subject}. Pale blue is comments the labeller has not reached yet, which is why a bar can be tall and its lines short. Lines are blank under {PULSE_MIN_READ} comments read in the {unit}, where a percentage would be noise, and the last {unit} is still filling.{trend.cut && grain === "hour" ? " The hourly view covers the last five days; the wave started earlier, so switch to days to see all of it." : ""}</div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h4>Posts about {subject} per {unit}, by stance <span>what other accounts publish, not the replies under it</span>{switcher}{askStance}</h4>
        <div className="body">
          <TrendChart
            grain={grain}
            x={pts.map((p) => p.h)}
            bars={[
              { name: `Against ${subject}`, data: pts.map((p) => p.against), color: "var(--red)" },
              { name: "Neutral", data: pts.map((p) => p.neutral_posts), color: "#8593A8" },
              { name: `Defending ${subject}`, data: pts.map((p) => p.for_), color: "var(--green)" },
              { name: "No stance yet", data: pts.map((p) => Math.max(0, p.posts - p.against - p.neutral_posts - p.for_)), color: "#E6EBF2" },
            ]}
            lines={[{ name: `Share against ${subject}`, data: pts.map((p) => share(p.against, p.against + p.neutral_posts + p.for_)), color: "var(--red)" }]}
            barLabel="Posts" lineLabel={`share of the posts with a stance that ${unit}`} height={260}
            peakNote={peakP && peakP.posts > 0 ? `${fmtNum(peakP.posts)} posts in one ${unit}` : undefined}
          />
          {postsDaily}
        </div>
        <div className="caveats">{postsCaveat} The line is blank under {PULSE_MIN_READ} posts with a stance in the {unit}.</div>
      </div>
    </>
  );
}
