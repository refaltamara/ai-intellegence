"use client";
/** The workspace's lifecycle (CMS plan): review → live (Refal or Rafli), paused and back. */
import { useOnboard } from "./useOnboard";

export function StatusActions({ ws, status, owner }: { ws: string; status: string; owner: boolean }) {
  const { busy, error, call } = useOnboard(ws);
  const go = (to: string, q: string) => { if (window.confirm(q)) void call("status", { status: to }); };
  return (
    <span className="acts">
      {status === "review" && (owner ? <button className="btn pri sm" disabled={!!busy} onClick={() => go("live", "Switch this workspace live? Its people can sign in and its crons and decks start.")}>Switch live</button> : <span className="muted">Refal or Rafli switch it live after reading the report.</span>)}
      {status === "live" && <button className="btn sm ghost" disabled={!!busy} onClick={() => go("paused", "Pause it? Client sign-in, crons and scheduled decks stop; the data is kept.")}>Pause</button>}
      {status === "paused" && owner && <button className="btn sm" disabled={!!busy} onClick={() => go("live", "Resume it?")}>Resume</button>}
      {status === "paused" && <button className="btn sm ghost" disabled={!!busy} onClick={() => go("review", "Back to review?")}>Back to review</button>}
      {error && <span className="err">{error}</span>}
    </span>
  );
}
