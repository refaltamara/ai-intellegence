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
import { latestInsights } from "@/learning/insights";
import { measureVersion, originDetails, originPhrase } from "@/learning/outcomes";
import { FIXED_MEASURES, measureOf, suggestMeasures } from "@/learning/measures";
import { allCreations, KIND_LABEL } from "@/company/creations";
import { listSuggestions } from "@/company/changes";
import { OriginsEditor } from "@/ui/admin/OriginsEditor";
import { Readings } from "@/ui/admin/Readings";

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
  // where it came from and what it should move (src/learning/outcomes.ts)
  const [insights, creations, suggestions, reading] = await Promise.all([latestInsights(role), allCreations({ role, status: ["approved", "waiting"] }), listSuggestions({}), measureVersion(role, version)]);
  const origins = reading?.origins ?? [];
  const phrase = originPhrase(await originDetails(role, origins));
  const titles = Object.fromEntries([...recipes.values()].map((x) => [x.key, x.title]));
  const suggested = suggestMeasures(base, spec);
  const measureKeys = [...new Set([...suggested, ...(spec.recipes ?? []).map((k) => `analysis:${k}`), ...FIXED_MEASURES, ...(reading?.keys ?? [])])];
  const originItems: { kind: "insight" | "creation" | "suggestion"; ref: string; text: string; who?: string | null }[] = [
    ...insights.filter((i) => i.family !== "outcome").map((i) => ({ kind: "insight" as const, ref: i.key, text: i.sentence })),
    ...creations.map((c) => ({ kind: "creation" as const, ref: c.id, text: `${KIND_LABEL[c.kind]}: ${c.title}`, who: c.workspace_name })),
    ...suggestions.filter((x) => x.role === role).map((x) => ({ kind: "suggestion" as const, ref: x.id, text: `${x.title ?? x.ref}: ${x.note ?? ""}`, who: `${x.workspace_name} · ${x.status}` })),
  ];
  // an origin that has since gone (an insight no longer rolled up) stays listed so it can be kept
  for (const o of origins) if (!originItems.some((i) => i.kind === o.kind && i.ref === o.ref)) originItems.push({ kind: o.kind, ref: o.ref, text: (await originDetails(role, [o]))[0]?.text ?? o.ref });
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
        <div className="cmsblock">
          <header><h2>Where it came from</h2>{phrase && <span className="pill">{phrase}</span>}</header>
          <OriginsEditor
            role={role}
            version={version}
            editable={(editable && can(actor, "role.draft")) || can(actor, "role.release")}
            items={originItems}
            chosen={origins}
            measures={measureKeys.map((k) => ({ key: k, label: measureOf(k, titles)?.label ?? k, suggested: suggested.includes(k) })).filter((m) => m.label !== m.key || m.key.includes(":"))}
            chosenMeasures={reading?.keys ?? []}
          />
        </div>
        {reading && reading.state !== "not_released" && (
          <div className="cmsblock">
            <header><h2>Before and after</h2></header>
            <Readings r={reading} codename={r.codename} />
          </div>
        )}
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
