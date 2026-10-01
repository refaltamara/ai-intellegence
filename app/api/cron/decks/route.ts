/**
 * Vercel Cron entry point for recurring decks (DECISIONS, 2 Oct 2026): makes the next version of
 * each deck whose look is due, two at most per call (a version takes up to a minute). Protected by
 * CRON_SECRET like the agents cron.
 */
import { generateDeckVersion } from "@/decks/generate";
import { dueDecks } from "@/decks/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (auth !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const due = await dueDecks(2);
  const ran: Record<string, unknown>[] = [];
  for (const deck of due) {
    const o = await generateDeckVersion(deck, { reason: "schedule" });
    ran.push({ deck: deck.id, name: deck.name, status: o.status, period: o.period, message: o.message });
  }
  return Response.json({ due: due.length, ran, duration_ms: Date.now() - started });
}
