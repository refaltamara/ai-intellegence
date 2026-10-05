/** Nightly insights (CMS plan, "The learning loop"): signals rolled up per role into model_insights, above the three-workspace floor. Protected by CRON_SECRET. */
import { rollUp } from "@/learning/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ insights: await rollUp() });
}
