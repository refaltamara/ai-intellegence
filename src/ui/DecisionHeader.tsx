"use client";
/** Decision header (PRD-v2 §7): name inline-editable, status, the brand this decision is for, pins, threads. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DecisionSummary, PinRow } from "@/decisions/store";
import { fmtDate } from "./format";

type Thread = { id: string; title: string | null; updated_at: string };

export function DecisionHeader({ decision, pins, threads, currentThread, brands }: { decision: DecisionSummary; pins: PinRow[]; threads: Thread[]; currentThread: string | null; brands: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState(decision.name);
  const [showPins, setShowPins] = useState(false);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/decisions/${decision.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  }
  async function removePin(id: string) {
    await fetch(`/api/decisions/${decision.id}/pins?pin=${id}`, { method: "DELETE" });
    router.refresh();
  }
  function decide() {
    const outcome = window.prompt(`What did you decide on "${decision.name}"?`, decision.outcome ?? "");
    if (outcome === null) return;
    void patch({ status: "decided", outcome: outcome.trim() || null });
  }

  return (
    <div className="dhead">
      <div className="row1">
        <input className="dname" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== decision.name) void patch({ name: name.trim() }); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <span className={`pill ${decision.status === "open" ? "open" : ""}`}>{decision.status === "open" ? "Open" : decision.status === "decided" ? "Decided" : "Archived"}</span>
        <select className="dclient" value={decision.client_brand_id ?? ""} onChange={(e) => patch({ client_brand_id: e.target.value || null })} title="The brand CeMO is on the side of for this decision">
          <option value="">{decision.client_name ? "Workspace client" : "For: workspace client"}</option>
          {brands.map((b) => <option key={b.id} value={b.id}>For {b.name}</option>)}
        </select>
        <span className="dmeta">
          <button className="linkish" onClick={() => setShowPins((s) => !s)} disabled={!pins.length}>{pins.length} pinned</button>
          <span>{decision.watching} watching</span>
        </span>
        {decision.status === "open" ? <button className="btn sm" onClick={decide}>Mark decided</button> : <button className="btn sm ghost" onClick={() => patch({ status: "open" })}>Reopen</button>}
      </div>
      {decision.outcome && <div className="outcome">Decided: {decision.outcome}</div>}
      {showPins && pins.length > 0 && (
        <div className="pins">
          {pins.map((p) => (
            <div className="pin" key={p.id}>
              <b>{p.skill.replace(/-/g, " ")}</b>
              <span>{p.window ? `${p.window.from} to ${p.window.to}` : ""}{p.matched != null ? ` · ${p.matched.toLocaleString("en-US")} matched` : ""}</span>
              <Link href={`/skills/discovery?run=${p.skill_run_id}`} className="linkish" hidden={p.skill !== "discovery"}>open</Link>
              <button className="linkish" onClick={() => removePin(p.id)}>unpin</button>
            </div>
          ))}
        </div>
      )}
      <div className="threads">
        {threads.map((t) => (
          <Link key={t.id} href={`/d/${decision.id}?c=${t.id}`} className={t.id === currentThread ? "on" : ""} title={fmtDate(t.updated_at)}>{(t.title ?? "Untitled").replace(/^\/[\w-]+\s*/, "")}</Link>
        ))}
        <Link href={`/d/${decision.id}`} className={!currentThread ? "on new" : "new"}>+ New thread</Link>
      </div>
    </div>
  );
}
