"use client";
import { useEffect, useState } from "react";
import type { TeamChoice } from "@/workspace/teams";
import { ROLES, ROLE_ORDER } from "@/roles/model";
import { LogoMark } from "./LogoMark";
import { FormError } from "./AuthShell";
import { Spinner } from "./kit/Spinner";
import { IconChevronRight } from "./kit/icons";
import { RoleIcon } from "./RoleIcon";
import { cn } from "./cn";

const CARD = "flex h-full flex-col gap-4 rounded-3xl border border-card-border bg-white p-6 text-left";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600";

export function TeamPicker({ teams, email, next }: { teams: TeamChoice[]; email: string; next: string | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    // Back can bring this page out of the browser's cache with every button still waiting: free them
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);
  async function choose(t: TeamChoice) {
    setBusy(t.key);
    setError("");
    try {
      const r = await fetch("/api/workspace/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: t.workspace_id, role: t.role }) });
      if (!r.ok) {
        setBusy(null);
        setError((await r.json().catch(() => ({}))).error ?? "Could not switch");
        return;
      }
    } catch {
      setBusy(null);
      setError("Could not switch: check the connection and try again.");
      return;
    }
    // one full load, not push + refresh (which drew the page twice); next is a same-site path (safeNext)
    window.location.assign(next ?? t.home);
  }
  // one card per role, the same three for everyone (Refal, 16 Oct 2026): the workspaces it works on, or not available
  return (
    <div className="min-h-dvh w-full bg-gray-50 px-4 py-10 md:px-8 md:py-16">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-10 flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="truncate text-sm text-gray-500">Signed in as {email}</span>
        </div>
        <h1 className="text-3xl font-semibold text-gray-900">What do you do?</h1>
        <p className="text-base text-gray-500">Pick the team you are working as. You can switch any time from the top of the sidebar.</p>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {ROLE_ORDER.map((id) => {
            const mine = teams.filter((t) => t.role === id);
            const r = mine[0] ?? null;
            const model = ROLES[id];
            const head = (
              <>
                <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", r ? "bg-brand-palette-100 text-brand-palette-700" : "bg-gray-100 text-gray-500")}><RoleIcon role={id} size={24} /></span>
                <div>
                  <h2 className={cn("text-lg font-semibold", r ? "text-gray-900" : "text-gray-600")}>{model.label}</h2>
                  <p className="text-xs text-gray-500">{r ? `${r.codename} ${r.version}` : model.codename}</p>
                </div>
                <p className="text-sm text-gray-600">{r?.description ?? model.description}</p>
              </>
            );
            if (mine.length === 0) {
              return (
                <div key={id} className={cn(CARD, "bg-gray-50")}>
                  {head}
                  <p className="mt-auto text-sm text-gray-500">Not available on your workspaces yet</p>
                </div>
              );
            }
            if (mine.length === 1) {
              const t = mine[0];
              return (
                <button key={id} type="button" onClick={() => choose(t)} disabled={!!busy} className={cn(CARD, FOCUS, "group cursor-pointer transition-all duration-100 hover:border-brand-palette-300 hover:shadow-md active:scale-[0.99] disabled:cursor-wait")}>
                  {head}
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-card-border pt-4">
                    <span className="truncate text-sm font-semibold text-gray-900">{t.name}</span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-palette-700">
                      {busy === t.key ? <><Spinner className="text-current" />Opening…</> : <>Continue<IconChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" /></>}
                    </span>
                  </div>
                </button>
              );
            }
            return (
              <div key={id} className={CARD}>
                {head}
                <div className="mt-auto flex flex-col gap-2 border-t border-card-border pt-4">
                  {mine.map((t) => (
                    <button key={t.key} type="button" onClick={() => choose(t)} disabled={!!busy} className={cn(FOCUS, "flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-2.5 text-left text-sm font-semibold text-gray-900 transition-colors hover:border-brand-palette-300 hover:bg-brand-palette-50 disabled:cursor-wait")}>
                      <span className="truncate">{t.name}</span>
                      {busy === t.key ? <span className="flex items-center gap-1 text-brand-palette-700"><Spinner className="text-current" />Opening…</span> : <IconChevronRight size={16} className="shrink-0 text-brand-palette-700" />}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {error && <div className="mt-6"><FormError>{error}</FormError></div>}
      </div>
    </div>
  );
}
