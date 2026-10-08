import { ForgotPassword } from "@/ui/PasswordReset";
import { LogoMark } from "@/ui/LogoMark";

export const dynamic = "force-dynamic";

/** "Forgot your password?": a link to set a new one, by email (src/auth/passwordLinks.ts). */
export default function ResetPage() {
  return (
    <div className="login">
      <div className="box">
        <div className="brand"><LogoMark /><div><b>Fair Intelligence</b><small>Your password</small></div></div>
        <ForgotPassword />
      </div>
    </div>
  );
}
