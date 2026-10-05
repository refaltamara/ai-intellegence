"use client";
/** Refal or Rafli invite someone to Fair's staff: their duties and the workspace their chats live in. */
import { useState } from "react";

export function StaffInvite({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [email, setEmail] = useState("");
  const [ws, setWs] = useState(workspaces[0]?.id ?? "");
  const [staff, setStaff] = useState<string[]>(["data_ops"]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ url?: string; emailed?: boolean; error?: string } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: ws, email, staff, levels: {} }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { url: j.url, emailed: j.emailed } : { error: j.error ?? "Failed" });
    if (r.ok) setEmail("");
  }
  const tick = (d: string) => setStaff(staff.includes(d) ? staff.filter((x) => x !== d) : [...staff, d]);
  return (
    <form className="inviteform card" onSubmit={send}>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@fair-indonesia.com" /></label>
      <label>Home workspace<select value={ws} onChange={(e) => setWs(e.target.value)}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <div className="lv">
        {[["owner", "Owner"], ["role_owner", "Role owner"], ["designer", "Design"], ["data_ops", "Data ops"]].map(([id, label]) => (
          <label key={id} className="tick"><input type="checkbox" checked={staff.includes(id)} onChange={() => tick(id)} /> {label}</label>
        ))}
      </div>
      <button className="btn pri" type="submit" disabled={busy || !staff.length}>{busy ? "Sending…" : "Invite to Fair's staff"}</button>
      {msg?.error && <div className="errbox" style={{ gridColumn: "1/-1" }}>{msg.error}</div>}
      {msg?.url && <div className="okbox" style={{ gridColumn: "1/-1" }}>{msg.emailed ? "Invitation emailed." : "Email isn't set up here; send this link yourself:"}<code>{msg.url}</code><button type="button" className="btn sm" onClick={() => navigator.clipboard.writeText(msg.url!)}>Copy link</button></div>}
    </form>
  );
}
