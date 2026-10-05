/**
 * A role's learning page (CMS plan, "The learning loop"): the insights of the last roll-up
 * (three workspaces or more behind each), the signals of the last 30 days by kind and by
 * workspace, what clients make by shape, and each release's before and after. Fair staff
 * only; clients are named here one by one because role owners promote from them, never in
 * an insight.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { ROLES, isRoleId } from "@/roles/model";
import { INSIGHT_FLOOR, INSIGHT_WINDOW_DAYS } from "@/config/learning";
import { creationRollup, latestInsights, learningPool, type InsightFamily } from "@/learning/insights";
import { kindCounts, workspaceUse } from "@/learning/views";
import { measureVersion, originDetails, originPhrase } from "@/learning/outcomes";
import { roleVersions } from "@/cms/data";
import { listWorkspaces } from "@/workspace/store";
import { Act } from "@/ui/company/Act";
import { Readings } from "@/ui/admin/Readings";

export const dynamic = "force-dynamic";

const FAMILY: Record<InsightFamily, string> = { setting: "Settings clients change", analysis: "Analyses", use: "How the product is used", creation: "What clients make", outcome: "After a release" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }) : "–");
const n = (x: number) => x.toLocaleString("en-US");

export default async function RoleLearning({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isRoleId(role)) notFound();
  const actor = await currentActor();
  if (!actor) notFound();
  const r = ROLES[role];
  const pool = await learningPool();
  const ids = pool.filter((w) => w.roles.includes(role)).map((w) => w.id);
  const [insights, kinds, use, made, versions, workspaces] = await Promise.all([latestInsights(role), kindCounts({ role, ids }), workspaceUse(role), creationRollup(role, ids), roleVersions(), listWorkspaces()]);
  const names = new Map(workspaces.map((w) => [w.id, w.name]));
  const released = versions.filter((v) => v.role === role && (v.status === "released" || v.status === "rolled_back") && v.released_at);
  const readings = await Promise.all(released.slice(0, 4).map(async (v) => {
    const reading = await measureVersion(role, v.version);
    return { v, reading, phrase: reading ? originPhrase(await originDetails(role, reading.origins)) : "" };
  }));
  const fams = [...new Set(insights.map((i) => i.family))];
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1><Link href="/admin/roles">Roles</Link> / {r.codename} · learning</h1><span className="meta">{ids.length} workspace{ids.length === 1 ? "" : "s"} learn for {r.codename} · insights need {INSIGHT_FLOOR} or more behind them · last {INSIGHT_WINDOW_DAYS} days, clients only</span></div>
        {can(actor, "role.draft") && <Act label="Roll up now" url="/api/admin/learning" body={{ action: "rollup" }} className="btn sm" done="Done." />}
      </div>
      <div className="wrap wide cms">
        <div className="cmsblock" data-tone={r.tone}>
          <header><span className="cn">{r.codename}</span><h2>Insights</h2><span className="pill">{insights.length ? `rolled up ${day(insights[0].day)}` : "none yet"}</span></header>
          {insights.length === 0 ? (
            <p className="hint">{ids.length < INSIGHT_FLOOR ? `Only ${ids.length} workspace${ids.length === 1 ? "" : "s"} learn for ${r.codename}; an insight across clients needs ${INSIGHT_FLOOR}. Until there are more, read each workspace below.` : "Nothing has three workspaces behind it yet."}</p>
          ) : fams.map((f) => (
            <div key={f}>
              <h3 className="subh">{FAMILY[f]}</h3>
              <ul className="insights">{insights.filter((i) => i.family === f).map((i) => <li key={i.key}>{i.sentence}<small className="muted"> · since {day(i.first_day)}</small></li>)}</ul>
            </div>
          ))}
        </div>

        <h2 className="cmsh">After each release</h2>
        {readings.length === 0 ? <p className="muted">No release yet.</p> : readings.map(({ v, reading, phrase }) => (
          <div key={v.version} className="cmsblock">
            <header><h2><Link href={`/admin/roles/${role}/${v.version}`}>{r.codename} {v.version}</Link></h2><span className="pill">released {day(v.released_at)}</span></header>
            {phrase && <p className="hint">{phrase}</p>}
            {reading && <Readings r={reading} codename={r.codename} />}
          </div>
        ))}

        <h2 className="cmsh">What clients make</h2>
        {made.length === 0 ? <p className="muted">No client has made anything on {r.codename} yet.</p> : (
          <div className="tablewrap people"><table>
            <thead><tr><th>Shape</th><th className="num">Workspaces</th><th className="num">Made</th><th className="num">Live</th><th className="num">Waiting</th><th className="num">Runs</th><th>Who (Fair only)</th></tr></thead>
            <tbody>{made.map((m) => (
              <tr key={m.shape} className={m.workspaces >= INSIGHT_FLOOR ? "" : "muted"}>
                <td><b>{m.label}</b><small className="muted"> · {m.shape}</small></td>
                <td className="num">{m.workspaces}</td><td className="num">{m.items}</td><td className="num">{m.live}</td><td className="num">{m.waiting}</td><td className="num">{m.shape.startsWith("skill.") ? m.runs : ""}</td>
                <td className="muted">{m.workspace_ids.map((w) => names.get(w) ?? w).join(", ")}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="hint">One by one in <Link href={`/admin/creations?role=${role}&show=all`}>Client creations</Link>. A shape in {INSIGHT_FLOOR} or more workspaces also shows as an insight.</p>

        <h2 className="cmsh">Signals</h2>
        <div className="tablewrap people"><table>
          <thead><tr><th>Where</th><th>Signal</th><th className="num">Count</th><th className="num">Workspaces</th><th className="num">Fair staff (left out)</th></tr></thead>
          <tbody>
            {kinds.map((k) => <tr key={k.kind}><td className="muted">{k.surface}</td><td>{k.label}<small className="muted"> · {k.kind}</small></td><td className="num">{n(k.n)}</td><td className="num">{k.workspaces}</td><td className="num muted">{k.staff ? n(k.staff) : ""}</td></tr>)}
            {!kinds.length && <tr><td className="muted" colSpan={5}>No signals in the last {INSIGHT_WINDOW_DAYS} days.</td></tr>}
          </tbody>
        </table></div>

        <h3 className="subh">By workspace</h3>
        <div className="tablewrap people"><table>
          <thead><tr><th>Workspace</th><th className="num">Questions</th><th className="num">Analyses</th><th className="num">Dashboard visits</th><th className="num">Deck actions</th><th className="num">Changes and creations</th><th>Last</th></tr></thead>
          <tbody>
            {use.map((u) => (
              <tr key={u.workspace_id}>
                <td>{can(actor, "workspace.data") ? <Link href={`/admin/workspaces/${u.workspace_id}?tab=signals`}>{u.name}</Link> : u.name}{!u.learning && <small className="muted"> · learning off: stays on its page</small>}{u.status !== "live" && <small className="muted"> · {u.status}</small>}</td>
                <td className="num">{n(u.questions)}</td><td className="num">{n(u.analyses)}</td><td className="num">{n(u.visits)}</td><td className="num">{n(u.decks)}</td><td className="num">{n(u.shaping)}</td><td className="muted">{day(u.last)}</td>
              </tr>
            ))}
            {!use.length && <tr><td className="muted" colSpan={7}>No client has used {r.codename} in the last {INSIGHT_WINDOW_DAYS} days.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </section>
  );
}
