/** Delivery fan-out for an agent run (PRD §6.4). in_app is always on: the run is listed on the Agents page. */
import { sendEmail } from "./email";
import { whatsappStub } from "./whatsapp";

export type DeliveryTarget = { channels: string[]; email?: string; whatsapp?: string };
export type DeliveryOutcome = { channel: string; ok: boolean; detail: string };

export async function deliver(target: DeliveryTarget, payload: { subject: string; html: string; text: string }): Promise<DeliveryOutcome[]> {
  const out: DeliveryOutcome[] = [{ channel: "in_app", ok: true, detail: "listed on the Agents page" }];
  for (const ch of target.channels ?? []) {
    if (ch === "email") {
      if (!target.email) { out.push({ channel: "email", ok: false, detail: "no email address on the agent" }); continue; }
      const r = await sendEmail({ to: target.email, subject: payload.subject, html: payload.html, text: payload.text });
      out.push({ channel: "email", ok: r.ok, detail: r.ok ? `sent (${r.id ?? "no id"})` : r.error });
    } else if (ch === "whatsapp") {
      const r = await whatsappStub.send(target.whatsapp ?? "", payload.text);
      out.push({ channel: "whatsapp", ok: r.ok, detail: r.ok ? "sent" : r.error });
    }
  }
  return out;
}
