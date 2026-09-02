/** Email delivery via Resend (DECISIONS). Skips with a clear error when not configured. */
import { Resend } from "resend";

export type EmailMessage = { to: string; subject: string; html: string; text?: string };

export async function sendEmail(msg: EmailMessage): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "email not configured (RESEND_API_KEY / EMAIL_FROM missing)" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(msg.to)) return { ok: false, error: `invalid recipient '${msg.to}'` };
  try {
    const resend = new Resend(key);
    const r = await resend.emails.send({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
    if (r.error) return { ok: false, error: `${r.error.name}: ${r.error.message}` };
    return { ok: true, id: r.data?.id ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
