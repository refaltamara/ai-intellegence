"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
    return <div className="card"><h2>You&apos;re in</h2><p>{workspace} is now on your account. Sign in with your usual password and pick the team. Forgot it? <a href="/reset">Get a link to set a new one</a>.</p><a className="btn pri" href="/login">Sign in</a></div>;
  }
  return (
    <form onSubmit={submit} className="card">
      <h2>Join {workspace}</h2>
      <p>{invitedBy} invited <b>{email}</b> to: {teams.join(", ")}.</p>
      {!hasAccount && (
        <>
          <label>Your name<input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required autoFocus /></label>
          <label>Choose a password<input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        </>
      )}
      {error && <div className="errbox">{error}</div>}
      <button className="btn pri" type="submit" disabled={busy}>{busy ? "Joining…" : hasAccount ? "Add to my account" : "Join"}</button>
      {hasAccount && <p>You already have an account; you&apos;ll sign in with your own password next. Forgot it? <a href="/reset">Get a link to set a new one</a>.</p>}
    </form>
  );
}
