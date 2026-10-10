/**
 * One workspace in the CMS (CMS plan, "Workspace lifecycle", "Data", "Health"): its status
 * and the steps to bring it live, the dump and its inspect report, brands and accounts,
 * sentiment labels, the load and its report, relevance terms, topics, and health with the
 * notes CeMO reads. Fair's data ops and owners; only Refal or Rafli switch it live.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { workspacePage } from "@/onboard/page";
import { SourceUpload } from "@/ui/admin/onboard/SourceUpload";
import { BrandMapper } from "@/ui/admin/onboard/BrandMapper";
import { LabelMap } from "@/ui/admin/onboard/LabelMap";
import { LoadPanel } from "@/ui/admin/onboard/LoadPanel";
import { LoadsList } from "@/ui/admin/loads/LoadsList";
import { loadsOf } from "@/loader/page";
import { TermsEditor } from "@/ui/admin/onboard/TermsEditor";
import { TopicsEditor } from "@/ui/admin/onboard/TopicsEditor";
import { StatusActions } from "@/ui/admin/onboard/StatusActions";
import { NotesEditor, RunHealth } from "@/ui/admin/onboard/NotesEditor";
import { Act } from "@/ui/company/Act";
import { workspaceSignals } from "@/learning/views";
import { INSIGHT_WINDOW_DAYS } from "@/config/learning";
import { ROLES, isRoleId } from "@/roles/model";
import { casesFor } from "@/cases/store";
import { CasesEditor } from "@/ui/admin/cases/CasesEditor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TABS = [["overview", "Overview"], ["source", "1 · Dump"], ["brands", "2 · Brands"], ["load", "3 · Load"], ["loads", "Loads"], ["relevance", "Relevance"], ["topics", "Topics"], ["cases", "Cases"], ["health", "Health"], ["signals", "Signals"]] as const;
const STATUS: Record<string, string> = { draft: "Draft", loading: "Loading", review: "In review", live: "Live", paused: "Paused", archived: "Archived" };
const n = (x: unknown) => Number(x ?? 0).toLocaleString("en-US");
const kb = (b: number) => (b > 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "–");
const list = (o: unknown) => Object.entries((o ?? {}) as Record<string, unknown>).map(([k, v]) => `${k} ${n(v)}`).join(" · ");

export default async function WorkspaceData({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const actor = await currentActor();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!actor || !can(actor, "workspace.data", { workspace: id })) notFound();
  const d = await workspacePage(id);
  if (!d) notFound();
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const owner = can(actor, "role.release");
  const steps = [
    { key: "source", label: "Upload and inspect the dump", done: !!d.inspect && d.needed.every((t) => d.source.files?.[t]) },
    { key: "brands", label: "Map accounts to brands; sentiment labels", done: d.brands.length > 0 && !d.blockers.some((b) => /brand|label/i.test(b)) },
    { key: "load", label: "Load", done: d.counts.posts > 0 && !d.jobs.some((j) => (j.kind === "dump_load" || j.kind === "load") && ["queued", "running"].includes(j.status)) },
    { key: "health", label: "Read the load report and health", done: !!d.health },
    { key: "overview", label: "Switch live (Refal or Rafli)", done: d.status === "live" },
  ];
  const running = d.jobs.find((j) => (j.kind === "dump_load" || j.kind === "load") && ["queued", "running"].includes(j.status));
  const posts = d.loads.find((l) => l.kind === "posts");
  const comments = d.loads.find((l) => l.kind === "comments");
  const snaps = d.loads.find((l) => l.kind === "snapshots");
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>{d.name}</h1><span className="meta"><Link href="/admin/workspaces">Workspaces</Link> · {d.id} · <b className={`wstatus ${d.status}`}>{STATUS[d.status] ?? d.status}</b> · {d.roles.join(", ")}</span></div>
        <StatusActions ws={d.id} status={d.status} owner={owner} />
      </div>
      <div className="wrap wide cms onbpage">
        <div className="cats">{TABS.map(([k, label]) => <Link key={k} href={`/admin/workspaces/${d.id}?tab=${k}`} className={tab === k ? "on" : ""}>{label}</Link>)}</div>

        {tab === "overview" && (
          <>
            <ol className="steps">{steps.map((s) => <li key={s.label} className={s.done ? "done" : ""}><Link href={`/admin/workspaces/${d.id}?tab=${s.key}`}>{s.label}</Link></li>)}</ol>
            <div className="kpis">{(["posts", "comments", "creators", "snapshots"] as const).map((k) => <div key={k} className="kpi"><span className="label">{k}</span><b>{n(d.counts[k])}</b></div>)}</div>
            {d.blockers.length > 0 && d.status !== "live" && <ul className="blockers">{d.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
            <p className="muted">Clients only see a live workspace. Paused: client sign-in, crons and scheduled decks stop; the data is kept.</p>
          </>
        )}

        {tab === "source" && (
          <>
            <SourceUpload ws={d.id} blob={d.blob} needed={d.needed} />
            <div className="tablewrap people"><table>
              <thead><tr><th>Table</th><th>File</th><th className="num">Size</th><th className="num">Rows</th><th>Columns not read</th></tr></thead>
              <tbody>{d.needed.map((t) => {
                const f = d.source.files?.[t];
                const i = d.inspect?.files.find((x) => x.table === t);
                return <tr key={t} className={f ? "" : "warnrow"}><td>{t}</td><td>{f ? f.name : <span className="err">missing</span>}</td><td className="num">{f ? kb(f.size) : ""}</td><td className="num">{i ? n(i.rows) : ""}</td><td className="muted">{i?.missing_columns.length ? <span className="err">missing: {i.missing_columns.join(", ")}</span> : i?.unread_columns.join(", ")}</td></tr>;
              })}</tbody></table></div>
            {d.inspect && (
              <div className="insp">
                <p><b>{n(Object.values(d.inspect.platforms).reduce((a, x) => a + x, 0))} posts</b> ({list(d.inspect.platforms)}), {n(d.inspect.comments)} comments, {n(d.inspect.snapshots)} snapshots, posted {d.inspect.span?.[0]} to {d.inspect.span?.[1]}. Left out on purpose: {d.inspect.ignored_tables.join(", ")}.</p>
                <p className="muted">Last days: {d.inspect.posts_by_day_last.map((x) => `${x.day.slice(5)} ${x.posts}`).join(" · ")} (the last days of a dump are often incomplete).</p>
                <p className="muted">Inspected {when(d.source.inspected_at ?? null)}.</p>
              </div>
            )}
          </>
        )}

        {tab === "brands" && (
          d.inspect ? (
            <>
              <h2 className="cmsh">Accounts and brands</h2>
              <BrandMapper ws={d.id} handles={d.inspect.handles} suggestions={d.inspect.suggestions} current={Object.fromEntries(d.brands.map((b) => [b.id, b]))} client={d.client} />
              <h2 className="cmsh">Sentiment labels</h2>
              <LabelMap ws={d.id} labels={d.inspect.labels} current={(d.source.sentiment_map ?? {}) as Record<string, string | null>} />
            </>
          ) : <p className="muted">Upload and inspect the dump first.</p>
        )}

        {tab === "load" && (
          <>
            <LoadPanel ws={d.id} blockers={d.blockers} running={running?.id ?? null} canReset={["draft", "review", "loading"].includes(d.status)} />
            {posts && posts.report.staging_load ? (
              <div className="report">
                <h2 className="cmsh">Load report <small className="muted">{when(posts.finished_at)}</small></h2>
                <p>{d.loads.filter((l) => l.report.staging_load === posts.report.staging_load).map((l) => `${l.file}: ${n(l.report.rows_in)} rows, ${n(l.report.staged)} staged, ${n(l.report.merged)} merged, ${n(l.report.dropped)} dropped`).join(" · ")}.</p>
                <p className="muted">The checks, what went in and who was told: <Link href={`/admin/workspaces/${d.id}?tab=loads`}>Loads</Link>.</p>
              </div>
            ) : posts && (
              <div className="report">
                <h2 className="cmsh">Load report <small className="muted">{when(posts.finished_at)}</small></h2>
                <p><b>{n(posts.report.posts)} posts</b> from {n(posts.report.rows_in)} captured ({n(posts.report.duplicates_merged)} duplicate captures merged{Object.keys((posts.report.drops ?? {}) as object).length ? `; dropped: ${Object.entries(posts.report.drops as Record<string, { count: number }>).map(([k, v]) => `${k} ${n(v.count)}`).join(", ")}` : ""}), {n(posts.report.creators)} accounts, {n(posts.report.views)} views.</p>
                <p>By platform: {list(posts.report.by_platform)}. By brand: {list(posts.report.by_brand)}.</p>
                <p>Own posts by brand: {list(posts.report.owned_by_brand)}.</p>
                <p><b>Not about their brand:</b> {n(Object.values((posts.report.not_about_brand ?? {}) as Record<string, number>).reduce((a, x) => a + x, 0))} of {n(posts.report.posts)} ({list(posts.report.not_about_brand)}); they stay stored and never count.</p>
                <p>By month: {list(posts.report.by_month)}.</p>
                {snaps && <p>Snapshots: {n(snaps.report.snapshots)} for {n(snaps.report.posts_with_snapshots)} posts, day 0 to {String(snaps.report.max_day)}.</p>}
                {comments && <p>Comments: {n(comments.report.comments)} ({n(comments.report.brand_replies)} brand replies never counted; {n(comments.report.without_label)} without a label); sentiment {list(comments.report.sentiment)}.</p>}
              </div>
            )}
            {d.jobs.length > 0 && <p className="muted">Jobs: {d.jobs.map((j) => `${j.kind.replace("_", " ")} ${j.status}${j.error ? ` (${j.error.slice(0, 80)})` : ""} ${when(j.updated_at)}`).join(" · ")}</p>}
          </>
        )}

        {tab === "loads" && await (async () => {
          const { loads, raw } = await loadsOf(d.id, (await casesFor(actor, d.id)).map((c) => c.id));
          return (
            <>
              <LoadsList ws={d.id} loads={loads} />
              <h2 className="cmsh">Raw files</h2>
              <p className="muted">Kept as received for 12 months{raw.some((f) => !f.stored) ? "; not in the store yet (no Blob store connected): " + raw.filter((f) => !f.stored).length + " of " + raw.length : ""}.</p>
              <div className="tablewrap people"><table>
                <thead><tr><th>File</th><th className="num">Size</th><th>Received</th><th>Stored</th></tr></thead>
                <tbody>{raw.map((f) => <tr key={f.blob}><td>{f.path}</td><td className="num">{kb(f.bytes)}</td><td>{f.received}</td><td>{f.stored ? "yes" : <span className="muted">not yet</span>}</td></tr>)}</tbody>
              </table></div>
            </>
          );
        })()}

        {tab === "relevance" && (d.brands.length ? (
          <>
            <div className="tablewrap people"><table><thead><tr><th>Brand</th><th className="num">Posts</th><th className="num">About the brand</th></tr></thead>
              <tbody>{d.brands.map((b) => <tr key={b.id}><td>{b.name}{b.id === d.client ? <span className="tag me">client</span> : null}</td><td className="num">{n(b.posts)}</td><td className="num">{n(b.relevant)} <small className="muted">{b.posts ? Math.round((b.relevant / b.posts) * 100) : 0}%</small></td></tr>)}</tbody></table></div>
            <h2 className="cmsh">Terms</h2>
            <TermsEditor ws={d.id} brands={d.brands} />
          </>
        ) : <p className="muted">Map the brands first.</p>)}

        {tab === "topics" && (d.topics.length ? <TopicsEditor ws={d.id} topics={d.topics} /> : <p className="muted">Topics arrive with the load.</p>)}
        {tab === "cases" && <CasesEditor ws={d.id} me={actor.email} canManage={can(actor, "case.manage", { workspace: d.id })} cases={(await casesFor(actor, d.id)).map(({ created_by: _c, created_at: _a, updated_at: _u, workspace_id: _w, ...c }) => c)} />}

        {tab === "health" && (
          <>
            <div className="row"><span className="muted">{d.health ? `Checked ${when(d.health.at)}` : "Not checked yet"}</span><RunHealth ws={d.id} /></div>
            {d.health && (
              <div className="tablewrap people"><table><tbody>{d.health.checks.map((c) => (
                <tr key={c.key}><td><span className={`hst ${c.status}`}>{c.status}</span></td><td><b>{c.label}</b></td><td>{c.detail}{d.health!.streak?.[c.key] >= 2 ? <small className="muted"> · two checks running</small> : null}</td></tr>
              ))}</tbody></table></div>
            )}
            <h2 className="cmsh">Notes CeMO reads</h2>
            <NotesEditor ws={d.id} notes={d.notes} suggestions={(d.health?.checks ?? []).map((c) => c.note).filter((x): x is string => !!x)} />
          </>
        )}

        {tab === "signals" && await (async () => {
          const sg = await workspaceSignals(d.id);
          return (
            <>
              <div className="row">
                <span>{sg.learning ? <>Learning across clients is <b>on</b>: its signals count in each role&apos;s insights, anonymously and only with two other workspaces beside it.</> : <>Learning across clients is <b>off</b> (its contract): its signals stay on this page.</>}</span>
                <Act label={sg.learning ? "Switch learning off" : "Switch learning on"} url="/api/admin/learning" body={{ action: "learning", ws: d.id, on: !sg.learning }} className="btn sm" confirm={sg.learning ? "Keep this workspace's signals out of the roll-ups across clients?" : undefined} />
              </div>
              <p className="muted">Last {INSIGHT_WINDOW_DAYS} days. A signal carries ids and choices only: never a question, an answer, a post, a house rule&apos;s wording or a number from the data.{sg.last ? ` Latest ${when(sg.last)}.` : ""}</p>
              {Object.keys(sg.byRole).length === 0 && <p className="muted">No signals yet.</p>}
              {Object.entries(sg.byRole).map(([role, rows]) => (
                <div key={role}>
                  <h2 className="cmsh">{isRoleId(role) ? `${ROLES[role].codename} · ${ROLES[role].label}` : role}</h2>
                  <div className="tablewrap people"><table>
                    <thead><tr><th>Where</th><th>Signal</th><th className="num">Clients</th><th className="num">Fair staff</th></tr></thead>
                    <tbody>{rows.map((k) => <tr key={k.kind}><td className="muted">{k.surface}</td><td>{k.label}</td><td className="num">{n(k.n)}</td><td className="num muted">{k.staff ? n(k.staff) : ""}</td></tr>)}</tbody>
                  </table></div>
                </div>
              ))}
            </>
          );
        })()}
      </div>
    </section>
  );
}
