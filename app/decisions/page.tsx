/** Decisions (PRD-v2 §7, amended): CeMO's proactive side — the brief, what the watchers noticed, and the decisions themselves. */
import { Decisions } from "@/ui/Decisions";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { currentSession } from "@/auth/current";
import { dataKey } from "@/brief/generate";
import { latestBrief, markSeen } from "@/brief/store";
import { listDecisions } from "@/decisions/store";
import { sql } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const session = await currentSession();
  const [latest, key, decisions, client] = await Promise.all([
    latestBrief(DEFAULT_WORKSPACE_ID).catch(() => null),
    dataKey(DEFAULT_WORKSPACE_ID).catch(() => ""),
    listDecisions(DEFAULT_WORKSPACE_ID),
    clientBrandName(),
  ]);
  if (latest && !latest.seen_at) await markSeen(latest.id).catch(() => undefined);
  const dateLine = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
  return <Decisions decisions={decisions} brief={latest?.content ?? null} evidence={latest?.evidence ?? []} generatedAt={latest?.generated_at ?? null} stale={!latest || latest.data_key !== key} clientName={client} dateLine={dateLine} canRefresh={!!session} />;
}

async function clientBrandName(): Promise<string | null> {
  const r = (await sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [DEFAULT_WORKSPACE_ID])) as { name: string }[];
  return r[0]?.name ?? null;
}
