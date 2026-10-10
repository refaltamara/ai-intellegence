"use client";
/** The dump's sentiment scale onto the product's three classes (CMS plan, "Map labels"), with how many comments each label holds. */
import { useState } from "react";
import { useOnboard } from "./useOnboard";

export function LabelMap({ ws, labels, current }: { ws: string; labels: { label: string; comments: number }[]; current: Record<string, string | null> }) {
  const { busy, error, call } = useOnboard(ws);
  const [map, setMap] = useState<Record<string, string>>(Object.fromEntries(labels.filter((l) => l.label !== "(none)").map((l) => [l.label, l.label in current ? current[l.label] ?? "none" : ""])));
  const [saved, setSaved] = useState(false);
  const total = labels.reduce((a, l) => a + l.comments, 0) || 1;
  const sum = (to: string) => labels.filter((l) => map[l.label] === to).reduce((a, l) => a + l.comments, 0);
  return (
    <div>
      <div className="tablewrap people"><table>
        <thead><tr><th>The dump&apos;s label</th><th className="num">Comments</th><th>Counts as</th></tr></thead>
        <tbody>{labels.map((l) => (
          <tr key={l.label}><td>{l.label}</td><td className="num">{l.comments.toLocaleString("en-US")} <small className="muted">{Math.round((l.comments / total) * 100)}%</small></td>
            <td>{l.label === "(none)" ? <span className="muted">no label: unlabelled, not neutral</span> : (
              <select value={map[l.label] ?? ""} onChange={(e) => { setMap({ ...map, [l.label]: e.target.value }); setSaved(false); }}>
                <option value="">choose…</option><option value="positive">positive</option><option value="neutral">neutral</option><option value="negative">negative</option><option value="none">no sentiment</option>
              </select>
            )}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="muted">With this map: {["positive", "neutral", "negative"].map((s) => `${sum(s).toLocaleString("en-US")} ${s}`).join(", ")}. Only the three classes are kept: the five-point label and CSAT stay in the raw file (DECISIONS, 10 Oct 2026).</p>
      <div className="row end">
        {error && <span className="err">{error}</span>}
        {saved && <span className="ok">Saved.</span>}
        <button className="btn pri sm" disabled={!!busy || Object.values(map).some((v) => !v)} onClick={async () => { if (await call("labels", { map: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v === "none" ? null : v])) })) setSaved(true); }}>Save the map</button>
      </div>
    </div>
  );
}
