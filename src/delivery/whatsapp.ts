/** WhatsApp adapter: interface only in v1 (DECISIONS). The stub logs and reports "not configured". */
export interface WhatsAppProvider {
  send(to: string, text: string, attachmentUrl?: string): Promise<{ ok: true; id: string | null } | { ok: false; error: string }>;
}

export const whatsappStub: WhatsAppProvider = {
  async send(to, text, attachmentUrl) {
    console.log(`[whatsapp stub] to=${to} chars=${text.length}${attachmentUrl ? ` attachment=${attachmentUrl}` : ""}`);
    return { ok: false, error: "whatsapp delivery is a stub in v1" };
  },
};
