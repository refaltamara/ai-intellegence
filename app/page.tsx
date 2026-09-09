/** Today (PRD-v2 §7): the brief first. Old /?c= links redirect into the thread's decision. */
import { redirect } from "next/navigation";
import { Today } from "@/ui/Today";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { currentSession } from "@/auth/current";
import { getConversation } from "@/chat/persist";
import { dataKey } from "@/brief/generate";
import { latestBrief, markSeen, type BriefRow } from "@/brief/store";
import { listDecisions } from "@/decisions/store";
import { sql } from "@/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams;
  const session = await currentSession();
  if (sp.c && /^[0-9a-f-]{36}$/.test(sp.c)) {
    const c = await getConversation(sp.c, DEFAULT_WORKSPACE_ID, session?.uid ?? null);
    if (c?.decision_id) redirect(`/d/${c.decision_id}?c=${c.id}`);
  }
  // Render at once with the brief we have; if the data has moved since it was written,
  // the page asks for a new one in the background rather than blocking on three analyses.
  const [latest, key, decisions, client] = await Promise.all([
    latestBrief(DEFAULT_WORKSPACE_ID).catch(() => null),
    dataKey(DEFAULT_WORKSPACE_ID).catch(() => ""),
    listDecisions(DEFAULT_WORKSPACE_ID, "open"),
    clientBrandName(),
  ]);
  const brief: BriefRow | null = latest;
  const stale = !brief || brief.data_key !== key;
  if (brief && !brief.seen_at) await markSeen(brief.id).catch(() => undefined);
  const dateLine = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
  return <Today brief={brief?.content ?? null} evidence={brief?.evidence ?? []} generatedAt={brief?.generated_at ?? null} stale={stale} decisions={decisions.slice(0, 8)} clientName={client} dateLine={dateLine} canRefresh={!!session} />;
}

async function clientBrandName(): Promise<string | null> {
  const r = (await sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [DEFAULT_WORKSPACE_ID])) as { name: string }[];
  return r[0]?.name ?? null;
}
