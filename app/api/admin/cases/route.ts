/**
 * Cases in the CMS (DECISIONS, 10 Oct 2026, step 5; src/cases/store.ts). Fair's owners and data ops set a case up on a
 * workspace; only those on a case's access list see it or change it. POST { action, workspace_id, ... }:
 *   save    { case: { id?, name, about?, starts_on, ends_on?, terms[], platforms[], pace, scraper_request?, access[] } }
 *   close   { id }
 *   reopen  { id }
 */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { saveCase, setCaseStatus, type CaseInput } from "@/cases/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "case.manage")) return no("Only Fair's owners and data ops set up cases.", 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ws = String(b.workspace_id ?? "");
  if (!ws || !can(actor, "workspace.data", { workspace: ws })) return no("Unknown workspace.", 404);
  if (b.action === "save") {
    const r = await saveCase(actor, ws, (b.case ?? {}) as CaseInput);
    return r.ok ? Response.json(r) : no(r.error);
  }
  if (b.action === "close" || b.action === "reopen") {
    const r = await setCaseStatus(actor, ws, String(b.id ?? ""), b.action === "close" ? "closed" : "open");
    return r.ok ? Response.json(r) : no(r.error);
  }
  return no("Unknown action.");
}
