/** Email delivery via Resend (DECISIONS). Skips with a clear error when not configured. */
import { Resend } from "resend";

export type EmailAttachment = { filename: string; content: Buffer };
export type EmailMessage = { to: string | string[]; subject: string; html: string; text?: string; attachments?: EmailAttachment[] };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** "a@x.com, b@y.com; c@z.com" → the addresses; null when any is not an address */
export function recipients(raw: string | string[] | undefined | null): string[] | null {
  const list = (Array.isArray(raw) ? raw : String(raw ?? "").split(/[,;\s]+/)).map((s) => s.trim()).filter(Boolean);
  return list.length && list.every((e) => EMAIL.test(e)) ? Array.from(new Set(list)).slice(0, 20) : null;
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "email not configured (RESEND_API_KEY / EMAIL_FROM missing)" };
  const to = recipients(msg.to);
  if (!to) return { ok: false, error: `invalid recipient '${String(msg.to)}'` };
  try {
    const resend = new Resend(key);
    const r = await resend.emails.send({ from, to, subject: msg.subject, html: msg.html, text: msg.text, ...(msg.attachments?.length ? { attachments: msg.attachments.map((a) => ({ filename: a.filename, content: a.content })) } : {}) });
    if (r.error) return { ok: false, error: `${r.error.name}: ${r.error.message}` };
    return { ok: true, id: r.data?.id ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
