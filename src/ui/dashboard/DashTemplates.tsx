"use client";
/**
 * "Templates" on the Dashboard (Refal, 16 Oct 2026): Fair's default for the team's role, then every Dashboard the
 * workspace's Builders saved (src/dashboard/library.ts). Anyone may look; a Builder uses one for the whole team or
 * saves the Dashboard as it is now. A template holds the layout and the panels, never data.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DashTemplate } from "@/dashboard/library";
import { Button } from "../kit/Button";
import { Drawer } from "../kit/Drawer";
import { TextField } from "../kit/Form";
import { ConfirmDialog } from "../kit/Modal";
import { ErrorBox } from "../kit/Section";
import { Skel } from "../kit/Skeleton";
import { MadeBy } from "../decks/formParts";

export function DashTemplates({ builder, codename }: { builder: boolean; codename: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<DashTemplate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [asking, setAsking] = useState<DashTemplate | null>(null);
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
    const ok = await post({ action: "use", id: t.id }, t.id);
    setAsking(null);
    if (ok) { setOpen(false); router.refresh(); }
  }
  async function save() {
    if (!name.trim()) return;
    if (await post({ action: "save", name }, "save")) { setName(""); await load(); }
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={load} title="Dashboards your team saved, and Fair's default">Templates</Button>
      <Drawer open={open} title="Dashboard templates" onClose={() => setOpen(false)} footer={builder ? (
        <form className="flex w-full flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <TextField value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder={`Name this ${codename} Dashboard`} aria-label="Template name" className="sm:flex-1" />
          <Button type="submit" size="sm" disabled={!name.trim() || !!busy} isLoading={busy === "save"} loadingLabel="Saving…">Save as a template</Button>
        </form>
      ) : undefined}>
        <p className="text-sm leading-relaxed text-gray-600">Every Dashboard a Builder saves here can be used by your other teams. A template carries the layout and the panels, never data: the brands, period and platform come from your own filters.</p>
        {msg && <ErrorBox>{msg}</ErrorBox>}
        {!list ? (
          <div role="status" className="flex flex-col gap-2"><span className="sr-only">Loading the templates…</span>{[0, 1, 2].map((i) => <span key={i} className="flex flex-col gap-2 rounded-2xl border border-card-border p-3"><Skel className="h-4 w-40" /><Skel className="h-3 w-56" /></span>)}</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-card-border bg-white p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2"><b className="text-sm font-semibold text-gray-900">{t.name}</b><MadeBy badge={t.source === "fair" ? "Fair" : t.by ?? "Your team"} /></span>
                  <small className="text-xs text-gray-500">{t.description || `${t.panels} panel${t.panels === 1 ? "" : "s"}`}{t.source === "team" && t.description ? ` · ${t.panels} panel${t.panels === 1 ? "" : "s"}` : ""}</small>
                </div>
                {builder && <Button size="sm" variant="outline" disabled={!!busy} isLoading={busy === t.id} loadingLabel="Using…" onClick={() => setAsking(t)}>Use</Button>}
              </li>
            ))}
          </ul>
        )}
        {!builder && <p className="text-sm text-gray-500">A Builder on your team uses or saves templates; the Dashboard is the same for everyone.</p>}
      </Drawer>
      <ConfirmDialog open={!!asking} title={asking ? `Use "${asking.name}"?` : ""} body="It becomes the Dashboard for everyone on the team. Panels it does not carry are hidden, not deleted."
        confirmLabel="Use this template" busy={!!asking && busy === asking.id} onConfirm={() => asking && use(asking)} onClose={() => setAsking(null)} />
    </>
  );
}
