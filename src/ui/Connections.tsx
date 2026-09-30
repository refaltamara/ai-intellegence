"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = { id: string; client_name: string | null; team: string; created_at: string; last_used_at: string | null; calls_today: number };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "not yet");

export function Connections({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function revoke(id: string) {
    setBusy(id);
    await fetch(`/api/mcp/connections?id=${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }
  if (!rows.length) return <p className="empty">No apps connected yet.</p>;
  return (
    <div className="tablewrap still">
      <table>
        <thead><tr><th>App</th><th>Team</th><th>Connected</th><th>Last used</th><th className="num">Today</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.client_name ?? "Unnamed app"}</b></td><td>{r.team}</td><td>{when(r.created_at)}</td><td>{when(r.last_used_at)}</td><td className="num">{r.calls_today}</td>
              <td className="num"><button className="btn sm" disabled={busy === r.id} onClick={() => revoke(r.id)}>{busy === r.id ? "…" : "Disconnect"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn sm pri" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}
