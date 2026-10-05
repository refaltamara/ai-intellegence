"use client";
/** Notes CeMO reads about this workspace's data (from data ops, or from health checks that failed twice). */
import { useState } from "react";
import { useOnboard } from "./useOnboard";

export function NotesEditor({ ws, notes, suggestions }: { ws: string; notes: { text: string; source: string }[]; suggestions: string[] }) {
  const { busy, error, call } = useOnboard(ws);
  const [list, setList] = useState(notes.map((n) => n.text));
  const [text, setText] = useState("");
  const save = (next: string[]) => { setList(next); void call("notes", { notes: next }); };
  return (
    <div className="notes">
      {list.length === 0 && <p className="muted">No notes: CeMO reads the data as it is.</p>}
      <ul>{list.map((n, i) => <li key={i}>{n} <button className="linkbtn danger" onClick={() => save(list.filter((_, k) => k !== i))}>Remove</button></li>)}</ul>
      {suggestions.filter((s) => !list.includes(s)).map((s) => <p key={s} className="sugg">{s} <button className="linkbtn" onClick={() => save([...list, s])}>Add as a note</button></p>)}
      <div className="row">
        <input className="wide" value={text} onChange={(e) => setText(e.target.value)} placeholder="Own Instagram posts are not captured after 9 Sep." maxLength={300} />
        <button className="btn sm" disabled={!!busy || !text.trim()} onClick={() => { save([...list, text.trim()]); setText(""); }}>Add</button>
        {error && <span className="err">{error}</span>}
      </div>
    </div>
  );
}

export function RunHealth({ ws }: { ws: string }) {
  const { busy, call } = useOnboard(ws);
  return <button className="btn sm" disabled={!!busy} onClick={() => call("health")}>{busy ? "Checking…" : "Check now"}</button>;
}
