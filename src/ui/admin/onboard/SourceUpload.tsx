"use client";
/** Upload the dump (one CSV per table) and inspect it. With Vercel Blob on, files go straight to Blob; otherwise to the onboarding folder. */
import { useRef, useState } from "react";
import { useOnboard } from "./useOnboard";

const TABLE = /^(.*)_\d{6,}\.csv$/i;

export function SourceUpload({ ws, blob, needed }: { ws: string; blob: boolean; needed: string[] }) {
  const { busy, error, setError, call, runJob } = useOnboard(ws);
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [running, setRunning] = useState(false);
  async function pick(list: FileList) {
    const files = [...list].filter((f) => { const m = TABLE.exec(f.name.toLowerCase()); return m && needed.includes(m[1]); });
    if (!files.length) { setError("None of these is one of the dump's tables the loader reads."); return; }
    setMsg(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);
    if (blob) {
      const { upload } = await import("@vercel/blob/client");
      for (const f of files) {
        setMsg(`Uploading ${f.name}…`);
        const r = await upload(`onboard/${ws}/${f.name}`, f, { access: "private", handleUploadUrl: "/api/admin/onboard/blob", multipart: f.size > 50 * 1024 ** 2 });
        await call("register", { table: TABLE.exec(f.name.toLowerCase())![1], name: f.name, url: r.url, size: f.size }, { refresh: false });
      }
    } else {
      // one file per request: a dump's files run to tens of megabytes each
      for (const f of files) {
        setMsg(`Uploading ${f.name}…`);
        const fd = new FormData();
        fd.set("workspace_id", ws);
        fd.append("files", f);
        const r = await fetch("/api/admin/onboard/upload", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setError(j.error ?? `Upload of ${f.name} failed.`); setMsg(""); return; }
      }
    }
    setMsg("Uploaded. Inspecting…");
    await inspect();
  }
  async function inspect() {
    const j = await call("inspect", {}, { refresh: false });
    if (!j?.job_id) { setMsg(""); return; }
    setRunning(true);
    await runJob(String(j.job_id), (p) => setMsg(p.error ? p.error : p.status === "done" ? "Inspected." : "Inspecting…"));
    setRunning(false);
  }
  return (
    <div className="upl">
      <input ref={ref} type="file" multiple accept=".csv,text/csv" hidden onChange={(e) => { if (e.target.files?.length) void pick(e.target.files); e.target.value = ""; }} />
      <button className="btn pri sm" disabled={!!busy || running} onClick={() => ref.current?.click()}>Upload the dump&apos;s CSVs</button>
      <button className="btn sm ghost" disabled={!!busy || running} onClick={inspect}>Inspect again</button>
      {msg && <span className="muted">{msg}</span>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}
