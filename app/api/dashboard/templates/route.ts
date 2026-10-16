/**
 * The Dashboard template library (src/dashboard/library.ts). GET: Fair's default for the team's role and every
 * template saved on the workspace. POST { action: "save", name, description? } saves the team's Dashboard as a
 * template; POST { action: "use", id } makes a template (or "fair") the team's Dashboard. Saving and using are a
 * Builder's (the Dashboard is locked for Members); anyone on the team may browse.
 */
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { listDashTemplates, saveDashTemplate, useDashTemplate } from "@/dashboard/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => Response.json({ error }, { status });

export async function GET() {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return no("unauthorised", 401);
  const role = await currentRole(ws);
  if (!can(actor, "role.use", { workspace: ws, role: role.id })) return no("forbidden", 403);
  return Response.json({ templates: await listDashTemplates(ws, role.id) });
}

export async function POST(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return no("unauthorised", 401);
  const role = await currentRole(ws);
  const b = (await req.json().catch(() => ({}))) as { action?: string; name?: unknown; description?: unknown; id?: unknown };
  if (b.action === "save") {
    const r = await saveDashTemplate(actor, ws, role.id, String(b.name ?? "").trim().slice(0, 60), String(b.description ?? "").trim().slice(0, 200));
    return r.ok ? Response.json(r) : no(r.error, 403);
  }
  if (b.action === "use") {
    const id = String(b.id ?? "");
    if (id !== "fair" && !/^[0-9a-f-]{36}$/.test(id)) return no("No such template.");
    const r = await useDashTemplate(actor, ws, role.id, id);
    return r.ok ? Response.json(r) : no(r.error, 403);
  }
  return no("Unknown action.");
}
