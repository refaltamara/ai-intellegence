/** Chats: the default screen. Free-form, unattached to a decision. A chat that belongs to a decision opens inside it. */
import { redirect } from "next/navigation";
import { Ask } from "@/ui/Ask";
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { getConversation, listMessages } from "@/chat/persist";
import { workspaceStats } from "@/ui/stats";
import { paneContext } from "@/ui/paneContext";
import { askCopy } from "@/workspace/copy";
import { sql } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  const ws = await currentWorkspaceId();
  const sp = await searchParams;
  const session = await currentSession();
  let conversation: string | null = null;
  let messages: Awaited<ReturnType<typeof listMessages>> = [];
  if (sp.c && /^[0-9a-f-]{36}$/.test(sp.c)) {
    const c = await getConversation(sp.c, ws, session?.uid ?? null);
    if (c?.decision_id) redirect(`/d/${c.decision_id}?c=${c.id}`);
    if (c) { conversation = c.id; messages = await listMessages(c.id); }
  }
  const [s, client, pane] = await Promise.all([workspaceStats(ws), clientBrandName(ws), paneContext(messages, ws)]);
  const copy = await askCopy(ws, s);
  return <Ask key={conversation ?? "new"} initialConversation={conversation} initialMessages={messages} prefill={sp.q ?? undefined} stats={{ brands: s.brands, platforms: s.platforms, months: s.months, freshness: s.freshness }} clientName={client} pane={pane} copy={copy} />;
}

async function clientBrandName(ws: string): Promise<string | null> {
  const r = (await sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [ws])) as { name: string }[];
  return r[0]?.name ?? null;
}
