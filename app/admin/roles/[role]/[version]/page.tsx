import Link from "next/link";
import { notFound } from "next/navigation";
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { ROLES, isRoleId } from "@/roles/model";
import { draftSpec, fairVersion } from "@/roles/store";
import { diffRoles } from "@/roles/diff";
import { caseResults, listCases, readiness } from "@/roles/tests";
import { fairRecipes } from "@/recipes/store";
import { templatesFor } from "@/decks/templates";
import { listWorkspaces, getWorkspace } from "@/workspace/store";
import { hasModelCredentials } from "@/chat/loop";
import { DraftEditor } from "@/ui/admin/DraftEditor";
import { TestPanel } from "@/ui/admin/TestPanel";
import { ProposeRelease } from "@/ui/admin/ProposeRelease";
import { LabChat } from "@/ui/admin/LabChat";
import { labSession } from "@/roles/lab";

export const dynamic = "force-dynamic";

/** One version of a role: edit the draft, run its tests, propose it, release it (to a few workspaces first, then everyone). */
export default async function RoleVersionPage({ params }: { params: Promise<{ role: string; version: string }> }) {
  const { role, version } = await params;
  if (!isRoleId(role)) notFound();
  const [actor, spec, current, cases, recipes, workspaces] = await Promise.all([currentActor(), draftSpec(role, version), fairVersion(role), listCases(role), fairRecipes(), listWorkspaces()]);
  if (!spec || !actor) notFound();
  const base = current ?? ROLES[role];
  const [results, ready] = await Promise.all([caseResults(role, version, spec._updated_at), readiness(role, version, spec._updated_at)]);
  const offering = (await Promise.all(workspaces.map(async (w) => ({ ...w, roles: (await getWorkspace(w.id))?.roles ?? [] })))).filter((w) => w.roles.includes(role));
  const editable = spec._status === "draft" || spec._status === "proposed";
  const r = ROLES[role];
  return (
    <section className="screen">
      <div className="topbar"><div><h1><Link href="/admin/roles">Roles</Link> / {r.codename} {version}</h1><span className="meta">{r.label} · {spec._status.replace("_", " ")}{spec._stage?.length ? ` · staged to ${spec._stage.join(", ")}` : ""}</span></div></div>
      <div className="wrap wide cms">
        <div className="cmsblock" data-tone={r.tone}>
          <header><span className="cn">{r.codename}</span><h2>What {version} changes against {base.version}</h2></header>
          {(() => {
            const d = diffRoles(base, spec);
            return d.length ? <ul className="difflist">{d.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="hint">Nothing yet: it is a copy of {base.version}.</p>;
          })()}
        </div>
        {editable && can(actor, "role.draft") && (await (async () => {
          const session = await labSession(role, version, actor.email);
          return <LabChat role={role} version={version} initial={session.messages.map((m) => ({ role: m.role, text: m.text, actions: m.actions }))} model={hasModelCredentials()} tokens={session.tokens} />;
        })())}
        {editable && (
          <DraftEditor
            role={role}
            version={version}
            canEdit={can(actor, "role.draft")}
            spec={{ description: spec.description, voice: spec.voice, hero_title: spec.hero_title ?? "", hero_intro: spec.hero_intro ?? "", suggested: spec.suggested ?? [], recipes: spec.recipes ?? [], deck_templates: spec.deck_templates, skill_order: spec.skill_order ?? [], alert: spec.alert ?? null, watch: spec.watch ?? null }}
            recipes={[...recipes.values()].filter((x) => x.roles.includes(role)).map((x) => ({ key: x.key, title: x.title, description: x.description }))}
            templates={templatesFor(role).map((t) => ({ key: t.key, name: t.name }))}
          />
        )}
        <TestPanel
          role={role}
          version={version}
          canRun={editable && can(actor, "role.draft")}
          model={hasModelCredentials()}
          cases={cases.filter((c) => c.active).map((c) => ({ key: c.key, kind: c.kind, workspace: c.spec.kind === "guard" ? null : c.spec.workspace, q: c.spec.kind === "question" ? c.spec.q : null, result: results.get(c.key) ? { status: results.get(c.key)!.status, detail: results.get(c.key)!.detail } : null }))}
        />
        <ProposeRelease
          role={role}
          version={version}
          status={spec._status}
          note={spec._note}
          ready={ready}
          stage={spec._stage}
          canPropose={can(actor, "role.draft")}
          canRelease={can(actor, "role.release")}
          workspaces={offering.map((w) => ({ id: w.id, name: w.name }))}
        />
      </div>
    </section>
  );
}
