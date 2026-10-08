/**
 * POST { email }: "Forgot your password?" A link to set a new one goes to that email when it has an
 * account. The answer is the same either way, so the page never says which emails have accounts.
 */
import { headers } from "next/headers";
import { requestPasswordLink } from "@/auth/passwordLinks";
import { originOf } from "@/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = String(b.email ?? "").trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 200) await requestPasswordLink(email, originOf(await headers())).catch(() => undefined);
  return Response.json({ ok: true });
}
