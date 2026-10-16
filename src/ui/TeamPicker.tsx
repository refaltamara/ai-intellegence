"use client";
import { useEffect, useState } from "react";
import type { TeamChoice } from "@/workspace/teams";
import { ROLES, ROLE_ORDER } from "@/roles/model";
import { TeamIcon } from "./TeamIcon";

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
    <div className="login persona">
      <div className="box wide">
        <p className="hello">Signed in as {email}</p>
        <h1>What do you do?</h1>
        <p className="sub">Pick the team you are working as. You can switch any time from the top of the sidebar.</p>
        <div className="teams">
          {ROLE_ORDER.map((id) => {
            const mine = teams.filter((t) => t.role === id);
            const r = mine[0] ?? null;
            const model = ROLES[id];
            if (mine.length <= 1) {
              const t = mine[0];
              return (
                <button key={id} className={t ? "team" : "team na"} data-tone={model.tone} onClick={() => t && choose(t)} disabled={!t || !!busy}>
                  <span className="ic"><TeamIcon kind={id} /></span>
                  <b>{model.label}</b>
                  <span className="cn">{r ? `${r.codename} ${r.version}` : model.codename}</span>
                  <span className="d">{r?.description ?? model.description}</span>
                  <span className="w">{t ? t.name : "Not available on your workspaces yet"}</span>
                  {t && <span className="go">{busy === t.key ? "Opening…" : "Continue →"}</span>}
                </button>
              );
            }
            return (
              <div key={id} className="team multi" data-tone={model.tone}>
                <span className="ic"><TeamIcon kind={id} /></span>
                <b>{model.label}</b>
                <span className="cn">{r!.codename} {r!.version}</span>
                <span className="d">{r!.description}</span>
                <div className="wsl">
                  {mine.map((t) => (
                    <button key={t.key} onClick={() => choose(t)} disabled={!!busy}>{busy === t.key ? "Opening…" : `${t.name} →`}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {error && <div className="errbox">{error}</div>}
      </div>
    </div>
  );
}
