/** Chats: the default screen. Free-form; chats from the retired Decisions screen open here too. */
import { Ask } from "@/ui/Ask";
import { currentActor, currentRole, currentSession, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { recipesFor } from "@/recipes/store";
import { companyRecipes } from "@/company/creations";
import type { SkillOption } from "@/ui/SlashMenu";
import { getConversation, listMessages } from "@/chat/persist";
import { workspaceStats } from "@/ui/stats";
import { paneContext } from "@/ui/paneContext";
import { askCopy } from "@/workspace/copy";
import { sql } from "@/db/client";
import { registry } from "@/skills/registry";
import { teamSkills } from "@/skills/team";
import { resolveAsk } from "@/dashboard/ask";
import { decodeAsk } from "@/dashboard/askref";
import { by, signal } from "@/learning/signals";

export const dynamic = "force-dynamic";

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; ask?: string }> }) {
  const ws = await currentWorkspaceId();
  const [sp, role] = await Promise.all([searchParams, currentRole(ws)]);
  const session = await currentSession();
  let conversation: string | null = null;
  let messages: Awaited<ReturnType<typeof listMessages>> = [];
  if (sp.c && /^[0-9a-f-]{36}$/.test(sp.c)) {
    const c = await getConversation(sp.c, ws, session?.uid ?? null);
    if (c) { conversation = c.id; messages = await listMessages(c.id); }
  }
  // "Ask why" from the dashboard: the link names the click; the figures are read again here
  const askRef = !conversation ? decodeAsk(sp.ask) : null;
  const askContext = askRef ? await resolveAsk(ws, askRef).catch(() => null) : null;
  const [s, client, pane, skills] = await Promise.all([workspaceStats(ws), clientBrandName(ws), paneContext(messages, ws), teamSkills(ws, role).catch(() => [])]);
  const actor = await currentActor();
  if (askRef && askContext) await signal(by(actor, ws, role.id), "dashboard.ask_why", { k: askRef.k });
  // the team's own analyses first: Fair's recipes for this role, then what the team made (its badge says whose)
  const [fairR, ownR] = await Promise.all([recipesFor(role.recipes).catch(() => []), actor ? companyRecipes(ws, role.id, actor.email).catch(() => []) : Promise.resolve([])]);
  const teamMenu: SkillOption[] = [
    ...fairR.map((r) => ({ name: `recipe:${r.key}`, title: r.title, description: r.description, example: r.examples[0] ?? r.title, group: `${role.codename}'s analyses`, badge: "Fair" })),
    ...ownR.filter((r) => !fairR.some((f) => f.key === r.key)).map((r) => ({ name: `recipe:${r.key}`, title: r.title, description: r.description, example: r.examples[0] ?? r.title, group: `${role.codename}'s analyses`, badge: r._creation.status === "approved" ? client ?? "Your team" : "Yours, not shared yet", by: r._creation.maker })),
  ];
  const menu: SkillOption[] = [...teamMenu, ...skills.map((d) => ({ name: d.name, title: d.title, description: d.description, example: d.example, group: registry.layers[d.layer]?.title ?? d.layer }))];
  const team = { codename: role.codename, builder: !!actor && can(actor, "company.change", { workspace: ws, role: role.id }) };
  const copy = await askCopy(ws, s, role);
  return <Ask key={conversation ?? (askContext ? `ask-${sp.ask}` : "new")} initialConversation={conversation} initialMessages={messages} prefill={sp.q ?? undefined} stats={{ brands: s.brands, platforms: s.platforms, months: s.months, freshness: s.freshness }} clientName={client} pane={pane} copy={copy} skills={menu} fromDashboard={askRef && askContext ? { ref: askRef, context: askContext } : null} team={team} />;
}

async function clientBrandName(ws: string): Promise<string | null> {
  const r = (await sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [ws])) as { name: string }[];
  return r[0]?.name ?? null;
}
