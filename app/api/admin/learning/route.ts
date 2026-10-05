/**
 * The learning loop from the CMS (src/learning/). POST { action, ... }:
 *   rollup    { }                                   recompute today's insights now (role owners, Refal, Rafli)
 *   origins   { role, version, origins, measures }  what a version started from and what it should move (role owners on a draft or proposal; Refal or Rafli any time)
 *   learning  { ws, on }                            switch a workspace in or out of learning across clients (data ops, Refal, Rafli)
 */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { isRoleId } from "@/roles/model";
import { rollUp } from "@/learning/insights";
import { isOrigin, setOrigins } from "@/learning/outcomes";
import { setLearning } from "@/learning/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const no = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "cms.open")) return no("forbidden", 403);
  const b = (await req.json().catch(() => ({}))) as { action?: string; role?: string; version?: string; origins?: unknown; measures?: unknown; ws?: string; on?: unknown };
  switch (b.action) {
    case "rollup":
      if (!can(actor, "role.draft")) return no("Only role owners recompute insights.", 403);
      return Response.json({ ok: true, insights: await rollUp() });
    case "origins": {
      if (!can(actor, "role.draft")) return no("Only role owners say where a version came from.", 403);
      if (!isRoleId(b.role)) return no("Unknown role.");
      const origins = Array.isArray(b.origins) ? b.origins.filter(isOrigin) : [];
      const measures = Array.isArray(b.measures) ? b.measures.filter((m): m is string => typeof m === "string") : [];
      const r = await setOrigins(b.role, String(b.version ?? ""), origins, measures, { email: actor.email, staff: actor.staff });
      return r.ok ? Response.json(r) : no(r.error);
    }
    case "learning": {
      if (!b.ws || !can(actor, "workspace.data")) return no("Only data ops, Refal or Rafli switch a workspace's learning.", 403);
      return (await setLearning(b.ws, b.on === true, actor.email)) ? Response.json({ ok: true }) : no("No such workspace.");
    }
    default:
      return no("Unknown action.");
  }
}
