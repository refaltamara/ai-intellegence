import { ForgotPassword } from "@/ui/PasswordReset";
import { AuthShell } from "@/ui/AuthShell";

export const dynamic = "force-dynamic";

/** "Forgot your password?": a link to set a new one, by email (src/auth/passwordLinks.ts). */
export default function ResetPage() {
  return (
    <AuthShell title="Forgot your password?">
      <ForgotPassword />
    </AuthShell>
  );
}
