import { readInvite } from "@/auth/invites";
import { ROLES, type RoleId } from "@/roles/model";
import { DUTY_LABEL } from "@/config/staff";
import { InviteAccept } from "@/ui/InviteAccept";
import { LogoMark } from "@/ui/LogoMark";

export const dynamic = "force-dynamic";

/** An invitation link (src/auth/invites.ts): who invited you, to what, and one step to accept. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await readInvite(token);
  return (
    <div className="login">
      <div className="box">
        <div className="brand"><LogoMark /><div><b>Fair Intelligence</b><small>Invitation</small></div></div>
        {inv ? (
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
        ) : (
          <div className="card"><h2>This link has expired</h2><p>Invitations last seven days and work once. Ask the person who invited you to send a new one.</p></div>
        )}
      </div>
    </div>
  );
}
