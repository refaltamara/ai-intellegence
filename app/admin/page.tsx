import Link from "next/link";
import { currentActor } from "@/auth/current";
import { listInvites } from "@/auth/invites";
import { listStaff } from "@/auth/accounts";
import { auditRows, currentOf, roleVersions, workspaceStates } from "@/cms/data";
import { ROLES } from "@/roles/model";
import { fmtNum } from "@/ui/format";

export const dynamic = "force-dynamic";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–");
const daysAgo = (d: string | null) => (d ? Math.round((Date.now() - Date.parse(d)) / 86400000) : null);

/** CMS Home: the roles as they stand, and what needs someone today. */
export default async function AdminHome() {
  const actor = await currentActor();
  const [versions, workspaces, invites, staff, recent] = await Promise.all([roleVersions(), workspaceStates(actor?.hidden), listInvites(), listStaff(), auditRows({ limit: 8 })]);
  const builders = workspaces.reduce((a, w) => a + w.builders, 0);
  const waiting = versions.filter((v) => v.status === "proposed");
  const staged = versions.filter((v) => v.status === "released" && v.stage_workspaces?.length);
  const noBuilder = workspaces.filter((w) => w.members > 0 && w.builders === 0);
  const stale = workspaces.filter((w) => (daysAgo(w.data_through) ?? 0) > 3);
  const expiring = invites.filter((i) => Date.parse(i.expires_at) - Date.now() < 2 * 86400000);
  const attention = [
    ...waiting.map((v) => ({ key: `v${v.role}${v.version}`, text: `${ROLES[v.role].codename} ${v.version} is proposed and waiting for Refal or Rafli to release it`, href: `/admin/roles/${v.role}/${v.version}` })),
    ...staged.map((v) => ({ key: `s${v.role}${v.version}`, text: `${ROLES[v.role].codename} ${v.version} is staged to ${v.stage_workspaces!.length} workspace(s); release it to everyone when it holds up`, href: `/admin/roles/${v.role}/${v.version}` })),
    ...noBuilder.map((w) => ({ key: `b${w.id}`, text: `${w.name} has ${w.members} client ${w.members === 1 ? "person" : "people"} but no Builder`, href: `/admin/people?ws=${w.id}` })),
    ...expiring.map((i) => ({ key: `i${i.id}`, text: `${i.email}'s invitation to ${i.workspace_name} expires ${day(i.expires_at)}`, href: `/admin/people?ws=${i.workspace_id}` })),
    ...stale.map((w) => ({ key: `s${w.id}`, text: `${w.name}: newest post is from ${day(w.data_through)} (${daysAgo(w.data_through)} days ago)`, href: "/admin/workspaces" })),
  ];
  return (
    <section className="screen">
      <div className="topbar"><div><h1>Home</h1><span className="meta">Signed in as {actor?.email}</span></div></div>
      <div className="wrap wide cms">
        <div className="cmsroles">
          {Object.values(ROLES).map((r) => {
            const cur = currentOf(versions, r.id);
            return (
              <Link key={r.id} href="/admin/roles" className="cmsrole" data-tone={r.tone}>
                <span className="cn">{r.codename}</span>
                <b>{cur?.version ?? r.version}</b>
                <span>{r.label}</span>
                <small>{cur ? `released ${day(cur.released_at)} by ${cur.released_by}` : "built-in, not seeded"}</small>
              </Link>
            );
          })}
        </div>
        <div className="stats">
          <div className="stat"><b>{workspaces.length}</b><span>workspaces · {fmtNum(workspaces.reduce((a, w) => a + w.posts, 0))} posts</span></div>
          <div className="stat"><b>{staff.length}</b><span>Fair staff</span></div>
          <div className="stat"><b>{workspaces.reduce((a, w) => a + w.members, 0)}</b><span>client people · {builders} Builder{builders === 1 ? "" : "s"}</span></div>
          <div className="stat"><b>{invites.length}</b><span>open invitations</span></div>
        </div>
        <h3 className="subh">Needs attention</h3>
        {attention.length ? (
          <ul className="attn">{attention.map((a) => <li key={a.key}><Link href={a.href}>{a.text}</Link></li>)}</ul>
        ) : <p className="hint">Nothing waiting.</p>}
        <h3 className="subh">Latest changes</h3>
        <div className="tablewrap people">
          <table>
            <tbody>
              {recent.map((r) => <tr key={r.id}><td className="muted">{day(r.created_at)}</td><td>{r.actor}</td><td>{r.area} · {r.action}</td><td>{r.path ?? ""}</td><td className="muted">{r.workspace_id ?? "Fair"}</td></tr>)}
              {!recent.length && <tr><td className="muted">No changes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
