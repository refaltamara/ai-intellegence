/**
 * "Ask AI" on a weekly report slide, or on a slide of a deck's version (DECISIONS, 2 Oct 2026). The browser
 * sends only which report and which slide; the server reads the slide's text and the report's fact sheet from
 * the stored report, the same way "Ask why" re-reads the dashboard's figures, and hands them to CeMO in front
 * of the question.
 */
import type { AskContext } from "../dashboard/askref";
import type { WeeklyBlocks } from "../competitor/scheduled";
import { getReport } from "./store";

export type SlideRef = { report_id: string; n: number };

export function validSlideRef(x: unknown): SlideRef | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.report_id !== "string" || !/^[0-9a-f-]{36}$/.test(o.report_id)) return null;
  const n = Number(o.n);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? { report_id: o.report_id, n } : null;
}

/** The slide as context, plus the whole fact sheet for this turn only. Null when the report or slide is not there. */
export async function resolveSlide(workspaceId: string, ref: SlideRef): Promise<{ context: AskContext; sheet: string } | null> {
  const report = await getReport(ref.report_id, workspaceId);
  const b = report?.blocks as unknown as WeeklyBlocks | undefined;
  if (!report || (b?.kind !== "weekly" && b?.kind !== "deck") || !b.slides?.length) return null;
  const slide = b.slides.find((s) => s.n === ref.n);
  if (!slide) return null;
  const context: AskContext = {
    source: "slide",
    title: slide.title,
    scope: [b.title, b.client || null, b.week.label, `slide ${slide.n} of ${b.slides.length}`].filter(Boolean).join(" · "),
    facts: [{ label: "Slide", value: `${slide.n} of ${b.slides.length}` }, { label: b.grain === "month" ? "Month" : "Week", value: `${b.week.label} vs ${b.previous_week}` }],
    back: b.kind === "deck" && b.deck_id ? `/decks/${b.deck_id}?v=${report.id}&s=${slide.n}` : `/weekly?r=${report.id}&s=${slide.n}`,
    question: "",
    slide: { report_id: report.id, n: slide.n, total: b.slides.length, deck: b.client ? `${b.title} for ${b.client}` : b.title, week: { from: b.week.from, to: b.week.to, label: b.week.label, previous: b.previous_week }, text: slide.text },
  };
  return { context, sheet: b.sheet ?? "" };
}
