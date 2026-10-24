"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextInput } from "./kit/TextInput";
import { Button, ButtonLink } from "./kit/Button";
import { FormError, authLink } from "./AuthShell";

/** Accept an invitation: a new person picks a name and password; an existing account just joins and signs in as usual. */
export function InviteAccept({ token, email, name, workspace, invitedBy, teams, hasAccount }: { token: string; email: string; name: string | null; workspace: string; invitedBy: string; teams: string[]; hasAccount: boolean }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(name ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/invites/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, name: fullName, password: hasAccount ? undefined : password }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error ?? "Could not accept the invitation."); return; }
    if (j.signed_in) { router.push("/persona"); router.refresh(); }
    else setJoined(true);
  }
  if (joined) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-lg font-semibold text-gray-900">You&apos;re in</h2>
        <p className="text-sm text-gray-600">{workspace} is now on your account. Sign in with your usual password and pick the team. Forgot it? <a href="/reset" className={authLink}>Get a link to set a new one</a>.</p>
        <ButtonLink href="/login" className="self-start">Sign in</ButtonLink>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <p className="text-sm text-gray-600">{invitedBy} invited <b className="text-gray-900">{email}</b> to: {teams.join(", ")}.</p>
      {!hasAccount && (
        <>
          <TextInput label="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required autoFocus />
          <TextInput label="Choose a password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." value={password} onChange={(e) => setPassword(e.target.value)} required />
        </>
      )}
      {error && <FormError>{error}</FormError>}
      <Button type="submit" size="lg" className="w-full" isLoading={busy} loadingLabel="Joining…">{hasAccount ? "Add to my account" : "Join"}</Button>
      {hasAccount && <p className="text-sm text-gray-500">You already have an account; you&apos;ll sign in with your own password next. Forgot it? <a href="/reset" className={authLink}>Get a link to set a new one</a>.</p>}
    </form>
  );
}
