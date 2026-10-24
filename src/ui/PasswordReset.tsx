"use client";
/**
 * Setting a new password (src/auth/passwordLinks.ts): with no link, ask for one by email; with a
 * link, choose the new password. Either way the next step is signing in.
 */
import { useState } from "react";
import { TextInput } from "./kit/TextInput";
import { Button, ButtonLink } from "./kit/Button";
import { FormError, authLink } from "./AuthShell";

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
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-lg font-semibold text-gray-900">Check your email</h2>
        <p className="text-sm text-gray-600">If <b className="text-gray-900">{email}</b> has an account, a link to set a new password is on its way. It works once, for two hours.</p>
        <p className="text-sm text-gray-600">Nothing after a few minutes? Ask Fair or your team&apos;s Builder for a password link.</p>
        <ButtonLink href="/login" variant="secondary" className="self-start">Back to sign in</ButtonLink>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <p className="text-sm text-gray-600">We&apos;ll email you a link to set a new one.</p>
      <TextInput label="Email" type="email" autoComplete="username" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      <Button type="submit" size="lg" className="w-full" isLoading={busy} loadingLabel="Sending…">Send the link</Button>
      <a href="/login" className={`text-sm ${authLink}`}>Back to sign in</a>
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
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-lg font-semibold text-gray-900">Password set</h2>
        <p className="text-sm text-gray-600">Sign in as <b className="text-gray-900">{email}</b> with your new password. Anywhere else you were signed in, you&apos;ve been signed out.</p>
        <ButtonLink href="/login" className="self-start">Sign in</ButtonLink>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <p className="text-sm text-gray-600">For <b className="text-gray-900">{email}</b>.</p>
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <TextInput label="New password" type="password" autoComplete="new-password" minLength={MIN} hint={`At least ${MIN} characters.`} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      <TextInput label="Once more" type="password" autoComplete="new-password" minLength={MIN} value={again} onChange={(e) => setAgain(e.target.value)} required />
      {error && <FormError>{error}</FormError>}
      <Button type="submit" size="lg" className="w-full" isLoading={busy} loadingLabel="Saving…">Set the password</Button>
    </form>
  );
}
