/**
 * GET one deck with its versions; PATCH { name?, spec?, recurring?, ends_on?, paused?, stop? }; DELETE the deck and every version.
 * ends_on: the last day a recurring deck covers ("YYYY-MM-DD", or null for until stopped); paused: true/false; stop: end it today.
 */
import { currentWorkspaceId } from "@/auth/current";
import { followingFrom, nextRun } from "@/decks/generate";
import { cleanEndDate, deckState } from "@/decks/status";
import { deckPeriod, RANGE_RE, MONTHS_RE } from "@/competitor/period";
import { cleanSpec } from "@/decks/spec";
import { deckVersions, deleteDeck, getDeck, updateDeck } from "@/decks/store";
import { knownBrands } from "@/pulses/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  const deck = await getDeck(id, ws);
  if (!deck) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ deck, versions: await deckVersions(deck.id, ws) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  const deck = await getDeck(id, ws);
  if (!deck) return Response.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; spec?: unknown; recurring?: unknown; ends_on?: unknown; paused?: unknown; stop?: unknown };
  let spec;
  if (b.spec !== undefined) {
    const s = cleanSpec(b.spec, await knownBrands(ws));
    if ("error" in s) return Response.json({ error: s.error }, { status: 400 });
    spec = s;
  }
  const recurring = typeof b.recurring === "boolean" ? b.recurring : undefined;
  const grain = (spec ?? deck.spec).grain;
  const turnedOn = recurring === true && !deck.recurring;
  // the schedule (16 Oct 2026): an end date, a pause, or stop now; each also says when the deck looks next
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  let endsOn: string | null | undefined;
  if (b.stop === true) endsOn = today;
  else if (b.ends_on !== undefined) {
    const e = cleanEndDate(b.ends_on);
    if (e === "invalid") return Response.json({ error: "ends_on is a day (YYYY-MM-DD), or null for until stopped" }, { status: 400 });
    endsOn = e;
  }
  const paused = typeof b.paused === "boolean" ? b.paused : undefined;
  const sched = { recurring: recurring ?? deck.recurring, ends_on: endsOn !== undefined ? endsOn : deck.ends_on, paused_at: paused === undefined ? deck.paused_at : paused ? deck.paused_at ?? new Date().toISOString() : null };
  // the first day of the period the deck would make next: the one after the last it made
  const last = deck.last_period && !RANGE_RE.test(deck.last_period) && !MONTHS_RE.test(deck.last_period) ? deck.last_period : null;
  let nextFrom: string | null = null;
  try { nextFrom = last ? followingFrom(grain, deckPeriod(grain, last)) : null; } catch { nextFrom = null; }
  let next: { next_run_at?: string | null } = {};
  if (recurring === false) next = { next_run_at: null };
  else if (turnedOn || (spec && spec.grain !== deck.spec.grain && deck.recurring)) next = { next_run_at: nextRun(grain) };
  if (sched.recurring && (endsOn !== undefined || paused === false)) {
    if (b.stop === true || (sched.ends_on && nextFrom && nextFrom > sched.ends_on)) next = { next_run_at: null };
    // resumed, or given a later end: look again on the next tick (it makes the newest period it lacks)
    else if (!sched.paused_at && (paused === false || !deck.next_run_at)) next = { next_run_at: new Date().toISOString() };
  }
  const updated = await updateDeck(deck.id, ws, {
    name: typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 80) : undefined,
    spec,
    recurring,
    ...next,
    ...(endsOn !== undefined ? { ends_on: endsOn } : {}),
    ...(paused !== undefined ? { paused } : {}),
  });
  return Response.json({ deck: updated, state: updated ? deckState({ ...updated, grain: updated.spec.grain }) : null });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  const ok = await deleteDeck(id, ws);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
