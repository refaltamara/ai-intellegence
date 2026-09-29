/**
 * The words of a weekly report. The facts are computed in SQL; the narrative is
 * the phrasing (written by the model in the weekly agent), and it may only cite
 * numbers the facts contain. `checkNarrative` enforces that, plus the length
 * limits that keep the deck presentable ("no bertele-tele").
 */
import { displayedNumbers } from "./view";
import type { WeeklyReport } from "./types";

export type Narrative = {
  /** ISO week the text was written for, e.g. "2026-W23" */
  week: string;
  /** exactly three: what's new, what's working, what may be worth testing */
  summary: { label: "New" | "Working" | "Worth testing"; stat: string; stat_label: string; text: string }[];
  scoreboard_title: string;
  movers_title: string;
  /** one per mover, in the report's order */
  drivers: { key: string; title: string; why: string; attention_to_action: string }[];
  /** what Paragon should do: up to three */
  actions: { title: string; detail: string; brands: string[]; based_on: string }[];
  portfolio_note?: string;
};

const LIMITS = {
  summary_text: 18,
  stat_label: 6,
  title: 12,
  driver_title: 10,
  why: 45,
  attention_to_action: 28,
  action_title: 9,
  action_detail: 30,
  portfolio_note: 30,
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December";

/** Numbers in prose, with their unit, skipping dates, weeks, years and digits inside names (Glad2Glow, G2G, SKIN1004). */
export function numbersIn(text: string): { raw: string; value: number; decimals: number; unit: "%" | "pt" | "M" | "K" | "B" | "x" | "" }[] {
  const cleaned = text
    .replace(/[@#][\p{L}\p{N}_.]+/gu, " ")
    .replace(new RegExp(`\\b\\d{1,2}(\\s*[–-]\\s*\\d{1,2})?\\s+(${MONTHS})\\b`, "g"), " ")
    .replace(new RegExp(`\\b(${MONTHS})\\s+\\d{1,2}\\b`, "g"), " ")
    .replace(/\bW(eek\s*)?\d{1,2}\b/gi, " ")
    .replace(/\b20\d\d\b/g, " ")
    .replace(/\bday\s+\d+\b/gi, " ")
    .replace(/\b\d+(-|\s)(week|day)s?\b/gi, " ");
  const out: ReturnType<typeof numbersIn> = [];
  const re = /(?<![A-Za-z\d.])[×x]?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|pts?\b|pt\b|M\b|K\b|B\b|x\b|×)?(?![A-Za-z\d])/g;
  for (const m of cleaned.matchAll(re)) {
    const lead = m[0].trim().startsWith("×") || /^x\d/.test(m[0].trim());
    const unitRaw = (m[3] ?? "").trim();
    const unit = lead || unitRaw === "x" || unitRaw === "×" ? "x" : unitRaw.startsWith("pt") ? "pt" : (unitRaw as "%" | "M" | "K" | "B" | "");
    const value = Number(m[1].replace(/,/g, "") + (m[2] ?? ""));
    out.push({ raw: m[0].trim(), value, decimals: m[2] ? m[2].length - 1 : 0, unit });
  }
  return out;
}

/** A number in the text matches a fact when it is that fact at the text's precision, rounded either way the deck rounds (toFixed or Math.round). */
function matches(value: number, decimals: number, pool: number[], scale = 1): boolean {
  const f = 10 ** decimals;
  return pool.some((v) => {
    if (!Number.isFinite(v)) return false;
    const x = Math.abs(v) / scale;
    return Math.round(x * f) / f === value || Number(x.toFixed(decimals)) === value;
  });
}

/** Problems with a narrative for this report; empty when it is fit to render. */
export function checkNarrative(n: Narrative, r: WeeklyReport): string[] {
  const problems: string[] = [];
  if (n.week !== r.week.iso) problems.push(`narrative is for ${n.week}, the report is ${r.week.iso}`);
  if (n.summary?.length !== 3) problems.push("summary needs exactly three lines (New, Working, Worth testing)");
  const moverKeys = r.movers.map((m) => m.key);
  const driverKeys = (n.drivers ?? []).map((d) => d.key);
  if (moverKeys.join() !== driverKeys.join()) problems.push(`drivers must follow the movers [${moverKeys.join(", ")}], got [${driverKeys.join(", ")}]`);
  if (!n.actions?.length || n.actions.length > 3) problems.push("actions: one to three");

  const limit = (label: string, s: string | undefined, max: number) => {
    if (s && words(s) > max) problems.push(`${label} is ${words(s)} words (max ${max}): "${s}"`);
  };
  n.summary?.forEach((s, i) => {
    limit(`summary[${i}].text`, s.text, LIMITS.summary_text);
    limit(`summary[${i}].stat_label`, s.stat_label, LIMITS.stat_label);
    if (s.stat.length > 9) problems.push(`summary[${i}].stat "${s.stat}" is too long for the callout (max 9 characters)`);
  });
  limit("scoreboard_title", n.scoreboard_title, LIMITS.title);
  limit("movers_title", n.movers_title, LIMITS.title);
  n.drivers?.forEach((d) => {
    limit(`drivers.${d.key}.title`, d.title, LIMITS.driver_title);
    limit(`drivers.${d.key}.why`, d.why, LIMITS.why);
    limit(`drivers.${d.key}.attention_to_action`, d.attention_to_action, LIMITS.attention_to_action);
  });
  n.actions?.forEach((a, i) => {
    limit(`actions[${i}].title`, a.title, LIMITS.action_title);
    limit(`actions[${i}].detail`, a.detail, LIMITS.action_detail);
  });
  limit("portfolio_note", n.portfolio_note, LIMITS.portfolio_note);

  // every number must come from the facts
  const pool = displayedNumbers(r);
  const texts: [string, string][] = [
    ...(n.summary ?? []).flatMap((s, i) => [[`summary[${i}].stat`, s.stat], [`summary[${i}].stat_label`, s.stat_label], [`summary[${i}].text`, s.text]] as [string, string][]),
    ["scoreboard_title", n.scoreboard_title],
    ["movers_title", n.movers_title],
    ...(n.drivers ?? []).flatMap((d) => [[`drivers.${d.key}.title`, d.title], [`drivers.${d.key}.why`, d.why], [`drivers.${d.key}.attention_to_action`, d.attention_to_action]] as [string, string][]),
    ...(n.actions ?? []).flatMap((a, i) => [[`actions[${i}].title`, a.title], [`actions[${i}].detail`, a.detail], [`actions[${i}].based_on`, a.based_on]] as [string, string][]),
    ["portfolio_note", n.portfolio_note ?? ""],
  ];
  for (const [where, text] of texts) {
    for (const t of numbersIn(text ?? "")) {
      const ok =
        t.unit === "%" ? matches(t.value, t.decimals, pool.percent)
        : t.unit === "pt" ? matches(t.value, t.decimals, pool.points) || matches(t.value, t.decimals, pool.percent)
        : t.unit === "M" ? matches(t.value, t.decimals, pool.views, 1e6)
        : t.unit === "K" ? matches(t.value, t.decimals, pool.views, 1e3)
        : t.unit === "B" ? matches(t.value, t.decimals, pool.views, 1e9)
        : t.unit === "x" ? matches(t.value, t.decimals, pool.ratios)
        : matches(t.value, t.decimals, pool.counts) || matches(t.value, t.decimals, pool.percent) || matches(t.value, t.decimals, pool.views);
      if (!ok) problems.push(`${where}: "${t.raw}" is not a number in this week's facts`);
    }
  }
  return problems;
}
