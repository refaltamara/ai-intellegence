"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error ?? `Login failed (${r.status})`); return; }
    // every sign-in asks which team you are working as (skipped when there is only one)
    const next = sp.get("next");
    const keep = next && next.startsWith("/") && !next.startsWith("//") && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
    router.push(`/persona${keep}`);
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="card">
      <h2>Sign in</h2>
      <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <div className="errbox">{error}</div>}
      <button className="btn pri" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p>No account yet? Ask your team&apos;s Builder or Fair for an invitation.</p>
    </form>
  );
}
