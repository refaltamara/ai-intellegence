/**
 * Nightly test run (CMS plan, Role Lab): every role's current release, guards and screens
 * on fresh data. Golden questions cost model time, so they run when a draft is proposed,
 * not every night. Protected by CRON_SECRET like the other crons.
 */
import { ROLES } from "@/roles/model";
import { fairVersion } from "@/roles/store";
import { runTests } from "@/roles/tests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const out: Record<string, unknown>[] = [];
  for (const r of Object.values(ROLES)) {
    const spec = (await fairVersion(r.id)) ?? r;
    const s = await runTests(spec, { kinds: ["guard", "screen"] });
    out.push({ role: r.codename, version: s.version, pass: s.pass, fail: s.fail, skip: s.skip, error: s.error, failing: s.results.filter((x) => x.status === "fail" || x.status === "error").map((x) => x.key) });
  }
  return Response.json({ ran: out });
}
