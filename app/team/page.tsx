import { notFound } from "next/navigation";
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { can, rolesFor } from "@/auth/can";
import { listMembers } from "@/auth/accounts";
import { listInvites } from "@/auth/invites";
import { ROLES } from "@/roles/model";
import { getWorkspace } from "@/workspace/store";
import { PageHeader } from "@/ui/kit/PageHeader";
import { TeamManager } from "@/ui/TeamManager";

export const dynamic = "force-dynamic";

/** The people in this workspace (CMS plan, People and access): a Builder invites and manages Members; Fair manages Builders. */
export default async function TeamPage() {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor || !can(actor, "team.manage", { workspace: ws })) notFound();
  const [cfg, members, invites] = await Promise.all([getWorkspace(ws), listMembers(ws), listInvites(ws)]);
  // a Builder sees and invites to the teams they are on; Fair sees every team
  const roles = rolesFor(actor, ws, cfg?.roles ?? []).map((r) => ({ id: r, label: ROLES[r].label, codename: ROLES[r].codename }));
  return (
    <section data-tw className="flex min-h-full flex-col gap-6 px-4 pb-10 md:px-6">
      <PageHeader title="Team" subtitle={`${cfg?.name ?? ws} · ${members.length} ${members.length === 1 ? "person" : "people"}`} />
      <TeamManager workspaceId={ws} workspaceName={cfg?.name ?? ws} roles={roles} members={members} invites={invites} canBuilders={can(actor, "workspace.builders", { workspace: ws })} meUid={actor.uid} />
    </section>
  );
}
