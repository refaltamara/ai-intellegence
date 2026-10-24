"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./kit/Button";
import { ConfirmDialog } from "./kit/Modal";
import { Empty } from "./kit/Section";
import { SUB, TD, TD_NUM, TH, TH_NUM, TR, Table } from "./kit/Table";

type Row = { id: string; client_name: string | null; team: string; created_at: string; last_used_at: string | null; calls_today: number };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "not yet");

export function Connections({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Row | null>(null);
  async function revoke(id: string) {
    setBusy(true);
    await fetch(`/api/mcp/connections?id=${id}`, { method: "DELETE" });
    setBusy(false);
    setAsk(null);
    router.refresh();
  }
  if (!rows.length) return <Empty>No apps connected yet. Add the address above in Claude or ChatGPT and it shows up here.</Empty>;
  return (
    <>
      <Table min="min-w-[720px]" head={<><th className={TH}>App</th><th className={TH}>Team</th><th className={TH}>Connected</th><th className={TH}>Last used</th><th className={TH_NUM}>Today</th><th className={TH}><span className="sr-only">Actions</span></th></>}>
        {rows.map((r) => (
          <tr key={r.id} className={TR}>
            <td className={TD}><b className="font-semibold text-gray-900">{r.client_name ?? "Unnamed app"}</b></td>
            <td className={TD}>{r.team}</td>
            <td className={TD}>{when(r.created_at)}</td>
            <td className={TD}>{when(r.last_used_at)}<span className={SUB}>WIB</span></td>
            <td className={TD_NUM}>{r.calls_today}</td>
            <td className={`${TD} text-right`}><Button variant="outline" size="sm" onClick={() => setAsk(r)}>Disconnect</Button></td>
          </tr>
        ))}
      </Table>
      <ConfirmDialog open={!!ask} title="Disconnect this app?" body={`${ask?.client_name ?? "This app"} stops reading ${ask?.team ?? "your team"}'s data. You can connect it again from the app.`}
        confirmLabel="Disconnect" danger busy={busy} onConfirm={() => ask && void revoke(ask.id)} onClose={() => setAsk(null)} />
    </>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="sm" className="shrink-0" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>
      <span role="status">{done ? "Copied" : label}</span>
    </Button>
  );
}
