"use client";
/** Agents screen (PRD §6, §8): list with runs, and the conversational "New agent" panel. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentRow, AgentRunRow } from "@/agents/store";
import type { AgentDraft } from "@/agents/promote";
import { fmtDate } from "./format";

type AgentWithRuns = AgentRow & { runs: AgentRunRow[] };
type Draft = Omit<AgentDraft, "from_skill_run_id" | "notes"> & { from_skill_run_id?: string; notes?: string[] };

export function Agents({ agents, skills, modelConfigured, emailConfigured }: { agents: AgentWithRuns[]; skills: string[]; modelConfigured: boolean; emailConfigured: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("Every Monday, compare Skintific, Somethinc and Emina on TikTok and email me. Only if something changed.");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [paramsText, setParamsText] = useState("{}");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

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
    setDraft(null); showToast(`Agent created — next run ${fmtDate(j.agent.next_run_at)}`); router.refresh();
  }
  async function act(id: string, action: "run" | "pause" | "resume" | "delete") {
    setBusy(id + action);
    let r: Response;
    if (action === "run") r = await fetch(`/api/agents/${id}/run`, { method: "POST" });
    else if (action === "delete") r = await fetch(`/api/agents/${id}`, { method: "DELETE" });
    else r = await fetch(`/api/agents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: action === "pause" ? "paused" : "active" }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (action === "run") {
      const d = j.diff; const del = (j.delivered ?? []).map((x: any) => `${x.channel}: ${x.ok ? "ok" : x.detail}`).join(" · ");
      showToast(j.error ? j.error : d ? `Ran: ${d.first_run ? `${d.new.length} rows (baseline)` : `${d.new.length} new, ${d.gone.length} gone, ${d.changed.length} changed`} · ${del}` : `Run finished: ${j.result_status}`);
      setOpen(id);
    } else showToast(j.error ?? (action === "delete" ? "Agent deleted" : `Agent ${action}d`));
    router.refresh();
  }
  const running = agents.filter((a) => a.status === "active").length;
  const next = agents.filter((a) => a.next_run_at).map((a) => a.next_run_at!).sort()[0];

  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Agents</h1><span className="meta">Skills on a schedule</span></div>
        <span className="pill">{running} running{next ? ` · next run ${new Date(next).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", weekday: "short", hour: "2-digit", minute: "2-digit" })} WIB` : ""}</span>
      </div>
      <div className="wrap wide">
        <div className="two">
          <div className="list">
            {agents.length === 0 && <div className="empty">No agents yet. Describe one on the right, or open a skill result in Ask and press "Get this every Monday".</div>}
            {agents.map((a) => {
              const last = a.runs[0];
              const d = last?.diff;
              return (
                <div className="agent" key={a.id}>
                  <div>
                    <h4>{a.name}</h4>
                    <p><span className="slash">/</span>{a.skill} · {Object.entries(a.params).filter(([k]) => !["limit"].includes(k)).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ") || "defaults"}{a.only_if_changed ? " · only if changed" : ""}</p>
                    <div className="row">
                      <span>{a.schedule_human ?? a.schedule_cron} <b>{a.schedule_cron}</b></span>
                      <span>Via <b>{a.delivery.channels.join(" + ")}</b>{a.delivery.email ? ` (${a.delivery.email})` : ""}</span>
                      <span>Next <b>{a.next_run_at ? new Date(a.next_run_at).toLocaleString("en-GB", { timeZone: a.schedule_tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–"}</b></span>
                      {last && <span>Last run <b>{fmtDate(last.started_at)}</b>{d ? ` · ${d.first_run ? "baseline" : `${d.new.length} new · ${d.gone.length} gone · ${d.changed.length} changed`}` : ""}{last.delivery_error ? ` · ${last.delivery_error}` : last.delivered_at ? " · delivered" : ""}</span>}
                    </div>
                    <div className="acts" style={{ marginTop: 10 }}>
                      <button className="btn sm" disabled={!!busy} onClick={() => act(a.id, "run")}>{busy === a.id + "run" ? "Running…" : "Run now"}</button>
                      {a.status === "active" ? <button className="btn sm" disabled={!!busy} onClick={() => act(a.id, "pause")}>Pause</button> : <button className="btn sm" disabled={!!busy} onClick={() => act(a.id, "resume")}>Resume</button>}
                      <button className="btn sm" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide runs" : `Runs (${a.runs.length})`}</button>
                      <button className="btn sm ghost" disabled={!!busy} onClick={() => { if (confirm(`Delete "${a.name}"?`)) act(a.id, "delete"); }}>Delete</button>
                    </div>
                    {open === a.id && (
                      <div className="tablewrap" style={{ marginTop: 10 }}>
                        <table>
                          <thead><tr><th>Started</th><th>Result</th><th className="num">New</th><th className="num">Gone</th><th className="num">Changed</th><th>Delivery</th><th>Report</th></tr></thead>
                          <tbody>
                            {a.runs.length === 0 && <tr><td colSpan={7} style={{ color: "var(--text-3)" }}>No runs yet</td></tr>}
                            {a.runs.map((r) => (
                              <tr key={r.id} style={{ cursor: "default" }}>
                                <td>{new Date(r.started_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                                <td>{r.finished_at ? (r.diff ? (r.diff.first_run ? "baseline" : "ok") : "failed") : "running"}</td>
                                <td className="num">{r.diff?.new.length ?? "–"}</td><td className="num">{r.diff?.gone.length ?? "–"}</td><td className="num">{r.diff?.changed.length ?? "–"}</td>
                                <td>{r.should_deliver === false ? "skipped (no change)" : r.delivered_at ? "delivered" : r.delivery_error ?? "in-app"}</td>
                                <td>{r.report_id ? <Link className="linkbtn" href={`/reports/${r.report_id}`}>open</Link> : "–"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <span className={`state ${a.status === "active" ? "run" : a.status === "paused" ? "pause" : "new"}`}>{a.status === "active" ? "Running" : a.status === "paused" ? "Paused" : "Draft"}</span>
                </div>
              );
            })}
          </div>
          <div className="setup">
            <h3>New agent</h3>
            <p>Describe it the way you'd brief a colleague. We turn it into a schedule you can edit.</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 8 }}>
              <button className="btn pri sm" disabled={busy === "draft" || !modelConfigured} onClick={parse} title={modelConfigured ? "" : "ANTHROPIC_API_KEY is not set"}>{busy === "draft" ? "Reading…" : "Set it up"}</button>
            </div>
            {!modelConfigured && <p style={{ marginTop: 8, fontSize: 12, color: "var(--amber)" }}>The model is not configured here, so free-text setup is off. Use "Run this weekly" on a /discovery run or "Get this every Monday" in Ask.</p>}
            {!emailConfigured && <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>Email delivery needs RESEND_API_KEY and EMAIL_FROM; until then runs are listed here only.</p>}
            {error && <div className="errbox" style={{ marginTop: 10 }}>{error}</div>}
            {draft && (
              <div className="parsed on">
                <h5>Here's how we read that. Edit anything.</h5>
                <div className="field"><span>Name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={inp} /></div>
                <div className="field"><span>Skill</span><select value={draft.skill} onChange={(e) => setDraft({ ...draft, skill: e.target.value })} style={inp}>{skills.map((s) => <option key={s} value={s}>/{s}</option>)}</select></div>
                <div className="field"><span>Params</span><textarea value={paramsText} onChange={(e) => setParamsText(e.target.value)} style={{ ...inp, minHeight: 70, fontFamily: "monospace", fontSize: 12 }} /></div>
                <div className="field"><span>Cron</span><input value={draft.schedule.cron} onChange={(e) => setDraft({ ...draft, schedule: { ...draft.schedule, cron: e.target.value } })} style={inp} /></div>
                <div className="field"><span>Schedule</span><b>{draft.schedule.human} · {draft.schedule.tz}</b></div>
                <div className="field"><span>Deliver to</span><div className="tags">{["email", "whatsapp", "in_app"].map((c) => <span key={c} className={`tag ${draft.delivery.channels.includes(c) ? "me" : ""}`} style={{ cursor: c === "in_app" ? "default" : "pointer" }} onClick={() => { if (c === "in_app") return; const has = draft.delivery.channels.includes(c); setDraft({ ...draft, delivery: { ...draft.delivery, channels: has ? draft.delivery.channels.filter((x) => x !== c) : [...draft.delivery.channels, c] } }); }}>{c}</span>)}</div></div>
                {draft.delivery.channels.includes("email") && <div className="field"><span>Email</span><input placeholder="name@company.com" value={draft.delivery.email ?? ""} onChange={(e) => setDraft({ ...draft, delivery: { ...draft.delivery, email: e.target.value } })} style={inp} /></div>}
                <div className="field"><span>Only if changed</span><div className={`switch ${draft.only_if_changed ? "on" : ""}`} role="switch" aria-checked={draft.only_if_changed} tabIndex={0} onClick={() => setDraft({ ...draft, only_if_changed: !draft.only_if_changed })} /></div>
                {!!draft.notes?.length && <div style={{ fontSize: 12, color: "var(--text-3)", padding: "8px 0" }}>{draft.notes.join(". ")}.</div>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                  <button className="btn sm" onClick={() => setDraft(null)}>Discard</button>
                  <button className="btn pri sm" disabled={busy === "create"} onClick={create}>{busy === "create" ? "Creating…" : "Create agent"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </section>
  );
}

const inp: React.CSSProperties = { font: "inherit", fontSize: 13, padding: "6px 9px", border: "1px solid var(--line-2)", borderRadius: 8, background: "#fff", width: "100%" };
