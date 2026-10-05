"use client";
/** A version's test set with its latest results; guards and screens in one go, golden questions one by one. */
import { useState } from "react";
import { useAdminCall } from "./useAdminCall";

type Result = { status: string; detail: Record<string, unknown> } | null;
type Case = { key: string; kind: string; workspace: string | null; q: string | null; result: Result };

export function TestPanel({ role, version, canRun, model, cases }: { role: string; version: string; canRun: boolean; model: boolean; cases: Case[] }) {
  const { busy, error, call } = useAdminCall();
  const [progress, setProgress] = useState("");
  async function runAll() {
    await call("fast", { action: "test", role, version, kinds: ["guard", "screen"] });
    const qs = cases.filter((c) => c.kind === "question");
    for (const [i, c] of qs.entries()) {
      setProgress(`Golden question ${i + 1} of ${qs.length}`);
      await call("q", { action: "test", role, version, keys: [c.key] });
    }
    setProgress("");
  }
  const counts = (k: string) => cases.filter((c) => c.result?.status === k).length;
  const groups = [["guard", "Guards"], ["screen", "Screens"], ["question", "Golden questions"]] as const;
  return (
    <div className="cmsblock">
      <header>
        <h2>Tests</h2>
        <span className="pill">{counts("pass")} pass · {counts("fail") + counts("error")} fail · {counts("skip")} skipped · {cases.filter((c) => !c.result).length} not run since the last edit</span>
        {canRun && <button className="btn sm pri" onClick={runAll} disabled={!!busy}>{busy ? progress || "Running…" : "Run all tests"}</button>}
      </header>
      {!model && <p className="hint">The model is not configured here, so golden questions are skipped, not failed. They run where ANTHROPIC_API_KEY is set.</p>}
      {groups.map(([k, label]) => (
        <div key={k} className="tablewrap people tests">
          <table>
            <thead><tr><th>{label}</th><th>Where</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>
              {cases.filter((c) => c.kind === k).map((c) => (
                <tr key={c.key}>
                  <td className="wrapcell"><b>{c.q ?? c.key}</b>{c.q && <small>{c.key}</small>}</td>
                  <td className="muted">{c.workspace ?? "the spec"}</td>
                  <td>{c.result ? <span className={`st ${c.result.status === "pass" ? "released" : c.result.status === "skip" ? "" : "rolled_back"}`}>{c.result.status}</span> : <span className="muted">not run</span>}</td>
                  <td className="wrapcell muted">{c.result ? summarize(c.result.detail) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {error && <div className="errbox">{error}</div>}
    </div>
  );
}

function summarize(d: Record<string, unknown>): string {
  if (Array.isArray(d.problems) && d.problems.length) return (d.problems as string[]).join("; ");
  if (typeof d.note === "string") return d.note;
  if (typeof d.error === "string") return d.error;
  if (Array.isArray(d.used)) return `used ${(d.used as string[]).join(", ") || "nothing"}`;
  return Object.entries(d).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v)}`).join(" · ").slice(0, 200);
}
