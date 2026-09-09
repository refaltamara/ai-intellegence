import { Ask } from "@/ui/Ask";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { sql } from "@/db/client";
import { getConversation, listMessages } from "@/chat/persist";
import { workspaceStats } from "@/ui/stats";
import { currentSession } from "@/auth/current";

export const dynamic = "force-dynamic";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ c?: string; skill?: string; q?: string }> }) {
  const sp = await searchParams;
  let conversation: string | null = null;
  let messages: Awaited<ReturnType<typeof listMessages>> = [];
  if (sp.c && /^[0-9a-f-]{36}$/.test(sp.c)) {
    const session = await currentSession();
    const c = await getConversation(sp.c, DEFAULT_WORKSPACE_ID, session?.uid ?? null);
    if (c) {
      conversation = c.id;
      messages = await listMessages(c.id);
    }
  }
  const [s, client] = await Promise.all([workspaceStats(), clientBrandName()]);
  const prefill = sp.q ?? undefined;
  return <Ask key={conversation ?? "new"} initialConversation={conversation} initialMessages={messages} prefill={prefill} stats={{ brands: s.brands, platforms: s.platforms, months: s.months, freshness: s.freshness }} clientName={client} />;
}

async function clientBrandName(): Promise<string | null> {
  const r = (await sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [DEFAULT_WORKSPACE_ID])) as { name: string }[];
  return r[0]?.name ?? null;
}
