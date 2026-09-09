"use client";
/** Decisions list (PRD-v2 §7): open, decided, archived. Rename inline; mark decided asks for the outcome. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DecisionStatus, DecisionSummary } from "@/decisions/store";
import { fmtDate } from "./format";

export function Decisions({ decisions }: { decisions: DecisionSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    await fetch(`/api/decisions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    router.refresh();
  }
  async function create() {
    if (!name.trim()) return;
    setBusy("new");
    const r = await fetch("/api/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const d = await r.json();
    setBusy(null);
    if (d.id) router.push(`/d/${d.id}`);
  }
  function decide(d: DecisionSummary) {
    const outcome = window.prompt(`What did you decide on "${d.name}"?`, d.outcome ?? "");
    if (outcome === null) return;
    void patch(d.id, { status: "decided", outcome: outcome.trim() || null });
  }

  const groups: { key: DecisionStatus; title: string }[] = [{ key: "open", title: "Open" }, { key: "decided", title: "Decided" }, { key: "archived", title: "Archived" }];
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Decisions</h1><span className="meta">{decisions.filter((d) => d.status === "open").length} open</span></div>
        <div className="newdec">
          <input value={name} placeholder="New decision, e.g. Ramadan launch" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
          <button className="btn pri sm" onClick={create} disabled={busy === "new" || !name.trim()}>Start</button>
        </div>
      </div>
      <div className="wrap">
        {groups.map((g) => {
          const items = decisions.filter((d) => d.status === g.key);
          if (!items.length && g.key !== "open") return null;
          return (
            <div className="sec" key={g.key}>
              <h2>{g.title}</h2>
              {items.length === 0 && <div className="dec none">Nothing open. Ask CeMO something on Today and it starts one.</div>}
              {items.map((d) => (
                <div className="dec" key={d.id}>
                  <span className="n" onClick={() => router.push(`/d/${d.id}`)}>{d.name}{d.outcome ? <small> — {d.outcome}</small> : null}</span>
                  <span className="m">
                    <span>{d.threads} thread{d.threads === 1 ? "" : "s"}</span>
                    {d.pinned > 0 && <span>{d.pinned} pinned</span>}
                    {d.watching > 0 && <span>{d.watching} watching</span>}
                    {d.client_name && <span>for {d.client_name}</span>}
                    <span>{fmtDate(d.last_activity)}</span>
                  </span>
                  <span className="acts">
                    {d.status === "open" && <button className="btn sm" disabled={busy === d.id} onClick={() => decide(d)}>Mark decided</button>}
                    {d.status !== "archived" && <button className="btn sm ghost" disabled={busy === d.id} onClick={() => patch(d.id, { status: "archived" })}>Archive</button>}
                    {d.status !== "open" && <button className="btn sm ghost" disabled={busy === d.id} onClick={() => patch(d.id, { status: "open" })}>Reopen</button>}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
