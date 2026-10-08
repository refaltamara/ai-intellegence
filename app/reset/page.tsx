import { ForgotPassword } from "@/ui/PasswordReset";

export const dynamic = "force-dynamic";

/** "Forgot your password?": a link to set a new one, by email (src/auth/passwordLinks.ts). */
export default function ResetPage() {
  return (
    <div className="login">
      <div className="box">
        <div className="brand"><div className="mark">F</div><div><b>Fair Intelligence</b><small>Your password</small></div></div>
        <ForgotPassword />
      </div>
    </div>
  );
}
