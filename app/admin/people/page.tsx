import Link from "next/link";
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { listMembers, listStaff } from "@/auth/accounts";
import { listInvites } from "@/auth/invites";
import { ROLES } from "@/roles/model";
import { getWorkspace, listWorkspaces } from "@/workspace/store";
import { StaffDuties } from "@/ui/admin/StaffDuties";
import { StaffInvite } from "@/ui/admin/StaffInvite";
import { TeamManager } from "@/ui/TeamManager";

export const dynamic = "force-dynamic";

/** People: Fair's staff and their duties, then each workspace's Builders and Members. */
export default async function AdminPeople({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const [actor, staff, workspaces, sp] = await Promise.all([currentActor(), listStaff(), listWorkspaces(), searchParams]);
  const ws = workspaces.find((w) => w.id === sp.ws)?.id ?? workspaces[0]?.id;
  const [cfg, members, invites] = ws ? await Promise.all([getWorkspace(ws), listMembers(ws), listInvites(ws)]) : [null, [], []];
  const staffManage = !!actor && can(actor, "staff.manage");
  const roles = (cfg?.roles ?? []).map((r) => ({ id: r, label: ROLES[r].label, codename: ROLES[r].codename }));
  return (
    <section className="screen">
      <div className="topbar"><div><h1>People</h1><span className="meta">{staff.length} Fair staff</span></div></div>
      <div className="wrap wide cms">
        <h3 className="subh" style={{ marginTop: 0 }}>Fair staff</h3>
        <StaffDuties people={staff.map((s) => ({ id: s.id, email: s.email, name: s.name, staff: s.staff, home: s.home, last_seen_at: s.last_seen_at }))} canEdit={staffManage} me={actor?.account_id ?? ""} />
        {staffManage && (
          <>
            <h3 className="subh">Invite to Fair&apos;s staff</h3>
            <StaffInvite workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} />
          </>
        )}
        <h3 className="subh">Clients</h3>
        <div className="cats">{workspaces.map((w) => <Link key={w.id} href={`/admin/people?ws=${w.id}`} className={w.id === ws ? "on" : ""}>{w.name}</Link>)}</div>
        {ws && actor && (
          <TeamManager workspaceId={ws} workspaceName={cfg?.name ?? ws} roles={roles} members={members} invites={invites} canBuilders={can(actor, "workspace.builders", { workspace: ws })} meUid={actor.uid} />
        )}
      </div>
    </section>
  );
}
