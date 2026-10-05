/**
 * Credits from the CMS (owners only: Refal, Rafli). POST { action, workspace_id, ... }:
 *   pool     { pool }        the monthly pool (the note of a prompt may carry it)
 *   billing  { enforce }     whether reaching the limit stops credit actions
 *   topup    { credits }     credits added for this month
 */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { creditSettings, setPool, topUp } from "@/credits/ledger";
import { DEFAULT_MONTHLY_POOL } from "@/config/credits";
import { getWorkspace } from "@/workspace/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "billing.manage")) return no("Only Refal or Rafli change credits.", 403);
  const b = (await req.json().catch(() => ({}))) as { action?: string; workspace_id?: string; pool?: unknown; enforce?: unknown; credits?: unknown; note?: string };
  const ws = String(b.workspace_id ?? "");
  if (!(await getWorkspace(ws))) return no("Unknown workspace.");
  const s = await creditSettings(ws);
  if (b.action === "pool") {
    const raw = String(b.pool ?? b.note ?? "").trim();
    const pool = Number(raw.replace(/[^\d.]/g, ""));
    if (!raw || !Number.isFinite(pool) || pool < 0) return no("The pool is a number of credits.");
    await setPool(ws, pool, !!s.enforce, actor.email);
    return Response.json({ ok: true });
  }
  if (b.action === "billing") {
    await setPool(ws, s.pool ?? DEFAULT_MONTHLY_POOL, b.enforce === true, actor.email);
    return Response.json({ ok: true });
  }
  if (b.action === "topup") {
    const credits = Number(String(b.credits ?? b.note ?? "").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(credits) || credits <= 0) return no("A top-up is a number of credits.");
    await topUp(ws, credits, actor.email, null);
    return Response.json({ ok: true });
  }
  return no("Unknown action.");
}
