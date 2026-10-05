"use client";
/** Load the dump (CMS plan, "2. Load"): a job in slices, run from here one after another; the report shows when it is done. */
import { useState } from "react";
import { useOnboard } from "./useOnboard";

export function LoadPanel({ ws, blockers, running, canReset }: { ws: string; blockers: string[]; running: string | null; canReset: boolean }) {
  const { busy, error, call, runJob } = useOnboard(ws);
  const [msg, setMsg] = useState("");
  const [going, setGoing] = useState(false);
  async function load(existing?: string | null) {
    const id = existing ?? String((await call("load", {}, { refresh: false }))?.job_id ?? "");
    if (!id) return;
    setGoing(true);
    const t0 = Date.now();
    await runJob(id, (p) => setMsg(p.error ? `Stopped: ${p.error}` : `${p.note ?? p.status} · ${Math.round((Date.now() - t0) / 1000)}s`));
    setGoing(false);
  }
  return (
    <div>
      {blockers.length > 0 && <ul className="blockers">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      <div className="row">
        <button className="btn pri sm" disabled={!!busy || going || blockers.length > 0} onClick={() => load(running)}>{running ? "Carry on loading" : "Load the dump"}</button>
        {canReset && <button className="btn sm ghost" disabled={!!busy || going} onClick={() => { if (window.confirm("Delete everything loaded into this workspace so far, to load again?")) void call("reset"); }}>Empty and start again</button>}
        {msg && <span className="muted">{msg}</span>}
        {error && <span className="err">{error}</span>}
      </div>
      <p className="muted">Posts are one row per platform, link and brand (the capture tracked last wins); a post found for two brands is two rows. Loading again updates in place. Slices run here while this page is open; otherwise every five minutes.</p>
    </div>
  );
}
