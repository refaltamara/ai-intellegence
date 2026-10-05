"use client";
/**
 * One button on "Our Chorus": posts an action to the client-side API and refreshes the
 * page. `ask` asks for a note first (sending back, suggesting to Fair); `confirm` asks
 * before something that changes the team for everyone. The server decides; this shows
 * what it said.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Act({ label, url, body, ask, confirm, className = "btn sm ghost", done }: { label: string; url: string; body: Record<string, unknown>; ask?: string; confirm?: string; className?: string; done?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    let note: string | undefined;
    if (ask) {
      const n = window.prompt(ask);
      if (n == null) return;
      note = n;
    }
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); setMsg(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(note !== undefined ? { ...body, note } : body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? "That did not work." }); return; }
    if (done) setMsg({ ok: true, text: done });
    router.refresh();
  }
  return (
    <span className="act">
      <button className={className} disabled={busy} onClick={go}>{busy ? "…" : label}</button>
      {msg && <small className={msg.ok ? "ok" : "err"}>{msg.text}</small>}
    </span>
  );
}
