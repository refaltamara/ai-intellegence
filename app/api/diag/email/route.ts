/**
 * Email diagnostics (login-protected): sends one test message through the same
 * Resend adapter the agents use, to the signed-in user's address, and returns
 * Resend's answer so a misconfigured sender domain shows up here rather than
 * silently on the first agent run.
 */
import { appUrl } from "@/config/app";
import { currentSession } from "@/auth/current";
import { sendEmail } from "@/delivery/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const started = Date.now();
  const from = process.env.EMAIL_FROM ?? null;
  const r = await sendEmail({
    to: session.email,
    subject: "Fair Intel test email",
    text: `This is a test message from Fair Intel (${appUrl()}). Agent reports will arrive from this sender.`,
    html: `<p>This is a test message from <b>Fair Intel</b> (<a href="${appUrl()}">${appUrl()}</a>).</p><p>Agent reports will arrive from this sender.</p>`,
  });
  return Response.json({ ok: r.ok, to: session.email, from, configured: !!(process.env.RESEND_API_KEY && from), duration_ms: Date.now() - started, ...(r.ok ? { id: r.id } : { error: r.error }) }, { status: r.ok ? 200 : 502 });
}
