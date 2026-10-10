"use client";
/**
 * A workspace's cases in the CMS (DECISIONS, 10 Oct 2026, step 5): an ad hoc watch inside the panel, such as a crisis,
 * with its own access list. Only the cases this person is on show here; saving keeps them on the list.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export type CaseView = {
  id: string; name: string; about: string | null; starts_on: string; ends_on: string | null; terms: string[]; platforms: string[] | null;
  pace: "daily" | "hourly"; scraper_request: string | null; access: string[]; status: "open" | "closed"; posts: number; case_only: number;
};

const PLATFORMS = [["tiktok", "TikTok"], ["instagram", "Instagram"], ["threads", "Threads"], ["x", "X"], ["youtube", "YouTube"]] as const;
const blank = (me: string): Omit<CaseView, "id" | "status" | "posts" | "case_only"> => ({ name: "", about: "", starts_on: new Date().toISOString().slice(0, 10), ends_on: null, terms: [], platforms: null, pace: "daily", scraper_request: "", access: [me] });
const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

export function CasesEditor({ ws, me, cases, canManage }: { ws: string; me: string; cases: CaseView[]; canManage: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<(Omit<CaseView, "id" | "status" | "posts" | "case_only"> & { id?: string }) | null>(null);
  const [terms, setTerms] = useState("");
  const [access, setAccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = (c: CaseView | null) => {
    const v = c ? { ...c } : blank(me);
    setEdit(v); setTerms(v.terms.join("\n")); setAccess(v.access.join("\n")); setError("");
  };
  async function post(body: Record<string, unknown>) {
    setBusy(true); setError("");
    const r = await fetch("/api/admin/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: ws, ...body }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error ?? `Failed (${r.status})`); return false; }
    router.refresh();
    return true;
  }
  async function save() {
    if (!edit) return;
    if (await post({ action: "save", case: { ...edit, terms: lines(terms), access: lines(access) } })) setEdit(null);
  }
  return (
    <div className="onb">
      <p className="muted">A case is an ad hoc watch inside this panel, such as a crisis or a one-off check. Its posts are stored with the panel&apos;s and counted apart: a post only the case brought in counts in the case and never in the panel&apos;s everyday numbers, creators or tiers. Only the people on its list see it, Fair staff included.</p>
      {cases.length ? (
        <div className="tablewrap people"><table>
          <thead><tr><th>Case</th><th>Dates</th><th>Read</th><th className="num">Posts caught</th><th className="num">Only the case&apos;s</th><th>Who sees it</th><th /></tr></thead>
          <tbody>{cases.map((c) => (
            <tr key={c.id} className={c.status === "closed" ? "muted" : ""}>
              <td><b>{c.name}</b>{c.status === "closed" && <small> · closed</small>}<br /><small className="muted">{c.id}</small></td>
              <td>{c.starts_on} – {c.ends_on ?? "open"}</td>
              <td>{c.pace}{c.platforms?.length ? <small className="muted"> · {c.platforms.join(", ")}</small> : null}</td>
              <td className="num">{c.posts.toLocaleString("en-US")}</td>
              <td className="num">{c.case_only.toLocaleString("en-US")}</td>
              <td><small>{c.access.join(", ")}</small></td>
              <td>{canManage && (
                <span className="row">
                  <button className="btn sm" disabled={busy} onClick={() => open(c)}>Edit</button>
                  <button className="btn sm ghost" disabled={busy} onClick={() => post({ action: c.status === "closed" ? "reopen" : "close", id: c.id })}>{c.status === "closed" ? "Open again" : "Close"}</button>
                </span>
              )}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="muted">No case you are on. Cases you are not on stay hidden from you.</p>}
      {canManage && !edit && <div className="wactions"><button className="btn pri sm" onClick={() => open(null)}>New case</button></div>}
      {edit && (
        <section className="dcard">
          <h3>{edit.id ? `Edit ${edit.name}` : "New case"}</h3>
          <div className="grid2">
            <label className="wf"><span>Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Boycott, October 2026" /></label>
            <label className="wf"><span>Scraper request behind it</span><input value={edit.scraper_request ?? ""} onChange={(e) => setEdit({ ...edit, scraper_request: e.target.value })} placeholder="The request's name or link" /></label>
            <label className="wf"><span>Starts</span><input type="date" value={edit.starts_on} onChange={(e) => setEdit({ ...edit, starts_on: e.target.value })} /></label>
            <label className="wf"><span>Ends (empty while it runs on)</span><input type="date" value={edit.ends_on ?? ""} onChange={(e) => setEdit({ ...edit, ends_on: e.target.value || null })} /></label>
          </div>
          <label className="wf"><span>What it is about</span><textarea rows={2} value={edit.about ?? ""} onChange={(e) => setEdit({ ...edit, about: e.target.value })} placeholder="What happened and what the case watches, in a sentence or two" /></label>
          <div className="grid2">
            <label className="wf"><span>Terms beyond the panel&apos;s own (one per line)</span><textarea rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder={"boikot\nsupport local"} /></label>
            <label className="wf"><span>Who sees it (one email per line; you stay on it)</span><textarea rows={4} value={access} onChange={(e) => setAccess(e.target.value)} /></label>
          </div>
          <div className="ticks">
            {PLATFORMS.map(([k, label]) => <label key={k} className="tick"><input type="checkbox" checked={!!edit.platforms?.includes(k)} onChange={() => { const now = edit.platforms ?? []; const next = now.includes(k) ? now.filter((p) => p !== k) : [...now, k]; setEdit({ ...edit, platforms: next.length ? next : null }); }} /> {label}</label>)}
            <span className="muted">No platform ticked: the panel&apos;s.</span>
          </div>
          <div className="ticks">
            <label className="tick"><input type="radio" name="pace" checked={edit.pace === "daily"} onChange={() => setEdit({ ...edit, pace: "daily" })} /> Read daily</label>
            <label className="tick"><input type="radio" name="pace" checked={edit.pace === "hourly"} onChange={() => setEdit({ ...edit, pace: "hourly" })} /> Read hourly (a crisis; hourly fetching costs more)</label>
          </div>
          {error && <div className="errbox">{error}</div>}
          <div className="wactions">
            <button className="btn ghost sm" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn pri sm" disabled={busy || !edit.name.trim()} onClick={save}>{busy ? "Saving…" : edit.id ? "Save the case" : "Set up the case"}</button>
          </div>
        </section>
      )}
      {!edit && error && <div className="errbox">{error}</div>}
    </div>
  );
}
