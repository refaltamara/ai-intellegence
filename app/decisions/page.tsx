/** Decisions (PRD-v2 §7, amended): CeMO's proactive side — the brief, what the watchers noticed, and the decisions themselves. */
import { Decisions } from "@/ui/Decisions";
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { dataKey } from "@/brief/generate";
import { latestBrief, markSeen } from "@/brief/store";
import { listDecisions } from "@/decisions/store";
import { sql } from "@/db/client";
import { getWorkspace } from "@/workspace/store";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const ws = await currentWorkspaceId();
  const session = await currentSession();
  const [latest, key, decisions, client] = await Promise.all([
    latestBrief(ws).catch(() => null),
    dataKey(ws).catch(() => ""),
    listDecisions(ws),
    clientBrandName(ws),
  ]);
  if (latest && !latest.seen_at) await markSeen(latest.id).catch(() => undefined);
  const cfg = await getWorkspace(ws);
  const dateLine = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
  return <Decisions decisions={decisions} brief={latest?.content ?? null} evidence={latest?.evidence ?? []} generatedAt={latest?.generated_at ?? null} stale={!latest || latest.data_key !== key} clientName={client} dateLine={dateLine} canRefresh={!!session} label={cfg?.category_label} kind={cfg?.kind} />;
}

async function clientBrandName(ws: string): Promise<string | null> {
  const r = (await sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [ws])) as { name: string }[];
  return r[0]?.name ?? null;
}
