"use client";
/**
 * A workspace's loads (DECISIONS, 10 Oct 2026, "Data architecture V1"): each load with its files, what it staged, its
 * checks, what it changed when it went in, and who was told. A held load waits here: let it in or throw it away.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboard } from "../onboard/useOnboard";
import type { LoadRow } from "@/loader/page";

const n = (x: unknown) => Number(x ?? 0).toLocaleString("en-US");
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "–");
const STATUS: Record<string, string> = { reading: "reading", staged: "staged", held: "held", promoting: "going in", live: "in", discarded: "thrown away", failed: "failed" };
const HST: Record<string, string> = { live: "ok", held: "fail", failed: "fail", discarded: "info", staged: "warn", promoting: "warn", reading: "warn" };
const OUT: Record<string, string> = { pass: "ok", hold: "fail", warn: "warn", info: "info" };
/** what a promotion counts, in words: a post is one post_items row, and a posts row is its link to a brand (DECISIONS, 10 Oct 2026) */
const WORD: Record<string, string> = { items: "posts", posts: "brand links", stub_posts: "posts known only from their comments" };

export function LoadsList({ ws, loads }: { ws: string; loads: LoadRow[] }) {
  const router = useRouter();
  const { runJob } = useOnboard(ws);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(loads.find((l) => l.status === "held")?.id ?? null);
  async function act(action: string, id: string, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(`${action}:${id}`); setMsg("");
    const r = await fetch("/api/admin/loads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, workspace_id: ws, load_id: id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error ?? `Failed (${r.status})`); setBusy(""); return; }
    if (j.job_id) await runJob(String(j.job_id), (p) => setMsg(p.error ? `Stopped: ${p.error}` : String(p.note ?? p.status)));
    setBusy("");
    router.refresh();
  }
  if (!loads.length) return <p className="muted">No load through the one loader yet.</p>;
  return (
    <div className="tablewrap people loads">
      {msg && <p className="muted">{msg}</p>}
      <table>
        <thead><tr><th>Started</th><th>Source</th><th>Files</th><th>Status</th><th>Checks</th><th className="num">Changed</th><th /></tr></thead>
        <tbody>
          {loads.map((l) => {
            const bad = l.checks.filter((c) => c.outcome === "hold" || c.outcome === "warn");
            const changed = Object.values(l.promoted ?? {}).reduce((a, x) => a + Number(x ?? 0), 0);
            return [
              <tr key={l.id} className={l.status === "held" ? "warnrow" : ""} onClick={() => setOpen(open === l.id ? null : l.id)} style={{ cursor: "pointer" }}>
                <td>{when(l.created_at)}<br /><small className="muted">{l.started_by ?? ""}</small></td>
                <td>{l.source}{l.case_id ? <><br /><small className="muted">case: {l.case_name ?? l.case_id}</small></> : null}</td>
                <td>{l.files.length === 1 ? l.files[0].path.split("/").pop() : `${l.files.length} files`}</td>
                <td><span className={`hst ${HST[l.status] ?? "info"}`}>{STATUS[l.status] ?? l.status}</span>{l.cleared_at && l.status !== "discarded" ? <small className="muted"> · cleared</small> : null}</td>
                <td>{bad.length ? bad.map((c) => <span key={c.key} className={`hst ${OUT[c.outcome]}`} title={c.detail}>{c.label}</span>) : l.checks.length ? <span className="hst ok">all passed</span> : ""}</td>
                <td className="num">{l.promoted ? n(changed) : ""}</td>
                <td className="row" onClick={(e) => e.stopPropagation()}>
                  {l.status === "held" && <button className="btn pri sm" disabled={!!busy} onClick={() => act("let_in", l.id, "Let this load in although its checks held it? Your name is kept with the decision.")}>Let it in</button>}
                  {(l.status === "held" || l.status === "staged") && <button className="btn sm ghost" disabled={!!busy} onClick={() => act("discard", l.id, "Throw this load away? Its staged rows go; nothing reached the core.")}>Throw away</button>}
                  {(l.status === "live" || l.status === "discarded" || l.status === "failed") && <button className="btn sm ghost" disabled={!!busy} onClick={() => act("reload", l.id, "Load the same raw files again, through the same checks?")}>Load again</button>}
                </td>
              </tr>,
              open === l.id && (
                <tr key={`${l.id}:more`}><td colSpan={7}>
                  {l.error && <p className="err">{l.error}</p>}
                  <ul className="checks">{l.checks.map((c) => <li key={c.key}><span className={`hst ${OUT[c.outcome]}`}>{c.outcome}</span> <b>{c.label}</b>: {c.detail}</li>)}</ul>
                  {l.file_reports.length > 0 && <p className="muted">{l.file_reports.map((f) => `${f.file}: ${n(f.rows_in)} rows, ${n(f.staged)} staged, ${n(f.merged)} merged, ${n(f.dropped)} dropped`).join(" · ")}</p>}
                  {l.staged && <p className="muted">Staged: {Object.entries(l.staged).filter(([, v]) => Number(v)).map(([k, v]) => `${n(v)} ${k}`).join(", ")}.{l.promoted ? ` Changed when it went in: ${Object.entries(l.promoted).map(([k, v]) => `${n(v)} ${WORD[k] ?? k}`).join(", ")}.` : ""}</p>}
                  {l.notice && <p className="muted">Told {l.notice.to.join(", ") || "no one"} {when(l.notice.at)}: {l.notice.sent ? "sent" : `not sent (${l.notice.error ?? "email not set up"})`}.</p>}
                  {l.decided_by && <p className="muted">Decided by {l.decided_by}.</p>}
                </td></tr>
              ),
            ];
          })}
        </tbody>
      </table>
      <p className="muted">Every load lands in staging first and is checked: a broken one is held here, one with warnings goes in with those rows flagged and kept out of rates and medians. Staged rows are cleared 30 days after.</p>
    </div>
  );
}
