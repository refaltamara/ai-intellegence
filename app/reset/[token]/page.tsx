import { readPasswordLink } from "@/auth/passwordLinks";
import { NewPassword } from "@/ui/PasswordReset";
import { LogoMark } from "@/ui/LogoMark";

export const dynamic = "force-dynamic";

/** A one-time link to set a new password, made by Fair or asked for by email (src/auth/passwordLinks.ts). */
export default async function ResetTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await readPasswordLink(token);
  return (
    <div className="login">
      <div className="box">
        <div className="brand"><LogoMark /><div><b>Fair Intelligence</b><small>Your password</small></div></div>
        {link ? <NewPassword token={token} email={link.email} /> : (
          <div className="card"><h2>This link has expired</h2><p>A password link works once: for a day when Fair made it, two hours when it came by email.</p><a className="btn pri" href="/reset">Get a new link</a></div>
        )}
      </div>
    </div>
  );
}
