import Link from "next/link";
import { workspaceStates } from "@/cms/data";
import { currentActor } from "@/auth/current";
import { ROLES } from "@/roles/model";
import { fmtNum } from "@/ui/format";

export const dynamic = "force-dynamic";

const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–");

/** Workspaces: every client workspace, its status, data and people; a new one starts the onboarding wizard. */
export default async function AdminWorkspaces() {
  const rows = await workspaceStates((await currentActor())?.hidden);
  return (
    <section className="screen">
      <div className="topbar"><div><h1>Workspaces</h1><span className="meta">{rows.length} workspaces</span></div><Link className="btn pri sm" href="/admin/workspaces/new">New workspace</Link></div>
      <div className="wrap wide cms">
        <div className="tablewrap people">
          <table>
            <thead><tr><th>Workspace</th><th>Status</th><th>Teams</th><th>Client</th><th className="num">Posts</th><th className="num">Off-topic</th><th className="num">Comments</th><th>Data through</th><th>Last load</th><th className="num">People</th><th /></tr></thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td><Link href={`/admin/workspaces/${w.id}`}><b>{w.name}</b></Link><small>{w.id} · {w.kind === "profile" ? "profile" : "category"}{w.category ? ` · ${w.category}` : ""}</small></td>
                  <td><span className={`wstatus ${w.status}`}>{w.status}</span>{w.health ? <small>{w.health}</small> : null}</td>
                  <td>{w.roles.map((r) => ROLES[r].codename).join(", ")}</td>
                  <td>{w.client ?? <span className="muted">none</span>}</td>
                  <td className="num">{fmtNum(w.posts)}</td>
                  <td className="num">{w.off_topic ? fmtNum(w.off_topic) : "–"}</td>
                  <td className="num">{fmtNum(w.comments)}</td>
                  <td>{day(w.data_through)}</td>
                  <td>{day(w.last_load)}</td>
                  <td className="num">{w.members}{w.builders ? <small>{w.builders} Builder{w.builders === 1 ? "" : "s"}</small> : null}{w.invites ? <small>{w.invites} invited</small> : null}</td>
                  <td className="acts"><Link className="btn sm" href={`/admin/workspaces/${w.id}`}>Data</Link><Link className="btn sm ghost" href={`/admin/people?ws=${w.id}`}>People</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">People counts are client people; Fair staff reach every workspace. Clients only see a live workspace. Profile workspaces still load with etl/load_profile.py; listening clients onboard here.</p>
      </div>
    </section>
  );
}
