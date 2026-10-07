/**
 * Making a version of a deck (Decks, DECISIONS 2 Oct 2026): the facts for one
 * period (src/competitor/facts.ts, by week or by month), findings from Chats run
 * again over it, the words written from the facts and checked
 * (src/competitor/write.ts), and the .pptx and .pdf drawn from one layout. The
 * version is a report with the slides' text and the fact sheet, so Ask AI works
 * on every slide. A recurring deck looks for a new period after each one ends
 * and skips a period it already has.
 */
import { signal } from "../learning/signals";
import { getRole } from "../roles/store";
import { weeklyReport } from "../competitor/facts";
import { RANGE_RE, dayPeriod, deckPeriod, isRange, latestComplete, type DeckGrain, type Grain } from "../competitor/period";
import { shiftPeriod } from "../dashboard/period";
import { FORMATS, storeWeekly } from "../competitor/scheduled";
import { writeNarrative } from "../competitor/write";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { runFindings } from "./findings";
import { canSpend, charge } from "../credits/ledger";
import { CREDIT_PRICES } from "../config/credits";
import { sql } from "../db/client";
import { specContract } from "./spec";
import { markDeckRun, pruneVersions, type DeckRow } from "./store";
import { reputationReport, writeRep } from "../reputation/deck";
import { storeReputation } from "../reputation/store";
import { socialReport, writeSocial } from "../social/deck";
import { storeSocial } from "../social/store";

export type DeckOutcome = { status: "ok" | "skipped" | "error"; message: string; report_id: string | null; period: string | null; narrative_by?: "model" | "fallback" };

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
/** the weekly and monthly decks never go by day (cleanSpec allows it for PR decks only) */
const weekly = (g: DeckGrain): Grain => (g === "day" ? "week" : g);

/** When a recurring deck looks again: 07:00 WIB (00:00 UTC) tomorrow for a daily deck, on the next Monday, or on the 1st of next month. */
export function nextRun(grain: DeckGrain, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (grain === "day") return new Date(d.getTime() + DAY).toISOString();
  if (grain === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  const ahead = ((8 - d.getUTCDay()) % 7) || 7;
  return new Date(d.getTime() + ahead * DAY).toISOString();
}

/** A day later, at 07:00 WIB: when the period's data has not landed yet, or a run failed. */
export function retryRun(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY).toISOString();
}

/** The last day the workspace's data reaches (the latest a chosen range may end). */
export async function dataAsOf(workspaceId: string): Promise<string> {
  return (await loadContext(new SkillDb(), workspaceId)).asOf.slice(0, 10);
}

/** The periods a version can be made for: those the data fully covers, newest first. */
export async function deckPeriods(workspaceId: string, grain: DeckGrain, n = 12): Promise<{ key: string; label: string; from: string }[]> {
  const ctx = await loadContext(new SkillDb(), workspaceId);
  const out: { key: string; label: string; from: string }[] = [];
  if (grain === "day") {
    // the newest day first, marked while the data may still be filling it; then the days before
    const last = ctx.asOf.slice(0, 10);
    for (let i = 0; i < n; i++) {
      const p = dayPeriod(addDays(last, -i));
      if (p.from < ctx.earliest.slice(0, 10)) break;
      out.push({ key: p.key, label: i === 0 ? `${p.label} (so far)` : p.label, from: p.from });
    }
    return out;
  }
  let p = latestComplete(grain, ctx.asOf);
  while (out.length < n && p.to >= ctx.earliest.slice(0, 10)) {
    out.push({ key: p.key, label: p.label, from: p.from });
    p = shiftPeriod(p, -1);
  }
  return out;
}

/**
 * Make one version. `period` is a week (YYYY-Www or its Monday) or a month
 * (YYYY-MM); by default the latest the data fully covers. A scheduled run skips
 * a period the deck already has.
 */
export async function generateDeckVersion(deck: DeckRow, opts: { period?: string; reason: "create" | "manual" | "schedule" }): Promise<DeckOutcome> {
  // a version the model writes costs credits (src/credits/ledger.ts); at the cap it waits, the deck's earlier versions stay
  const ok = await canSpend(deck.workspace_id, CREDIT_PRICES.deck_version);
  if (!ok.ok) {
    await markDeckRun(deck.id, { next_run_at: deck.recurring ? retryRun() : null, error: ok.message.slice(0, 500) }).catch(() => undefined);
    return { status: "error", message: ok.message, report_id: null, period: null };
  }
  const out = await makeVersion(deck, opts);
  if (out.status === "ok") await signal({ ws: deck.workspace_id, role: deck.spec.social ? "social" : deck.spec.rep ? "pr" : "brand_kol", userId: opts.reason === "schedule" ? null : deck.user_id }, "deck.version_made", { deck: deck.id, report: out.report_id, by: opts.reason === "schedule" ? "cron" : "person" });
  if (out.status === "ok" && out.narrative_by === "model") {
    const who = deck.user_id ? ((await sql.query("select u.email, coalesce(array_length(a.staff, 1), 0) > 0 as staff from users u left join accounts a on a.id = u.account_id where u.id = $1", [deck.user_id])) as { email: string; staff: boolean }[])[0] : undefined;
    await charge({ ws: deck.workspace_id, email: who?.email ?? null, staff: who?.staff, kind: "deck_version", credits: CREDIT_PRICES.deck_version, ref: out.report_id, note: `${deck.name}${opts.reason === "schedule" ? " (scheduled)" : ""}` });
  }
  return out;
}

async function makeVersion(deck: DeckRow, opts: { period?: string; reason: "create" | "manual" | "schedule" }): Promise<DeckOutcome> {
  const spec = deck.spec;
  const grain = spec.grain;
  let key: string | null = null;
  try {
    const ctx = await loadContext(new SkillDb(), deck.workspace_id);
    const period = opts.period ? deckPeriod(grain, opts.period) : latestComplete(grain, ctx.asOf);
    key = period.key;
    // chosen days are for PR decks (a case moves faster than a week); the other decks keep their weeks and months
    if (isRange(period) && !spec.rep) throw new Error("chosen dates work for PR decks; pick a week or a month for this deck");
    if (period.from > ctx.asOf) throw new Error(`the data runs to ${ctx.asOf}; ${period.label} has not started in it yet`);
    if (opts.reason === "schedule" && deck.last_period && !RANGE_RE.test(deck.last_period) && period.key <= deck.last_period) {
      await markDeckRun(deck.id, { next_run_at: retryRun(), error: null });
      return { status: "skipped", message: `no new ${grain} of data: ${period.label} is already in the deck (data through ${ctx.asOf})`, report_id: null, period: period.key };
    }
    if (spec.social) {
      // a Social Media deck: one brand's own accounts over the period (src/social/)
      // the company's version of Spark: its thresholds and its voice (src/roles/store.ts)
      const role = await getRole(deck.workspace_id, "social");
      const r = await socialReport(deck.workspace_id, { title: spec.title, grain: weekly(grain), spec: spec.social, period: period.key, asOf: ctx.asOf, role });
      const written = await writeSocial(r, { role, workspace: deck.workspace_id });
      const stored = await storeSocial({ workspaceId: deck.workspace_id, report: r, narrative: written.narrative, by: written.by, problems: written.problems, deck: { id: deck.id, name: deck.name } });
      await pruneVersions(deck.id, deck.workspace_id, r.period.key, stored.reportId);
      const last = deck.last_period && deck.last_period > period.key ? deck.last_period : period.key;
      await markDeckRun(deck.id, { last_period: last, next_run_at: deck.recurring ? nextRun(grain) : null, error: null });
      return { status: "ok", message: `${period.label}: ${r.kpis.posts.now ?? 0} own posts, words by ${written.by === "model" ? "CeMO" : "the plain template"}`, report_id: stored.reportId, period: period.key, narrative_by: written.by };
    }
    if (spec.rep) {
      // a PR deck: one brand's reputation over the period (src/reputation/)
      // the company's version of Chorus: its alert rule and its voice
      const role = await getRole(deck.workspace_id, "pr");
      const r = await reputationReport(deck.workspace_id, { title: spec.title, grain, spec: spec.rep, period: period.key, asOf: ctx.asOf, role });
      const written = await writeRep(r, { role, workspace: deck.workspace_id });
      const stored = await storeReputation({ workspaceId: deck.workspace_id, report: r, narrative: written.narrative, by: written.by, problems: written.problems, deck: { id: deck.id, name: deck.name } });
      await pruneVersions(deck.id, deck.workspace_id, r.period.key, stored.reportId);
      // chosen days never move the schedule: it keeps counting weeks or months
      const last = isRange(period) ? deck.last_period : deck.last_period && deck.last_period > period.key ? deck.last_period : period.key;
      await markDeckRun(deck.id, { last_period: last, next_run_at: deck.recurring ? nextRun(grain) : null, error: null });
      return { status: "ok", message: `${period.label}: ${r.status.level}, ${r.issues.length} issue${r.issues.length === 1 ? "" : "s"}, words by ${written.by === "model" ? "CeMO" : "the plain template"}`, report_id: stored.reportId, period: period.key, narrative_by: written.by };
    }
    if (grain === "day") throw new Error("a day-by-day deck is a PR deck; pick a week or a month for this one");
    const findings = spec.findings?.length && spec.slides.includes("findings") ? await runFindings(spec.findings, deck.workspace_id, { from: period.from, to: period.to }) : undefined;
    const r = await weeklyReport(specContract(spec, deck.workspace_id), period.from, { findings });
    const written = await writeNarrative(r);
    const stored = await storeWeekly({ workspaceId: deck.workspace_id, runId: null, report: r, narrative: written.narrative, by: written.by, problems: written.problems, formats: FORMATS, deck: { id: deck.id, name: deck.name } });
    await pruneVersions(deck.id, deck.workspace_id, r.week.iso, stored.reportId);
    const last = deck.last_period && deck.last_period > period.key ? deck.last_period : period.key;
    await markDeckRun(deck.id, { last_period: last, next_run_at: deck.recurring ? nextRun(grain) : null, error: null });
    return { status: "ok", message: `${period.label}: ${r.movers.length} mover${r.movers.length === 1 ? "" : "s"}, words by ${written.by === "model" ? "CeMO" : "the plain template"}`, report_id: stored.reportId, period: period.key, narrative_by: written.by };
  } catch (e) {
    const message = (e as Error).message;
    await markDeckRun(deck.id, { next_run_at: deck.recurring ? retryRun() : null, error: message.slice(0, 500) }).catch(() => undefined);
    return { status: "error", message, report_id: null, period: key };
  }
}
