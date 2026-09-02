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
    const next = sp.get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }
  const inp: React.CSSProperties = { font: "inherit", fontSize: 14, padding: "10px 12px", border: "1px solid var(--line-2)", borderRadius: 9, background: "#fff", width: "100%" };
  return (
    <form onSubmit={submit} className="card" style={{ padding: 22, display: "grid", gap: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Sign in</h2>
      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Email<input style={inp} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Password<input style={inp} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <div className="errbox">{error}</div>}
      <button className="btn pri" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p style={{ fontSize: 12, color: "var(--text-3)" }}>Accounts are created by the workspace owner.</p>
    </form>
  );
}
