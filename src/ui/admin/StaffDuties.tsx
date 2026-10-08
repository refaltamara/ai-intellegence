"use client";
/** Fair's people and their duties; Refal and Rafli tick and untick. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordLink } from "./PasswordLink";

const DUTIES = [
  { id: "owner", label: "Owner", hint: "release, deploy, prices, people" },
  { id: "role_owner", label: "Role owner", hint: "improve and roll back roles" },
  { id: "designer", label: "Design", hint: "change layouts and deck designs" },
  { id: "data_ops", label: "Data ops", hint: "set up and run workspaces" },
];

export function StaffDuties({ people, canEdit, me }: { people: { id: string; email: string; name: string | null; staff: string[]; home: string | null; last_seen_at: string | null }[]; canEdit: boolean; me: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function toggle(p: { id: string; staff: string[] }, d: string) {
    const staff = p.staff.includes(d) ? p.staff.filter((x) => x !== d) : [...p.staff, d];
    setBusy(p.id); setError("");
    const r = await fetch("/api/admin/staff", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: p.id, staff }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) setError(j.error ?? "Failed");
    else router.refresh();
  }
  return (
    <>
      <div className="tablewrap people">
        <table>
          <thead><tr><th>Person</th>{DUTIES.map((d) => <th key={d.id}>{d.label}<small>{d.hint}</small></th>)}<th>Last sign-in</th>{canEdit && <th>Password</th>}</tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name ?? p.email}</b>{p.name && <small>{p.email}</small>}</td>
                {DUTIES.map((d) => (
                  <td key={d.id}><input type="checkbox" checked={p.staff.includes(d.id)} disabled={!canEdit || !!busy || (p.id === me && d.id === "owner")} onChange={() => toggle(p, d.id)} aria-label={`${p.email}: ${d.label}`} /></td>
                ))}
                <td className="muted">{p.last_seen_at ? new Date(p.last_seen_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "not since 4 Oct"}</td>
                {canEdit && <td><PasswordLink email={p.email} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <div className="errbox" style={{ marginTop: 12 }}>{error}</div>}
    </>
  );
}
