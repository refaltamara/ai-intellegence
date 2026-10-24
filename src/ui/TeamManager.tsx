"use client";
/**
 * A workspace's people: who is on which team and at what level, open invitations, and an
 * invite form. Used on the Team page (a client's Builder) and in the CMS (Fair). The
 * server decides what is allowed (src/auth/can.ts); this only hides what it would refuse.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordLink } from "./admin/PasswordLink";
import { CopyButton } from "./Connections";
import { Button } from "./kit/Button";
import { Field, TextField } from "./kit/Form";
import { ConfirmDialog } from "./kit/Modal";
import { ErrorBox, SectionCard } from "./kit/Section";
import { SelectInput } from "./kit/SelectInput";
import { StatusPill } from "./kit/StatusPill";
import { SUB, TD, TH, TR, Table } from "./kit/Table";

type Level = "builder" | "member";
type Levels = Record<string, Level | undefined>;
export type TeamRole = { id: string; label: string; codename: string };
export type TeamMember = { user_id: string; email: string; name: string | null; levels: Levels; staff: string[]; last_seen_at: string | null };
export type TeamInvite = { id: string; email: string; levels: Levels; staff: string[]; invited_by: string; expires_at: string };

const DUTY: Record<string, string> = { owner: "Owner", role_owner: "Role owner", designer: "Design", data_ops: "Data ops" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "never");

export function TeamManager({ workspaceId, workspaceName, roles, members, invites, canBuilders, meUid, passwordLinks = false }: { workspaceId: string; workspaceName: string; roles: TeamRole[]; members: TeamMember[]; invites: TeamInvite[]; canBuilders: boolean; meUid: string;
  /** in the CMS, Fair can make a one-time link for someone to set a new password (src/auth/passwordLinks.ts); a Builder's /team never shows it */
  passwordLinks?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [levels, setLevels] = useState<Levels>(Object.fromEntries(roles.map((r) => [r.id, "member" as Level])));
  const [sent, setSent] = useState<{ url: string; emailed: boolean; email: string } | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

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

  async function remove(m: TeamMember) {
    await call(m.user_id, `/api/team/members?workspace_id=${encodeURIComponent(workspaceId)}&user_id=${m.user_id}`, { method: "DELETE" });
    setRemoving(null);
  }

  const locked = (m: TeamMember) => !canBuilders && (m.staff.length > 0 || Object.values(m.levels).includes("builder"));

  return (
    // data-tw: the CMS page around it is still on legacy.css, whose bare table rules would restyle the cells
    <div data-tw className="flex flex-col gap-6">
      {error && <ErrorBox>{error}</ErrorBox>}
      <SectionCard title="People" hint={`Who is in ${workspaceName}, and their level on each team.`}>
        <Table min="min-w-[720px]" head={<>
          <th className={TH}>Person</th>
          {roles.map((r) => <th key={r.id} className={TH}>{r.label}<span className="block text-xs font-normal text-gray-500">{r.codename}</span></th>)}
          <th className={TH}>Last seen</th>
          {passwordLinks && <th className={TH}>Password</th>}
          <th className={TH}><span className="sr-only">Actions</span></th>
        </>}>
          {members.map((m) => (
            <tr key={m.user_id} className={TR}>
              <td className={TD}>
                <b className="font-semibold text-gray-900">{m.name ?? m.email}</b>
                {m.name && <span className={SUB}>{m.email}</span>}
                {m.staff.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{m.staff.map((d) => <StatusPill key={d} tone="brand">Fair · {DUTY[d] ?? d}</StatusPill>)}</span>}
              </td>
              {roles.map((r) => (
                <td key={r.id} className={TD}>
                  <SelectInput withSearch size="sm" className="w-auto min-w-36" ariaLabel={`${m.email} on ${r.label}`} value={m.levels[r.id] ?? ""} disabled={!!busy || locked(m) || m.user_id === meUid} onChange={(v) => change(m, r.id, v)}
                    options={[{ value: "", label: "None" }, { value: "member", label: "Member" }, { value: "builder", label: "Builder", disabled: !canBuilders }]} />
                </td>
              ))}
              <td className={`${TD} whitespace-nowrap text-gray-500`}>{day(m.last_seen_at)}</td>
              {passwordLinks && <td className={TD}><PasswordLink email={m.email} /></td>}
              <td className={`${TD} text-right`}>
                {m.user_id !== meUid && !locked(m) && <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={!!busy} onClick={() => setRemoving(m)}>Remove</Button>}
              </td>
            </tr>
          ))}
        </Table>
      </SectionCard>

      {invites.length > 0 && (
        <SectionCard title="Waiting to accept" hint="Invited, not signed in yet.">
          <Table min="min-w-[640px]" head={<><th className={TH}>Email</th><th className={TH}>Teams</th><th className={TH}><span className="sr-only">Actions</span></th></>}>
            {invites.map((i) => (
              <tr key={i.id} className={TR}>
                <td className={TD}><b className="font-semibold text-gray-900">{i.email}</b><span className={SUB}>invited by {i.invited_by} · until {day(i.expires_at)}</span></td>
                <td className={TD}>{[...roles.filter((r) => i.levels[r.id]).map((r) => `${r.label} (${i.levels[r.id] === "builder" ? "Builder" : "Member"})`), ...i.staff.map((d) => `Fair · ${DUTY[d] ?? d}`)].join(", ")}</td>
                <td className={`${TD} text-right`}>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={!!busy} isLoading={busy === i.id} loadingLabel="Withdrawing…" onClick={() => call(i.id, `/api/invites?id=${i.id}`, { method: "DELETE" })}>Withdraw</Button>
                </td>
              </tr>
            ))}
          </Table>
        </SectionCard>
      )}

      <SectionCard title="Invite someone" hint={`Members use the teams you give them. ${canBuilders ? "Builders also shape the company's version of a role, approve what Members make and invite Members." : "Only Fair makes someone a Builder."}`}>
        <form className="flex flex-col gap-4" onSubmit={invite}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Email"><TextField type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@company.com" /></Field>
            <Field label="Name" hint="optional"><TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" /></Field>
            {roles.map((r) => (
              <Field key={r.id} group label={r.label}>
                <SelectInput withSearch size="sm" ariaLabel={r.label} value={levels[r.id] ?? ""} onChange={(v) => setLevels({ ...levels, [r.id]: (v || undefined) as Level | undefined })}
                  options={[{ value: "", label: "None" }, { value: "member", label: "Member" }, ...(canBuilders ? [{ value: "builder", label: "Builder" }] : [])]} />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-xs text-gray-500">Invitations last seven days.</span>
            <Button type="submit" size="sm" isLoading={busy === "invite"} loadingLabel="Sending…">Send invitation</Button>
          </div>
        </form>
        {sent && (
          <div role="status" className="flex flex-col gap-2 rounded-2xl bg-green-50/60 px-4 py-3 text-sm text-green-700">
            <p>{sent.emailed ? <>Invitation emailed to <b className="font-semibold">{sent.email}</b>.</> : <>Email isn&apos;t set up here, so send <b className="font-semibold">{sent.email}</b> this link yourself:</>}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-gray-900">{sent.url}</code>
              <CopyButton text={sent.url} label="Copy link" />
            </div>
          </div>
        )}
      </SectionCard>

      <ConfirmDialog open={!!removing} title={`Remove ${removing?.name ?? removing?.email ?? ""}?`} body={`They leave ${workspaceName}. Their chats and decks stay.`}
        confirmLabel="Remove" danger busy={!!removing && busy === removing.user_id} onConfirm={() => removing && void remove(removing)} onClose={() => setRemoving(null)} />
    </div>
  );
}
