"use client";
/**
 * Reports, one list (DECISIONS, 1 Oct 2026): each schedule with the reports it
 * produced, then what came from Chats. Every report and every schedule can be
 * deleted from the list. The right side shows the open report, or the setup of
 * a new or existing schedule.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { AgentDraft } from "@/agents/promote";
import type { AgentRow, AgentRunRow } from "@/agents/store";
import type { WeeklyContract } from "@/competitor/contract";
import type { ReportRow } from "@/reports/store";
import { fmtDate } from "./format";
import { WeeklyForm } from "./WeeklyForm";

export type AgentWithRuns = AgentRow & { runs: AgentRunRow[] };
type WeeklyParams = { contract?: WeeklyContract; formats?: string[]; last_week?: string };
type Draft = Omit<AgentDraft, "from_skill_run_id" | "notes"> & { from_skill_run_id?: string; notes?: string[] };
export type SetupOptions = { skills: { name: string; title: string }[]; modelConfigured: boolean; emailConfigured: boolean; brands: { id: string; name: string }[]; template: WeeklyContract | null; weeks: { key: string; label: string }[] };
export type ReportsView = { kind: "doc" } | { kind: "new" } | { kind: "schedule"; id: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" });
const when = (iso: string | null, tz: string) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");

export function ReportsHome({ agents, reports, activeId, view, setup, children }: { agents: AgentWithRuns[]; reports: ReportRow[]; activeId: string | null; view: ReportsView; setup: SetupOptions; children?: ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [more, setMore] = useState<Set<string>>(new Set());
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2800); };

  // which reports each schedule produced; the rest came from Chats or from schedules since deleted
  const byAgent = new Map<string, ReportRow[]>();
  const claimed = new Set<string>();
  for (const a of agents) {
    const ids = new Set(a.runs.map((r) => r.id));
    const mine = reports.filter((r) => r.agent_run_id && ids.has(r.agent_run_id));
    mine.forEach((r) => claimed.add(r.id));
    byAgent.set(a.id, mine);
  }
  const rest = reports.filter((r) => !claimed.has(r.id));
  const fromChats = rest.filter((r) => r.source !== "agent");
  const earlier = rest.filter((r) => r.source === "agent");

  async function deleteReport(r: ReportRow) {
    if (!confirm(`Delete "${r.title}"? Its files go with it.`)) return;
    setBusy(`del-${r.id}`);
    const res = await fetch(`/api/reports/${r.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) { showToast("Could not delete the report"); return; }
    showToast("Report deleted");
    if (r.id === activeId) router.push("/reports");
    router.refresh();
  }

  async function act(a: AgentWithRuns, action: "run" | "pause" | "resume" | "delete", week?: string) {
    if (action === "delete" && !confirm(`Delete the schedule "${a.name}"? Its reports stay in the list.`)) return;
    setBusy(a.id + action);
    let r: Response;
    if (action === "run") r = await fetch(`/api/agents/${a.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(week ? { week } : {}) });
    else if (action === "delete") r = await fetch(`/api/agents/${a.id}`, { method: "DELETE" });
    else r = await fetch(`/api/agents/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: action === "pause" ? "paused" : "active" }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (action === "run") {
      showToast(j.error ? j.error : j.message ? `${j.result_status === "ok" ? "Done" : j.result_status === "skipped" ? "Skipped" : "Failed"}: ${j.message}` : `Run finished: ${j.result_status ?? "ok"}`);
      if (j.report_id) router.push(`/reports/${j.report_id}`);
    } else {
      showToast(j.error ?? (action === "delete" ? "Schedule deleted" : `Schedule ${action}d`));
      if (action === "delete" && view.kind === "schedule" && view.id === a.id) router.push("/reports");
    }
    router.refresh();
  }

  const reportLink = (r: ReportRow) => (
    <div key={r.id} className={`rl ${r.id === activeId && view.kind === "doc" ? "on" : ""}`}>
      <Link href={`/reports/${r.id}`}>
        <b>{r.blocks?.kind === "weekly" && r.blocks.week?.iso ? `${r.blocks.week.iso.replace(/^\d{4}-/, "")} · ` : ""}{r.title}</b>
        <span>{day(r.created_at)}{r.blocks?.kind === "weekly" ? " · deck" : r.blocks?.kind === "conversation" ? " · conversation" : ""}</span>
      </Link>
      <button className="x" title="Delete this report" aria-label={`Delete ${r.title}`} disabled={!!busy} onClick={() => deleteReport(r)}>×</button>
    </div>
  );

  const editing = view.kind === "schedule" ? agents.find((a) => a.id === view.id) ?? null : null;
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Reports</h1><span className="meta">What runs on a schedule, and everything produced from it and from Chats</span></div>
        <Link className="btn pri sm" href="/reports?new=1">+ New schedule</Link>
      </div>
      <div className="wrap wide">
        <div className="two reps">
          <aside className="rep-side">
            <h5>Scheduled</h5>
            {agents.length === 0 && <div className="empty sm">Nothing scheduled yet. Start one with "+ New schedule".</div>}
            {agents.map((a) => {
              const mine = byAgent.get(a.id) ?? [];
              const on = view.kind === "schedule" && view.id === a.id;
              return (
                <div key={a.id} className={`sched ${on ? "on" : ""}`}>
                  <div className="sh">
                    <Link href={`/reports?schedule=${a.id}`} className="sn">
                      {a.kind === "weekly_report" && <span className="wbadge">Deck</span>}
                      <b>{a.name}</b>
                    </Link>
                    <span className={`state ${a.status === "active" ? "run" : a.status === "paused" ? "pause" : "new"}`}>{a.status === "active" ? "On" : a.status === "paused" ? "Paused" : "Draft"}</span>
                  </div>
                  <div className="sm">{a.schedule_human ?? a.schedule_cron} · next {a.status === "active" ? when(a.next_run_at, a.schedule_tz) : "–"}</div>
                  <div className="sa">
                    <button disabled={!!busy} onClick={() => act(a, "run")}>{busy === a.id + "run" ? "Running…" : "Run now"}</button>
                    {a.status === "active" ? <button disabled={!!busy} onClick={() => act(a, "pause")}>Pause</button> : <button disabled={!!busy} onClick={() => act(a, "resume")}>Resume</button>}
                    <Link href={`/reports?schedule=${a.id}`}>{a.kind === "weekly_report" ? "Edit" : "Runs"}</Link>
                    <button className="del" disabled={!!busy} onClick={() => act(a, "delete")}>Delete</button>
                  </div>
                  {mine.length > 0 && (
                    <div className="sr">
                      {(more.has(a.id) ? mine : mine.slice(0, 3)).map(reportLink)}
                      {mine.length > 3 && <button className="more" onClick={() => setMore((m) => { const n = new Set(m); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}>{more.has(a.id) ? "Show fewer" : `Show ${mine.length - 3} more`}</button>}
                    </div>
                  )}
                </div>
              );
            })}
            {fromChats.length > 0 && <h5>From Chats</h5>}
            {fromChats.map(reportLink)}
            {earlier.length > 0 && <h5>From earlier schedules</h5>}
            {earlier.map(reportLink)}
            {!reports.length && agents.length > 0 && <div className="empty sm">No reports yet. Press "Run now" on a schedule.</div>}
          </aside>
          <div className="rep-main">
            {view.kind === "new" && <NewSchedule setup={setup} onDone={(m) => { showToast(m); router.push("/reports"); router.refresh(); }} />}
            {view.kind === "schedule" && (editing ? <ScheduleDetail a={editing} setup={setup} busy={busy} onAct={(action, week) => act(editing, action, week)} onSaved={(m) => { showToast(m); router.refresh(); }} /> : <div className="empty">That schedule is gone.</div>)}
            {view.kind === "doc" && (children ?? <div className="empty">No reports yet. Schedule the Weekly Competitor Pulse with "+ New schedule", or press "Turn into a report" under an answer in Chats.</div>)}
          </div>
        </div>
      </div>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </section>
  );
}

/** One schedule on the right: the weekly deck's settings to edit, a run for any past week, and every run. */
function ScheduleDetail({ a, setup, busy, onAct, onSaved }: { a: AgentWithRuns; setup: SetupOptions; busy: string | null; onAct: (action: "run" | "pause" | "resume" | "delete", week?: string) => void; onSaved: (m: string) => void }) {
  const [week, setWeek] = useState("");
  const p = a.params as WeeklyParams;
  const titleOf = (name: string) => setup.skills.find((s) => s.name === name)?.title ?? name;
  const outcome = (r: AgentRunRow) => (r.delivery_error ? r.delivery_error : r.report_id ? (r.delivered_at ? "sent" : "made") : r.finished_at ? (a.kind === "weekly_report" ? "skipped: no new week of data" : r.should_deliver === false ? "skipped: no change" : "done") : "running");
  return (
    <div className="setup flat">
      <h3>{a.name}</h3>
      <p>{a.kind === "weekly_report" ? `For ${p.contract?.client.name ?? "?"} · ${a.schedule_human ?? a.schedule_cron} · to ${a.delivery.email || "the list only"}${p.last_week ? ` · last sent ${p.last_week}` : ""}` : `${titleOf(a.skill)} · ${a.schedule_human ?? a.schedule_cron} · via ${a.delivery.channels.join(" + ")}${a.only_if_changed ? " · only if changed" : ""}`}</p>
      <div className="acts" style={{ margin: "10px 0 14px" }}>
        {a.kind === "weekly_report" && (
          <select className="dsel sm" value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Week to report">
            <option value="">Latest full week</option>
            {setup.weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        )}
        <button className="btn sm" disabled={!!busy} onClick={() => onAct("run", week || undefined)}>{busy === a.id + "run" ? (a.kind === "weekly_report" ? "Making the deck…" : "Running…") : "Run now"}</button>
        {a.status === "active" ? <button className="btn sm" disabled={!!busy} onClick={() => onAct("pause")}>Pause</button> : <button className="btn sm" disabled={!!busy} onClick={() => onAct("resume")}>Resume</button>}
        <button className="btn sm ghost" disabled={!!busy} onClick={() => onAct("delete")}>Delete schedule</button>
      </div>
      {a.kind === "weekly_report" && (
        <WeeklyForm key={a.id} brands={setup.brands} initial={{ id: a.id, name: a.name, contract: p.contract ?? null, formats: p.formats, email: a.delivery.email, cron: a.schedule_cron }} onDone={onSaved} />
      )}
      <h5 style={{ marginTop: 18 }}>Runs</h5>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Started</th><th>Outcome</th><th>Report</th></tr></thead>
          <tbody>
            {a.runs.length === 0 && <tr><td colSpan={3} style={{ color: "var(--text-3)" }}>No runs yet</td></tr>}
            {a.runs.map((r) => (
              <tr key={r.id} style={{ cursor: "default" }}>
                <td>{fmtDate(r.started_at)}</td>
                <td style={{ whiteSpace: "normal" }}>{outcome(r)}</td>
                <td>{r.report_id ? <Link className="linkbtn" href={`/reports/${r.report_id}`}>open</Link> : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A new schedule: the Weekly Competitor Pulse, or any analysis described in plain words. */
function NewSchedule({ setup, onDone }: { setup: SetupOptions; onDone: (m: string) => void }) {
  const [mode, setMode] = useState<"weekly" | "analysis">("weekly");
  const [text, setText] = useState("Every Monday, compare Skintific, Somethinc and Emina on TikTok and email me. Only if something changed.");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [paramsText, setParamsText] = useState("{}");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function parse() {
    setBusy("draft"); setError("");
    const r = await fetch("/api/agents/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const j = await r.json();
    setBusy(null);
    if (j.error) { setError(j.error); return; }
    setDraft(j.draft); setParamsText(JSON.stringify(j.draft.params, null, 1));
  }
  async function create() {
    if (!draft) return;
    let params: Record<string, unknown>;
    try { params = JSON.parse(paramsText); } catch { setError("Params must be valid JSON"); return; }
    setBusy("create"); setError("");
    const r = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, params }) });
    const j = await r.json();
    setBusy(null);
    if (j.error) { setError(j.error); return; }
    onDone(`Scheduled — next run ${fmtDate(j.agent.next_run_at)}`);
  }

  return (
    <div className="setup flat">
      <div className="seg sm setup-tabs" role="tablist">
        <a role="tab" href="#" className={mode === "weekly" ? "on" : ""} onClick={(e) => { e.preventDefault(); setMode("weekly"); }}>Weekly Competitor Pulse</a>
        <a role="tab" href="#" className={mode === "analysis" ? "on" : ""} onClick={(e) => { e.preventDefault(); setMode("analysis"); }}>Any analysis</a>
      </div>
      {mode === "weekly" ? (
        <>
          <h3>Weekly Competitor Pulse</h3>
          <p>A deck on what competitors did last week and what to do about it, as PowerPoint and PDF, in this list and in your inbox.</p>
          <WeeklyForm key="new" brands={setup.brands} initial={{ contract: setup.template }} onDone={onDone} />
          {!setup.emailConfigured && <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>Email delivery needs RESEND_API_KEY and EMAIL_FROM; until then reports land in this list only.</p>}
        </>
      ) : (
        <>
          <h3>Schedule an analysis</h3>
          <p>Describe it the way you'd brief a colleague. We turn it into a schedule you can edit.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 8 }}>
            <button className="btn pri sm" disabled={busy === "draft" || !setup.modelConfigured} onClick={parse} title={setup.modelConfigured ? "" : "ANTHROPIC_API_KEY is not set"}>{busy === "draft" ? "Reading…" : "Set it up"}</button>
          </div>
          {!setup.modelConfigured && <p style={{ marginTop: 8, fontSize: 12, color: "var(--amber)" }}>The model is not configured here, so free-text setup is off. Use "Watch this weekly" under an answer in Chats.</p>}
          {error && <div className="errbox" style={{ marginTop: 10 }}>{error}</div>}
          {draft && (
            <div className="parsed on">
              <h5>Here's how we read that. Edit anything.</h5>
              <div className="field"><span>Name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={inp} /></div>
              <div className="field"><span>Analysis</span><select value={draft.skill} onChange={(e) => setDraft({ ...draft, skill: e.target.value })} style={inp}>{setup.skills.map((s) => <option key={s.name} value={s.name}>{s.title}</option>)}</select></div>
              <div className="field"><span>Params</span><textarea value={paramsText} onChange={(e) => setParamsText(e.target.value)} style={{ ...inp, minHeight: 70, fontFamily: "monospace", fontSize: 12 }} /></div>
              <div className="field"><span>Cron</span><input value={draft.schedule.cron} onChange={(e) => setDraft({ ...draft, schedule: { ...draft.schedule, cron: e.target.value } })} style={inp} /></div>
              <div className="field"><span>Schedule</span><b>{draft.schedule.human} · {draft.schedule.tz}</b></div>
              <div className="field"><span>Deliver to</span><div className="tags">{["email", "whatsapp", "in_app"].map((c) => <span key={c} className={`tag ${draft.delivery.channels.includes(c) ? "me" : ""}`} style={{ cursor: c === "in_app" ? "default" : "pointer" }} onClick={() => { if (c === "in_app") return; const has = draft.delivery.channels.includes(c); setDraft({ ...draft, delivery: { ...draft.delivery, channels: has ? draft.delivery.channels.filter((x) => x !== c) : [...draft.delivery.channels, c] } }); }}>{c}</span>)}</div></div>
              {draft.delivery.channels.includes("email") && <div className="field"><span>Email</span><input placeholder="name@company.com" value={draft.delivery.email ?? ""} onChange={(e) => setDraft({ ...draft, delivery: { ...draft.delivery, email: e.target.value } })} style={inp} /></div>}
              <div className="field"><span>Only if changed</span><div className={`switch ${draft.only_if_changed ? "on" : ""}`} role="switch" aria-checked={draft.only_if_changed} tabIndex={0} onClick={() => setDraft({ ...draft, only_if_changed: !draft.only_if_changed })} /></div>
              {!!draft.notes?.length && <div style={{ fontSize: 12, color: "var(--text-3)", padding: "8px 0" }}>{draft.notes.join(". ")}.</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn sm" onClick={() => setDraft(null)}>Discard</button>
                <button className="btn pri sm" disabled={busy === "create"} onClick={create}>{busy === "create" ? "Creating…" : "Schedule it"}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { font: "inherit", fontSize: 13, padding: "6px 9px", border: "1px solid var(--line-2)", borderRadius: 8, background: "#fff", width: "100%" };
