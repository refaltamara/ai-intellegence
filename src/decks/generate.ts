/**
 * Making a version of a deck (Decks, DECISIONS 2 Oct 2026): the facts for one
 * period (src/competitor/facts.ts, by week or by month), findings from Chats run
 * again over it, the words written from the facts and checked
 * (src/competitor/write.ts), and the .pptx and .pdf drawn from one layout. The
 * version is a report with the slides' text and the fact sheet, so Ask AI works
 * on every slide. A recurring deck looks for a new period after each one ends
 * and skips a period it already has.
 */
import { weeklyReport } from "../competitor/facts";
import { deckPeriod, latestComplete, type Grain } from "../competitor/period";
import { shiftPeriod } from "../dashboard/period";
import { FORMATS, storeWeekly } from "../competitor/scheduled";
import { writeNarrative } from "../competitor/write";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { runFindings } from "./findings";
import { specContract } from "./spec";
import { markDeckRun, pruneVersions, type DeckRow } from "./store";
import { reputationReport, writeRep } from "../reputation/deck";
import { storeReputation } from "../reputation/store";
import { socialReport, writeSocial } from "../social/deck";
import { storeSocial } from "../social/store";

export type DeckOutcome = { status: "ok" | "skipped" | "error"; message: string; report_id: string | null; period: string | null; narrative_by?: "model" | "fallback" };

const DAY = 86_400_000;

/** When a recurring deck looks again: 07:00 WIB (00:00 UTC) on the next Monday, or on the 1st of next month. */
export function nextRun(grain: Grain, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (grain === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  const ahead = ((8 - d.getUTCDay()) % 7) || 7;
  return new Date(d.getTime() + ahead * DAY).toISOString();
}

/** A day later, at 07:00 WIB: when the period's data has not landed yet, or a run failed. */
export function retryRun(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY).toISOString();
}

/** The periods a version can be made for: those the data fully covers, newest first. */
export async function deckPeriods(workspaceId: string, grain: Grain, n = 12): Promise<{ key: string; label: string; from: string }[]> {
  const ctx = await loadContext(new SkillDb(), workspaceId);
  const out: { key: string; label: string; from: string }[] = [];
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
  const spec = deck.spec;
  const grain = spec.grain;
  let key: string | null = null;
  try {
    const ctx = await loadContext(new SkillDb(), deck.workspace_id);
    const period = opts.period ? deckPeriod(grain, opts.period) : latestComplete(grain, ctx.asOf);
    key = period.key;
    if (period.from > ctx.asOf) throw new Error(`the data runs to ${ctx.asOf}; ${period.label} has not started in it yet`);
    if (opts.reason === "schedule" && deck.last_period && period.key <= deck.last_period) {
      await markDeckRun(deck.id, { next_run_at: retryRun(), error: null });
      return { status: "skipped", message: `no new ${grain} of data: ${period.label} is already in the deck (data through ${ctx.asOf})`, report_id: null, period: period.key };
    }
    if (spec.social) {
      // a Social Media deck: one brand's own accounts over the period (src/social/)
      const r = await socialReport(deck.workspace_id, { title: spec.title, grain, spec: spec.social, period: period.key, asOf: ctx.asOf });
      const written = await writeSocial(r);
      const stored = await storeSocial({ workspaceId: deck.workspace_id, report: r, narrative: written.narrative, by: written.by, problems: written.problems, deck: { id: deck.id, name: deck.name } });
      await pruneVersions(deck.id, deck.workspace_id, r.period.key, stored.reportId);
      const last = deck.last_period && deck.last_period > period.key ? deck.last_period : period.key;
      await markDeckRun(deck.id, { last_period: last, next_run_at: deck.recurring ? nextRun(grain) : null, error: null });
      return { status: "ok", message: `${period.label}: ${r.kpis.posts.now ?? 0} own posts, words by ${written.by === "model" ? "CeMO" : "the plain template"}`, report_id: stored.reportId, period: period.key, narrative_by: written.by };
    }
    if (spec.rep) {
      // a PR deck: one brand's reputation over the period (src/reputation/)
      const r = await reputationReport(deck.workspace_id, { title: spec.title, grain, spec: spec.rep, period: period.key, asOf: ctx.asOf });
      const written = await writeRep(r);
      const stored = await storeReputation({ workspaceId: deck.workspace_id, report: r, narrative: written.narrative, by: written.by, problems: written.problems, deck: { id: deck.id, name: deck.name } });
      await pruneVersions(deck.id, deck.workspace_id, r.period.key, stored.reportId);
      const last = deck.last_period && deck.last_period > period.key ? deck.last_period : period.key;
      await markDeckRun(deck.id, { last_period: last, next_run_at: deck.recurring ? nextRun(grain) : null, error: null });
      return { status: "ok", message: `${period.label}: ${r.status.level}, ${r.issues.length} issue${r.issues.length === 1 ? "" : "s"}, words by ${written.by === "model" ? "CeMO" : "the plain template"}`, report_id: stored.reportId, period: period.key, narrative_by: written.by };
    }
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
