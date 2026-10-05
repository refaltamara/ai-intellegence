/**
 * Role versions from the CMS (DECISIONS, 4 Oct 2026). POST { action, role, version?, ... }:
 *   draft        a role owner starts the next minor version, copied from the current release
 *   save         a role owner changes a draft's fields (src/roles/store.ts DRAFT_FIELDS)
 *   test         run the draft's tests; `keys` narrows to some cases (one golden question per call)
 *   propose      a role owner proposes a draft whose tests all ran since its last edit and none failed
 *   release      Refal or Rafli release a proposal, to `stage` workspaces first or to everyone
 *   release_all  a staged release goes out to everyone
 *   rollback     a role owner rolls the current release back
 */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { isRoleId } from "@/roles/model";
import { draftSpec, newDraft, proposeVersion, releaseToAll, releaseVersion, rollbackRole, updateDraft, type DraftPatch } from "@/roles/store";
import { readiness, runTests, type TestKind } from "@/roles/tests";
import { invalidateSystem } from "@/chat/loop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const no = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "cms.open")) return no("forbidden", 403);
  const b = (await req.json().catch(() => ({}))) as { action?: string; role?: string; version?: string; note?: string; patch?: DraftPatch; kinds?: TestKind[]; keys?: string[]; stage?: string[] };
  if (!isRoleId(b.role)) return no("Unknown role.");
  const role = b.role;
  const version = String(b.version ?? "");
  const who = { email: actor.email, staff: actor.staff };
  const owner = can(actor, "role.release");
  const roleOwner = can(actor, "role.draft");
  switch (b.action) {
    case "draft": {
      if (!roleOwner) return no("Only role owners start a draft.", 403);
      const r = await newDraft(role, who, b.note || undefined);
      return r.ok ? Response.json(r) : no(r.error);
    }
    case "save": {
      if (!roleOwner) return no("Only role owners change a draft.", 403);
      const r = await updateDraft(role, version, b.patch ?? {}, who);
      return r.ok ? Response.json(r) : no(r.error);
    }
    case "test": {
      if (!roleOwner) return no("Only role owners run a draft's tests.", 403);
      const spec = await draftSpec(role, version);
      if (!spec) return no("No such version.");
      const s = await runTests(spec, { kinds: b.kinds, keys: b.keys });
      return Response.json({ ok: true, summary: { pass: s.pass, fail: s.fail, skip: s.skip, error: s.error }, results: s.results });
    }
    case "propose": {
      if (!roleOwner) return no("Only role owners propose a version.", 403);
      const spec = await draftSpec(role, version);
      if (!spec) return no("No such version.");
      const ready = await readiness(role, version, spec._updated_at);
      if (!ready.ready) return no(ready.failing.length ? `Tests failing: ${ready.failing.join(", ")}.` : `Tests not run since the last edit: ${ready.missing.join(", ")}.`);
      if (!b.note?.trim()) return no("Write a release note: what changed and why.");
      const r = await proposeVersion(role, version, ready, b.note.trim(), who);
      return r.ok ? Response.json(r) : no(r.error);
    }
    case "release": {
      if (!owner) return no("Only Refal or Rafli can release a version.", 403);
      // a draft is released only once it is proposed: its tests ran and passed
      if ((await draftSpec(role, version))?._status !== "proposed") return no("Only a proposed version can be released; its tests must pass first.");
      const r = await releaseVersion(role, version, who, b.note || undefined, b.stage?.length ? b.stage : null);
      if (r.ok) invalidateSystem();
      return r.ok ? Response.json(r) : no(r.error);
    }
    case "release_all": {
      if (!owner) return no("Only Refal or Rafli can release a version.", 403);
      const r = await releaseToAll(role, version, who);
      if (r.ok) invalidateSystem();
      return r.ok ? Response.json(r) : no(r.error);
    }
    case "rollback": {
      if (!can(actor, "role.rollback")) return no("Only role owners can roll a role back.", 403);
      const r = await rollbackRole(role, who, b.note || undefined);
      if (r.ok) invalidateSystem();
      return r.ok ? Response.json(r) : no(r.error);
    }
    default:
      return no("Unknown action.");
  }
}
