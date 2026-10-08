"use client";
/**
 * People in the CMS: a one-time link for someone to set a new password (src/auth/passwordLinks.ts).
 * It is emailed when email is set up, and always shown here to copy into a chat with them.
 */
import { useState } from "react";

export function PasswordLink({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  async function make() {
    if (!confirm(`Make a link for ${email} to set a new password? It works once, for a day; their current password keeps working until they use it.`)) return;
    setBusy(true); setError(""); setCopied(false);
    const r = await fetch("/api/admin/password-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error ?? `HTTP ${r.status}`); return; }
    setLink({ url: j.url, emailed: !!j.emailed });
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { /* the field below can still be selected */ }
  }
  if (link) {
    return (
      <span className="pwlink">
        <input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label={`Password link for ${email}`} />
        <button type="button" className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        <small className="muted">{link.emailed ? "also emailed to them" : "not emailed: send it to them"} · works once, for a day</small>
      </span>
    );
  }
  return (
    <span className="pwlink">
      <button type="button" className="btn sm ghost" disabled={busy} onClick={make} title="A one-time link for them to set a new password">{busy ? "Making…" : "Password link"}</button>
      {error && <small className="err">{error}</small>}
    </span>
  );
}
