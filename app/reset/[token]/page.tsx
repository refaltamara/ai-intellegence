import { readPasswordLink } from "@/auth/passwordLinks";
import { NewPassword } from "@/ui/PasswordReset";
import { AuthShell } from "@/ui/AuthShell";
import { ButtonLink } from "@/ui/kit/Button";

export const dynamic = "force-dynamic";

/** A one-time link to set a new password, made by Fair or asked for by email (src/auth/passwordLinks.ts). */
export default async function ResetTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await readPasswordLink(token);
  if (!link) {
    return (
      <AuthShell title="This link has expired">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">A password link works once: for a day when Fair made it, two hours when it came by email.</p>
          <ButtonLink href="/reset" className="self-start">Get a new link</ButtonLink>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Set a new password">
      <NewPassword token={token} email={link.email} />
    </AuthShell>
  );
}
