/**
 * The team's version of its role (src/company/changes.ts). POST { action, ... }:
 *   preview   { changes }            what a change would do, field by field (anyone on the team)
 *   apply     { changes, note? }     apply it for everyone (a Builder)
 *   undo      { version }            undo one change set (a Builder)
 *   suggest   { kind, ref, note }    send a company item to Fair (a Builder)
 *   personal  { settings }           a person's own settings (tile order, default window, answer length)
 */
import { currentActor, currentRole, currentSession, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { applyChange, previewChange, suggestToFair, undoVersion } from "@/company/changes";
import { setPersonal } from "@/roles/store";
import type { Overrides } from "@/roles/policy";
import { valueAt } from "@/roles/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => Response.json({ error }, { status });
const obj = (v: unknown): Overrides => (v && typeof v === "object" && !Array.isArray(v) ? (v as Overrides) : {});

export async function POST(req: Request) {
  const [actor, ws, session] = await Promise.all([currentActor(), currentWorkspaceId(), currentSession()]);
  if (!actor || !session) return no("unauthorised", 401);
  const role = await currentRole(ws);
  if (!can(actor, "role.use", { workspace: ws, role: role.id })) return no("forbidden", 403);
  const b = (await req.json().catch(() => ({}))) as { action?: string; changes?: unknown; note?: string; version?: number; kind?: string; ref?: string; settings?: unknown };
  switch (b.action) {
    case "preview":
      return Response.json({ ok: true, preview: await previewChange(ws, role.id, obj(b.changes)) });
    case "apply": {
      const r = await applyChange(actor, ws, role.id, obj(b.changes), b.note ?? null);
      return r.ok ? Response.json(r) : no(r.error, 403);
    }
    case "undo": {
      const r = await undoVersion(actor, ws, role.id, Number(b.version));
      return r.ok ? Response.json(r) : no(r.error, 403);
    }
    case "suggest": {
      const kind = b.kind === "setting" ? "setting" : "creation";
      const ref = String(b.ref ?? "");
      const r = await suggestToFair(actor, ws, role.id, { kind, ref, value: kind === "setting" ? valueAt(role, ref) : undefined }, String(b.note ?? ""));
      return r.ok ? Response.json(r) : no(r.error, 403);
    }
    case "personal": {
      const kept = await setPersonal(ws, session.uid, role.id, obj(b.settings));
      return Response.json({ ok: true, kept });
    }
    default:
      return no("Unknown action.");
  }
}
