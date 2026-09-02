/** Public, secret-free readiness check: which integrations are configured and whether the database answers. */
import { sql } from "@/db/client";
import { hasModelCredentials, modelId } from "@/chat/loop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let db: { ok: boolean; posts?: number; error?: string } = { ok: false };
  try {
    const [r] = (await sql.query("select count(*)::int as posts from posts")) as { posts: number }[];
    db = { ok: true, posts: r.posts };
  } catch (e) {
    db = { ok: false, error: (e as Error).message.slice(0, 120) };
  }
  const body = {
    ok: db.ok && hasModelCredentials(),
    db,
    model: { configured: hasModelCredentials(), id: modelId(), workspace_header: !!process.env.ANTHROPIC_WORKSPACE_ID },
    email: { configured: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) },
    cron: { secret_set: !!process.env.CRON_SECRET },
    auth: { secret_source: process.env.AUTH_SECRET ? "AUTH_SECRET" : process.env.CRON_SECRET ? "CRON_SECRET" : "none" },
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    env: process.env.VERCEL_ENV ?? "local",
  };
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
