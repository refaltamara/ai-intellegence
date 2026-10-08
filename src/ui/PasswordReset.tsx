"use client";
/**
 * Setting a new password (src/auth/passwordLinks.ts): with no link, ask for one by email; with a
 * link, choose the new password. Either way the next step is signing in.
 */
import { useState } from "react";

const MIN = 10;

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  }
  if (sent) {
    return (
      <div className="card">
        <h2>Check your email</h2>
        <p>If <b>{email}</b> has an account, a link to set a new password is on its way. It works once, for two hours.</p>
        <p>Nothing after a few minutes? Ask Fair or your team&apos;s Builder for a password link.</p>
        <a className="btn" href="/login">Back to sign in</a>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="card">
      <h2>Forgot your password?</h2>
      <p>We&apos;ll email you a link to set a new one.</p>
      <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
      <button className="btn pri" type="submit" disabled={busy}>{busy ? "Sending…" : "Send the link"}</button>
      <p><a href="/login">Back to sign in</a></p>
    </form>
  );
}

export function NewPassword({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== again) { setError("The two passwords are not the same."); return; }
    setBusy(true); setError("");
    const r = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error ?? "Could not set the password."); return; }
    setDone(true);
  }
  if (done) {
    return (
      <div className="card">
        <h2>Password set</h2>
        <p>Sign in as <b>{email}</b> with your new password. Anywhere else you were signed in, you&apos;ve been signed out.</p>
        <a className="btn pri" href="/login">Sign in</a>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="card">
      <h2>Set a new password</h2>
      <p>For <b>{email}</b>. At least {MIN} characters.</p>
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <label>New password<input type="password" autoComplete="new-password" minLength={MIN} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></label>
      <label>Once more<input type="password" autoComplete="new-password" minLength={MIN} value={again} onChange={(e) => setAgain(e.target.value)} required /></label>
      {error && <div className="errbox">{error}</div>}
      <button className="btn pri" type="submit" disabled={busy}>{busy ? "Saving…" : "Set the password"}</button>
    </form>
  );
}
