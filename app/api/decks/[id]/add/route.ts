/**
 * POST { slide } (from the Dashboard) or { skill_run_id, question? } (from Chats): put it in the deck. A slide
 * joins the deck's slides; an analysis becomes a finding, run again for every version from the next one on.
 */
import { currentWorkspaceId } from "@/auth/current";
import { SLIDE_KINDS, cleanSlides, type SlideKind } from "@/competitor/slides";
import { findingFromRun } from "@/decks/fromChat";
import { getDeck, updateDeck } from "@/decks/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  const deck = await getDeck(id, ws);
  if (!deck) return Response.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { slide?: unknown; skill_run_id?: unknown; question?: unknown };
  const spec = { ...deck.spec };
  if (typeof b.slide === "string" && SLIDE_KINDS.includes(b.slide as SlideKind)) {
    spec.slides = cleanSlides([...spec.slides, b.slide]);
  } else if (typeof b.skill_run_id === "string") {
    const f = await findingFromRun(b.skill_run_id, ws, typeof b.question === "string" ? b.question.slice(0, 300) : "");
    if (!f) return Response.json({ error: "that analysis is not in this workspace" }, { status: 404 });
    const findings = spec.findings ?? [];
    if (findings.length >= 6) return Response.json({ error: "a deck holds six findings at most" }, { status: 400 });
    const used = new Set(findings.map((x) => x.key));
    let n = findings.length + 1;
    while (used.has(`f${n}`)) n++;
    spec.findings = [...findings, { ...f, key: `f${n}` }];
    spec.slides = cleanSlides([...spec.slides, "findings"]);
  } else return Response.json({ error: "slide or skill_run_id is required" }, { status: 400 });
  return Response.json({ deck: await updateDeck(deck.id, ws, { spec }) });
}
