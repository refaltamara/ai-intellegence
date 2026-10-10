/**
 * A workspace's loads in the CMS (src/loader/; DECISIONS, 10 Oct 2026). Fair's data ops and owners. POST { action, workspace_id, load_id }:
 *   let_in    a held load goes in anyway, recorded with who decided; returns the job that promotes it
 *   discard   throw a load away whole (a held or staged one; a live one stays)
 *   reload    load the same raw files again, through the same checks; returns the job
 * Jobs run in slices: the page runs them with the onboarding API's `run`, the cron every five minutes otherwise.
 */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { sql } from "@/db/client";
import { audit } from "@/roles/store";
import { enqueueJob } from "@/extensions/store";
import { letIn } from "@/loader/run";
import { getCase } from "@/cases/store";
import { discardLoad } from "@/loader/stage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "workspace.data")) return no("Only Fair's data ops and owners manage loads.", 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ws = String(b.workspace_id ?? "");
  if (!ws || !can(actor, "workspace.data", { workspace: ws })) return no("Unknown workspace.", 404);
  const l = ((await sql.query(`select id, source, status, files, case_id from staging.loads where id = $1 and workspace_id = $2`, [String(b.load_id ?? ""), ws])) as { id: string; source: string; status: string; files: { path: string }[]; case_id: string | null }[])[0];
  if (!l) return no("No such load.", 404);
  // a case's load is handled by Fair's owners and data ops on that case's list; to anyone else it is not there (step 5)
  if (l.case_id) {
    const c = await getCase(l.case_id);
    if (!c || !can(actor, "case.manage", { workspace: ws, case: c })) return no("No such load.", 404);
  }
  const forCase = l.case_id ? { case_id: l.case_id } : {};
  const by = actor.email;
  switch (b.action) {
    case "let_in": {
      if (l.status !== "held") return no("Only a held load can be let in.");
      await letIn(l.id, by);
      const job = await enqueueJob(ws, "load", { source: l.source, files: l.files.map((f) => f.path), load_id: l.id, started_by: by, ...forCase }, by);
      await audit({ workspace_id: ws, actor: by, area: "data", action: "load_let_in", new: { load: l.id } });
      return Response.json({ ok: true, job_id: job });
    }
    case "discard": {
      if (l.status === "live" || l.status === "promoting") return no("A load that went in stays; load corrected files to change it.");
      await discardLoad(l.id, by);
      await audit({ workspace_id: ws, actor: by, area: "data", action: "load_discard", new: { load: l.id } });
      return Response.json({ ok: true });
    }
    case "reload": {
      const job = await enqueueJob(ws, "load", { source: l.source, files: l.files.map((f) => f.path), promote: "auto", started_by: by, ...forCase }, by);
      await audit({ workspace_id: ws, actor: by, area: "data", action: "load_again", new: { from: l.id } });
      return Response.json({ ok: true, job_id: job });
    }
    default:
      return no("Unknown action.");
  }
}
