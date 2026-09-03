import { Ask, type SkillMeta } from "@/ui/Ask";
import { registry } from "@/skills/registry";
import { impls } from "@/skills/index";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { getConversation, listMessages } from "@/chat/persist";
import { workspaceStats } from "@/ui/stats";
import { currentSession } from "@/auth/current";

export const dynamic = "force-dynamic";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ c?: string; skill?: string; q?: string }> }) {
  const sp = await searchParams;
  const skills: SkillMeta[] = registry.skills.map((s) => ({ name: s.name, layer: s.layer, title: s.title, description: s.description, first_release: s.first_release, available: !!impls[s.name] }));
  const layers = Object.fromEntries(Object.entries(registry.layers).map(([k, v]) => [k, v.title]));
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
  const s = await workspaceStats();
  const prefill = sp.skill ? `/${sp.skill} ` : sp.q ?? undefined;
  return <Ask key={conversation ?? "new"} skills={skills} layers={layers} initialConversation={conversation} initialMessages={messages} prefill={prefill} stats={{ brands: s.brands, platforms: s.platforms, months: s.months, freshness: s.freshness }} />;
}
