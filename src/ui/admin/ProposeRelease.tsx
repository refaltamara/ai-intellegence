"use client";
/** Propose (role owners, once the tests pass) and release (Refal, Rafli): to a few workspaces first, or to everyone. */
import { useState } from "react";
import { useAdminCall } from "./useAdminCall";

type Ready = { ready: boolean; missing: string[]; failing: string[]; pass: number; skip: number; total: number };

export function ProposeRelease({ role, version, status, note, ready, stage, canPropose, canRelease, workspaces }: { role: string; version: string; status: string; note: string | null; ready: Ready; stage: string[] | null; canPropose: boolean; canRelease: boolean; workspaces: { id: string; name: string }[] }) {
  const { busy, error, call } = useAdminCall();
  const [text, setText] = useState(note ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  if (status === "released") {
    return (
      <div className="cmsblock">
        <header><h2>Released</h2></header>
        {stage?.length ? (
          <div className="card propose"><p>Staged to {stage.map((id) => workspaces.find((w) => w.id === id)?.name ?? id).join(", ")}. Every other client still runs the release before it.</p>{canRelease && <button className="btn pri" disabled={!!busy} onClick={() => confirm(`Release ${version} to every client that follows the latest?`) && call("all", { action: "release_all", role, version })}>Release to everyone</button>}</div>
        ) : <p className="hint">Every client that follows the latest runs it.</p>}
        {error && <div className="errbox">{error}</div>}
      </div>
    );
  }
  if (status !== "draft" && status !== "proposed") return null;
  return (
    <div className="cmsblock">
      <header><h2>{status === "proposed" ? "Proposed, waiting for release" : "Propose"}</h2></header>
      <div className="card propose">
        <p className={ready.ready ? "" : "warn"}>{ready.ready ? `All ${ready.total} tests ran since the last edit: ${ready.pass} pass${ready.skip ? `, ${ready.skip} skipped` : ""}.` : ready.failing.length ? `Failing: ${ready.failing.join(", ")}.` : `${ready.missing.length} tests have not run since the last edit.`}</p>
        <label>Release note: what changed and why<textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={status !== "draft" || !canPropose} /></label>
        {status === "draft" && canPropose && <button className="btn pri" disabled={!!busy || !ready.ready || !text.trim()} onClick={() => call("propose", { action: "propose", role, version, note: text })}>Propose for release</button>}
        {status === "proposed" && canRelease && (
          <div className="release">
            <p>Release to a few workspaces first (they run it, everyone else keeps the current release), or to everyone at once.</p>
            <div className="lv">{workspaces.map((w) => <label key={w.id} className="tick"><input type="checkbox" checked={picked.includes(w.id)} onChange={() => setPicked(picked.includes(w.id) ? picked.filter((x) => x !== w.id) : [...picked, w.id])} /> {w.name}</label>)}</div>
            <button className="btn pri" disabled={!!busy} onClick={() => confirm(picked.length ? `Release ${version} to ${picked.length} workspace(s) first?` : `Release ${version} to every client that follows the latest?`) && call("release", { action: "release", role, version, stage: picked })}>{picked.length ? `Release to ${picked.length} first` : "Release to everyone"}</button>
          </div>
        )}
        {status === "proposed" && !canRelease && <p className="hint">Refal or Rafli release it from here.</p>}
      </div>
      {error && <div className="errbox">{error}</div>}
    </div>
  );
}
