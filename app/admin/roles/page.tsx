import Link from "next/link";
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { companyStates, currentOf, roleVersions } from "@/cms/data";
import { ROLES } from "@/roles/model";
import { listWorkspaces } from "@/workspace/store";
import { RoleActions } from "@/ui/admin/RoleActions";

export const dynamic = "force-dynamic";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "");

/** Roles: each role's versions, who released them, and which clients run them. Drafts come from the Role Lab (phase 3) or `pnpm role draft`. */
export default async function AdminRoles() {
  const [actor, versions, companies, workspaces] = await Promise.all([currentActor(), roleVersions(), companyStates(), listWorkspaces()]);
  const drafts = !!actor && can(actor, "role.draft");
  const rollback = !!actor && can(actor, "role.rollback");
  const names = new Map(workspaces.map((w) => [w.id, w.name]));
  return (
    <section className="screen">
      <div className="topbar"><div><h1>Roles</h1><span className="meta">Only Refal or Rafli release; role owners roll back</span></div></div>
      <div className="wrap wide cms">
        {Object.values(ROLES).map((r) => {
          const rows = versions.filter((v) => v.role === r.id);
          const cur = currentOf(versions, r.id);
          const released = rows.filter((v) => v.status === "released").length;
          const clients = companies.filter((c) => c.role === r.id);
          return (
            <div key={r.id} className="cmsblock" data-tone={r.tone}>
              <header><span className="cn">{r.codename}</span><h2>{r.label}</h2><span className="pill">current {cur?.version ?? `${r.version} (built-in)`}</span>{drafts && !rows.some((v) => v.status === "draft" || v.status === "proposed") && <RoleActions role={r.id} action="draft" label="New draft" confirmText="" />}</header>
              <div className="tablewrap people">
                <table>
                  <thead><tr><th>Version</th><th>Status</th><th>Note</th><th>Proposed</th><th>Released</th><th /></tr></thead>
                  <tbody>
                    {rows.map((v) => (
                      <tr key={v.version}>
                        <td><Link href={`/admin/roles/${r.id}/${v.version}`}><b>{v.version}</b></Link></td>
                        <td><span className={`st ${v.status}`}>{v.version === cur?.version ? "current" : v.stage_workspaces?.length && v.status === "released" ? `staged to ${v.stage_workspaces.length}` : v.status.replace("_", " ")}</span></td>
                        <td className="wrapcell">{v.release_note ?? ""}</td>
                        <td className="muted">{v.proposed_by ?? ""}</td>
                        <td className="muted">{v.released_by ? `${v.released_by} · ${when(v.released_at)}` : ""}{v.rolled_back_by ? ` · rolled back by ${v.rolled_back_by}` : ""}</td>
                        <td>
                          {(v.status === "draft" || v.status === "proposed" || v.stage_workspaces?.length) && <Link className="btn sm" href={`/admin/roles/${r.id}/${v.version}`}>{v.status === "draft" ? "Open draft" : v.status === "proposed" ? "Review" : "Staged"}</Link>}
                          {v.version === cur?.version && released > 1 && rollback && <RoleActions role={r.id} action="rollback" label="Roll back" confirmText={`Roll ${r.codename} ${v.version} back? Clients return to the release before it, with their own changes intact.`} />}
                        </td>
                      </tr>
                    ))}
                    {!rows.length && <tr><td className="muted" colSpan={6}>Not seeded yet: run pnpm role seed.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="hint">{clients.length ? clients.map((c) => `${names.get(c.workspace_id) ?? c.workspace_id}: ${c.base_version ? `pinned to ${c.base_version}` : "follows the latest"}, ${c.changes} change${c.changes === 1 ? "" : "s"} of their own`).join(" · ") : "No client has changed this role yet; every workspace that offers it runs the current release."}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
