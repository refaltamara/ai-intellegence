/** A decision (PRD-v2 §7): header, the current thread, and the composer. `?send=` starts the thread with that message. */
import { notFound } from "next/navigation";
import { Ask } from "@/ui/Ask";
import { DecisionHeader } from "@/ui/DecisionHeader";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { currentSession } from "@/auth/current";
import { getConversation, listMessages } from "@/chat/persist";
import { decisionThreads, getDecision, listPins } from "@/decisions/store";
import { SkillDb } from "@/skills/db";
import { loadContext } from "@/skills/params";
import { workspaceStats } from "@/ui/stats";
import { paneContext } from "@/ui/paneContext";

export const dynamic = "force-dynamic";

export default async function DecisionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string; send?: string; skill?: string; params?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await currentSession();
  const decision = await getDecision(id, DEFAULT_WORKSPACE_ID);
  if (!decision) notFound();
  const [threads, pins, ctx, stats] = await Promise.all([decisionThreads(id, session?.uid ?? null), listPins(id), loadContext(new SkillDb()), workspaceStats()]);
  let conversation: string | null = null;
  let messages: Awaited<ReturnType<typeof listMessages>> = [];
  if (sp.c && /^[0-9a-f-]{36}$/.test(sp.c)) {
    const c = await getConversation(sp.c, DEFAULT_WORKSPACE_ID, session?.uid ?? null);
    if (c && c.decision_id === id) { conversation = c.id; messages = await listMessages(c.id); }
  }
  const pane = await paneContext(messages);
  const workspaceClient = ctx.clientBrandId ? ctx.brands.find((b) => b.id === ctx.clientBrandId)?.name ?? null : null;
  let followupParams: Record<string, unknown> | undefined;
  try { followupParams = sp.params ? (JSON.parse(sp.params) as Record<string, unknown>) : undefined; } catch { followupParams = undefined; }
  const initialSend = sp.send && !conversation ? { prompt: sp.send, ...(sp.skill ? { followup: { label: sp.send, prompt: sp.send, skill: sp.skill, params: followupParams } } : {}) } : undefined;
  return (
    <div className="dwrap">
      <DecisionHeader decision={decision} pins={pins} threads={threads.map((t) => ({ id: t.id, title: t.title, updated_at: t.updated_at }))} currentThread={conversation} brands={ctx.brands.map((b) => ({ id: b.id, name: b.name }))} />
      <Ask key={conversation ?? `new-${id}`} topbar={false} decisionId={id} basePath={`/d/${id}`} initialConversation={conversation} initialMessages={messages} initialSend={initialSend} stats={{ brands: stats.brands, platforms: stats.platforms, months: stats.months, freshness: stats.freshness }} clientName={decision.client_name ?? workspaceClient} pane={pane} />
    </div>
  );
}
