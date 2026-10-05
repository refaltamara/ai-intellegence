"use client";
/**
 * Where a version came from and what it should move (src/learning/outcomes.ts): tick the
 * insights, client creations and suggestions it started from, and the measures its
 * before-and-after compares. The server checks who may save and what is kept.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

type Item = { kind: "insight" | "creation" | "suggestion"; ref: string; text: string; who?: string | null };
type MeasureOpt = { key: string; label: string; suggested?: boolean };

export function OriginsEditor({ role, version, editable, items, chosen, measures, chosenMeasures }: { role: string; version: string; editable: boolean; items: Item[]; chosen: { kind: string; ref: string }[]; measures: MeasureOpt[]; chosenMeasures: string[] }) {
  const router = useRouter();
  const id = (o: { kind: string; ref: string }) => `${o.kind}:${o.ref}`;
  const [picked, setPicked] = useState(new Set(chosen.map(id)));
  const [ms, setMs] = useState(new Set(chosenMeasures.length ? chosenMeasures : measures.filter((m) => m.suggested).map((m) => m.key)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = <T,>(set: Set<T>, v: T, put: (s: Set<T>) => void) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); put(n); };
  async function save() {
    setBusy(true); setMsg(null);
    const origins = items.filter((i) => picked.has(id(i))).map((i) => ({ kind: i.kind, ref: i.ref }));
    const r = await fetch("/api/admin/learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "origins", role, version, origins, measures: [...ms] }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: j.error ?? "That did not work." });
    if (r.ok) router.refresh();
  }
  const groups: [Item["kind"], string][] = [["insight", "Insights"], ["creation", "Client creations"], ["suggestion", "Suggested by Builders"]];
  return (
    <div className="origins">
      {groups.map(([k, title]) => {
        const list = items.filter((i) => i.kind === k);
        return (
          <fieldset key={k} disabled={!editable}>
            <legend>{title}</legend>
            {list.length === 0 ? <p className="muted">None yet.</p> : list.map((i) => (
              <label key={id(i)} className="chk"><input type="checkbox" checked={picked.has(id(i))} onChange={() => toggle(picked, id(i), setPicked)} /> <span>{i.text}{i.who ? <small className="muted"> · {i.who}</small> : null}</span></label>
            ))}
          </fieldset>
        );
      })}
      <fieldset disabled={!editable}>
        <legend>Measure it by</legend>
        {measures.map((m) => (
          <label key={m.key} className="chk"><input type="checkbox" checked={ms.has(m.key)} onChange={() => toggle(ms, m.key, setMs)} /> <span>{m.label}{m.suggested ? <small className="muted"> · suggested by what it changes</small> : null}</span></label>
        ))}
      </fieldset>
      {editable && <div className="row"><button className="btn sm pri" onClick={save} disabled={busy}>{busy ? "…" : "Save"}</button>{msg && <small className={msg.ok ? "ok" : "err"}>{msg.text}</small>}</div>}
    </div>
  );
}
