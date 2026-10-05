"use client";
/**
 * A workspace's people: who is on which team and at what level, open invitations, and an
 * invite form. Used on the Team page (a client's Builder) and in the CMS (Fair). The
 * server decides what is allowed (src/auth/can.ts); this only hides what it would refuse.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

type Level = "builder" | "member";
type Levels = Record<string, Level | undefined>;
export type TeamRole = { id: string; label: string; codename: string };
export type TeamMember = { user_id: string; email: string; name: string | null; levels: Levels; staff: string[]; last_seen_at: string | null };
export type TeamInvite = { id: string; email: string; levels: Levels; staff: string[]; invited_by: string; expires_at: string };

const DUTY: Record<string, string> = { owner: "Owner", role_owner: "Role owner", designer: "Design", data_ops: "Data ops" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "never");

export function TeamManager({ workspaceId, workspaceName, roles, members, invites, canBuilders, meUid }: { workspaceId: string; workspaceName: string; roles: TeamRole[]; members: TeamMember[]; invites: TeamInvite[]; canBuilders: boolean; meUid: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [levels, setLevels] = useState<Levels>(Object.fromEntries(roles.map((r) => [r.id, "member" as Level])));
  const [sent, setSent] = useState<{ url: string; emailed: boolean; email: string } | null>(null);

  async function call(key: string, url: string, init: RequestInit) {
    setBusy(key); setError("");
    const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { setError(j.error ?? `Failed (${r.status})`); return null; }
    router.refresh();
    return j;
  }

  const change = (m: TeamMember, role: string, value: string) => {
    const next: Levels = { ...m.levels };
    if (value) next[role] = value as Level;
    else delete next[role];
    return call(m.user_id, "/api/team/members", { method: "PATCH", body: JSON.stringify({ workspace_id: workspaceId, user_id: m.user_id, levels: next }) });
  };

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const chosen = Object.fromEntries(Object.entries(levels).filter(([, l]) => l));
    const j = await call("invite", "/api/invites", { method: "POST", body: JSON.stringify({ workspace_id: workspaceId, email, name, levels: chosen }) });
    if (j) { setSent({ url: j.url, emailed: j.emailed, email }); setEmail(""); setName(""); }
  }

  const locked = (m: TeamMember) => !canBuilders && (m.staff.length > 0 || Object.values(m.levels).includes("builder"));

  return (
    <div className="team-mgr">
      <div className="tablewrap people">
        <table>
          <thead>
            <tr><th>Person</th>{roles.map((r) => <th key={r.id}>{r.label}<small>{r.codename}</small></th>)}<th>Last seen</th><th /></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td><b>{m.name ?? m.email}</b>{m.name && <small>{m.email}</small>}{m.staff.map((d) => <span key={d} className="badge fair">Fair · {DUTY[d] ?? d}</span>)}</td>
                {roles.map((r) => (
                  <td key={r.id}>
                    <select value={m.levels[r.id] ?? ""} disabled={!!busy || locked(m) || m.user_id === meUid} onChange={(e) => change(m, r.id, e.target.value)} aria-label={`${m.email} on ${r.label}`}>
                      <option value="">—</option>
                      <option value="member">Member</option>
                      <option value="builder" disabled={!canBuilders}>Builder</option>
                    </select>
                  </td>
                ))}
                <td className="muted">{day(m.last_seen_at)}</td>
                <td>{m.user_id !== meUid && !locked(m) && <button className="btn sm ghost danger" disabled={!!busy} onClick={() => confirm(`Remove ${m.email} from ${workspaceName}? Their chats and decks stay.`) && call(m.user_id, `/api/team/members?workspace_id=${encodeURIComponent(workspaceId)}&user_id=${m.user_id}`, { method: "DELETE" })}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invites.length > 0 && (
        <>
          <h3 className="subh">Waiting to accept</h3>
          <div className="tablewrap people">
            <table>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td><b>{i.email}</b><small>invited by {i.invited_by} · until {day(i.expires_at)}</small></td>
                    <td>{[...roles.filter((r) => i.levels[r.id]).map((r) => `${r.label} (${i.levels[r.id] === "builder" ? "Builder" : "Member"})`), ...i.staff.map((d) => `Fair · ${DUTY[d] ?? d}`)].join(", ")}</td>
                    <td><button className="btn sm ghost danger" disabled={!!busy} onClick={() => call(i.id, `/api/invites?id=${i.id}`, { method: "DELETE" })}>Withdraw</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="subh">Invite someone</h3>
      <form className="inviteform card" onSubmit={invite}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@company.com" /></label>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="optional" /></label>
        <div className="lv">
          {roles.map((r) => (
            <label key={r.id}>{r.label}
              <select value={levels[r.id] ?? ""} onChange={(e) => setLevels({ ...levels, [r.id]: (e.target.value || undefined) as Level | undefined })}>
                <option value="">—</option>
                <option value="member">Member</option>
                {canBuilders && <option value="builder">Builder</option>}
              </select>
            </label>
          ))}
        </div>
        <button className="btn pri" type="submit" disabled={busy === "invite"}>{busy === "invite" ? "Sending…" : "Send invitation"}</button>
      </form>
      {sent && (
        <div className="okbox">
          {sent.emailed ? <>Invitation emailed to <b>{sent.email}</b>.</> : <>Email isn&apos;t set up here, so send <b>{sent.email}</b> this link yourself:</>}
          <code>{sent.url}</code>
          <button className="btn sm" onClick={() => navigator.clipboard.writeText(sent.url)}>Copy link</button>
        </div>
      )}
      {error && <div className="errbox">{error}</div>}
      <p className="hint">Members use the teams you give them. {canBuilders ? "Builders also shape the company's version of a role, approve what Members make and invite Members." : "Only Fair makes someone a Builder."} Invitations last seven days.</p>
    </div>
  );
}
