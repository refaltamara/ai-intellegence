"use client";
/** The workspace's topics (CMS plan, "Topics"): rename, mark the catch-all, tag what each is for, a one-line definition. */
import { useState } from "react";
import { useOnboard } from "./useOnboard";

type Topic = { id: string; label: string; is_catch_all: boolean; tags: string[]; definition: string | null; comments: number; share: number };
const TAGS = ["service", "promo", "product", "reputation"];

export function TopicsEditor({ ws, topics }: { ws: string; topics: Topic[] }) {
  const { busy, error, call } = useOnboard(ws);
  const [rows, setRows] = useState(topics);
  const [saved, setSaved] = useState(false);
  const set = (i: number, patch: Partial<Topic>) => { setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x))); setSaved(false); };
  return (
    <div>
      <div className="tablewrap people"><table>
        <thead><tr><th>Topic</th><th className="num">Comments</th><th>Catch-all</th><th>Used as</th><th>Definition</th></tr></thead>
        <tbody>{rows.map((t, i) => (
          <tr key={t.id} className={t.is_catch_all && t.share > 30 ? "warnrow" : ""}>
            <td><input className="mini" value={t.label} onChange={(e) => set(i, { label: e.target.value })} /></td>
            <td className="num">{t.comments.toLocaleString("en-US")} <small className="muted">{t.share}%</small></td>
            <td><input type="radio" name="catchall" checked={t.is_catch_all} onChange={() => setRows((r) => r.map((x, k) => ({ ...x, is_catch_all: k === i })))} /></td>
            <td>{TAGS.map((g) => <label key={g} className="tick sm"><input type="checkbox" checked={t.tags.includes(g)} onChange={() => set(i, { tags: t.tags.includes(g) ? t.tags.filter((x) => x !== g) : [...t.tags, g] })} /> {g}</label>)}</td>
            <td><input className="wide" value={t.definition ?? ""} onChange={(e) => set(i, { definition: e.target.value })} placeholder="What belongs here, in one line" /></td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="muted">A catch-all over 30% of comments, or a topic under 30 comments a month, shows on Health. Renaming keeps the topic&apos;s id, so the dump&apos;s next load maps onto it.</p>
      <div className="row end">
        {error && <span className="err">{error}</span>}
        {saved && <span className="ok">Saved.</span>}
        <button className="btn pri sm" disabled={!!busy} onClick={async () => { if (await call("topics", { topics: rows })) setSaved(true); }}>Save topics</button>
      </div>
    </div>
  );
}
