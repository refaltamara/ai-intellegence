"use client";
/**
 * "Templates" on the Dashboard (Refal, 16 Oct 2026): Fair's default for the team's role, then every Dashboard the
 * workspace's Builders saved (src/dashboard/library.ts). Anyone may look; a Builder uses one for the whole team or
 * saves the Dashboard as it is now. A template holds the layout and the panels, never data.
 */
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useState } from "react";
import type { DashTemplate } from "@/dashboard/library";

export function DashTemplates({ builder, codename }: { builder: boolean; codename: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<DashTemplate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  async function load() {
    setOpen(true); setMsg("");
    const r = await fetch("/api/dashboard/templates");
    const j = (await r.json().catch(() => ({}))) as { templates?: DashTemplate[]; error?: string };
    if (!r.ok) setMsg(j.error ?? "Could not load the templates.");
    setList(j.templates ?? []);
  }
  async function post(body: Record<string, unknown>, what: string) {
    setBusy(what); setMsg("");
    const r = await fetch("/api/dashboard/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!r.ok) { setMsg(j.error ?? "That did not work."); return false; }
    return true;
  }
  async function use(t: DashTemplate) {
    if (!confirm(`Use "${t.name}" as the Dashboard for everyone on the team? Panels it does not carry are hidden, not deleted.`)) return;
    if (await post({ action: "use", id: t.id }, t.id)) { setOpen(false); router.refresh(); }
  }
  async function save() {
    if (!name.trim()) return;
    if (await post({ action: "save", name }, "save")) { setName(""); await load(); }
  }
  if (!open) return <button className="btn sm ghost" onClick={load} title="Dashboards your team saved, and Fair's default">Templates</button>;
  return createPortal(
    <div className="drawer" role="dialog" aria-label="Dashboard templates">
      <div className="drawer-in">
        <header><h3>Dashboard templates</h3><button className="x" onClick={() => setOpen(false)} aria-label="Close">×</button></header>
        <p className="muted">Every Dashboard a Builder saves here can be used by your other teams. A template carries the layout and the panels, never data: the brands, period and platform come from your own filters.</p>
        {msg && <div className="errbox">{msg}</div>}
        {!list ? <p className="muted">Loading…</p> : (
          <ul className="dtpl">
            {list.map((t) => (
              <li key={t.id}>
                <div>
                  <b>{t.name}</b> {t.source === "fair" ? <i className="badge fair">Fair</i> : <i className="badge client">{t.by ?? "Your team"}</i>}
                  <small className="muted">{t.description || `${t.panels} panel${t.panels === 1 ? "" : "s"}`}{t.source === "team" && t.description ? ` · ${t.panels} panel${t.panels === 1 ? "" : "s"}` : ""}</small>
                </div>
                {builder && <button className="btn sm" disabled={!!busy} onClick={() => use(t)}>{busy === t.id ? "Using…" : "Use"}</button>}
              </li>
            ))}
          </ul>
        )}
        {builder ? (
          <footer className="dtsave">
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder={`Name this ${codename} Dashboard`} aria-label="Template name" />
            <button className="btn pri sm" disabled={!name.trim() || !!busy} onClick={save}>{busy === "save" ? "Saving…" : "Save as a template"}</button>
          </footer>
        ) : (
          <p className="muted">A Builder on your team uses or saves templates; the Dashboard is the same for everyone.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
