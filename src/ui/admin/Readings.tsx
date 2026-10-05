/** A version's before and after (src/learning/outcomes.ts): each measure for the workspaces that took it and those that stayed. */
import type { VersionReading } from "@/learning/outcomes";
import { readingSentence } from "@/learning/outcomes";
import { MEASURE_DAYS } from "@/config/learning";

const v = (x: number | null, unit: string) => (x == null ? "–" : unit === "%" ? `${x}%` : String(x));
const STATE: Record<VersionReading["state"], string> = { not_released: "Not released yet", too_early: "Too early to read", interim: "Interim reading", measured: "Measured" };

export function Readings({ r, codename }: { r: VersionReading; codename: string }) {
  if (r.state === "not_released") return <p className="hint">Measured from the day it is released: {MEASURE_DAYS} days before against {MEASURE_DAYS} days after, for workspaces that took it against those that stayed.</p>;
  if (!r.measures.length) return <p className="hint">No measures chosen for this version.</p>;
  return (
    <>
      <p className="hint"><b>{STATE[r.state]}</b> · {r.days >= MEASURE_DAYS ? `released ${r.days} days ago, read over full ${MEASURE_DAYS}-day windows` : `day ${r.days} of ${MEASURE_DAYS} since release`} · each workspace&apos;s {MEASURE_DAYS} days before the version reached it against the days after</p>
      <div className="tablewrap people"><table>
        <thead><tr><th>Measure</th><th className="num">Took it</th><th className="num">Before</th><th className="num">After</th><th className="num">Stayed</th><th className="num">Before</th><th className="num">After</th></tr></thead>
        <tbody>{r.measures.map((m) => (
          <tr key={m.key}>
            <td>{m.label}<small className="muted"> · {m.unit}</small></td>
            <td className="num">{m.took.workspaces}</td><td className="num">{v(m.took.before, m.unit)}<small className="muted"> {m.took.num_before}/{m.took.den_before}</small></td><td className="num"><b>{v(m.took.after, m.unit)}</b><small className="muted"> {m.took.num_after}/{m.took.den_after}</small></td>
            <td className="num">{m.stayed.workspaces}</td><td className="num">{v(m.stayed.before, m.unit)}</td><td className="num">{v(m.stayed.after, m.unit)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {r.state !== "too_early" && <ul className="readings">{r.measures.map((m) => <li key={m.key}>{readingSentence(codename, r.version, m)}</li>)}</ul>}
    </>
  );
}
