import Link from "next/link";
import { workspaceStates } from "@/cms/data";
import { ROLES } from "@/roles/model";
import { fmtNum } from "@/ui/format";

export const dynamic = "force-dynamic";

const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–");

/** Workspaces: every client workspace, its data and its people. The onboarding wizard and health checks come in phase 6. */
export default async function AdminWorkspaces() {
  const rows = await workspaceStates();
  return (
    <section className="screen">
      <div className="topbar"><div><h1>Workspaces</h1><span className="meta">{rows.length} workspaces</span></div></div>
      <div className="wrap wide cms">
        <div className="tablewrap people">
          <table>
            <thead><tr><th>Workspace</th><th>Teams</th><th>Client</th><th className="num">Posts</th><th className="num">Off-topic</th><th className="num">Comments</th><th>Data through</th><th>Last load</th><th className="num">People</th><th /></tr></thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td><b>{w.name}</b><small>{w.id} · {w.kind === "profile" ? "profile" : "category"}{w.category ? ` · ${w.category}` : ""}</small></td>
                  <td>{w.roles.map((r) => ROLES[r].codename).join(", ")}</td>
                  <td>{w.client ?? <span className="muted">none</span>}</td>
                  <td className="num">{fmtNum(w.posts)}</td>
                  <td className="num">{w.off_topic ? fmtNum(w.off_topic) : "–"}</td>
                  <td className="num">{fmtNum(w.comments)}</td>
                  <td>{day(w.data_through)}</td>
                  <td>{day(w.last_load)}</td>
                  <td className="num">{w.members}{w.builders ? <small>{w.builders} Builder{w.builders === 1 ? "" : "s"}</small> : null}{w.invites ? <small>{w.invites} invited</small> : null}</td>
                  <td><Link className="btn sm" href={`/admin/people?ws=${w.id}`}>People</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">People counts are client people; Fair staff reach every workspace. Creating a workspace, uploading a dump and data health come with onboarding (phase 6); until then data ops loads with the scripts.</p>
      </div>
    </section>
  );
}
