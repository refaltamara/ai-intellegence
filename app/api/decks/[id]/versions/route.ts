/** POST { period? }: make a version of the deck for a period (by default the latest the data fully covers). */
import { currentWorkspaceId } from "@/auth/current";
import { generateDeckVersion } from "@/decks/generate";
import { getDeck } from "@/decks/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  const deck = await getDeck(id, ws);
  if (!deck) return Response.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { period?: unknown };
  const period = typeof b.period === "string" && /^\d{4}-(W\d{2}|\d{2})(-\d{2})?$/.test(b.period) ? b.period : undefined;
  const outcome = await generateDeckVersion(deck, { reason: "manual", period });
  return Response.json(outcome, { status: outcome.status === "error" ? 500 : 200 });
}
