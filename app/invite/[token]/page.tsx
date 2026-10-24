import { readInvite } from "@/auth/invites";
import { ROLES, type RoleId } from "@/roles/model";
import { DUTY_LABEL } from "@/config/staff";
import { InviteAccept } from "@/ui/InviteAccept";
import { AuthShell } from "@/ui/AuthShell";

export const dynamic = "force-dynamic";

/** An invitation link (src/auth/invites.ts): who invited you, to what, and one step to accept. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await readInvite(token);
  if (!inv) {
    return (
      <AuthShell title="This link has expired">
        <p className="text-sm text-gray-600">Invitations last seven days and work once. Ask the person who invited you to send a new one.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Join ${inv.workspace_name}`}>
      <InviteAccept
        token={token}
        email={inv.email}
        name={inv.name}
        workspace={inv.workspace_name}
        invitedBy={inv.invited_by}
        teams={[
          ...Object.entries(inv.levels).map(([r, l]) => `${ROLES[r as RoleId].label} · ${ROLES[r as RoleId].codename} (${l === "builder" ? "Builder" : "Member"})`),
          ...inv.staff.map((d) => `Fair · ${DUTY_LABEL[d]}`),
        ]}
        hasAccount={inv.has_account}
      />
    </AuthShell>
  );
}
