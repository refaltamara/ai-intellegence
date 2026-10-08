"use client";
import { useEffect, useState } from "react";
import type { TeamChoice } from "@/workspace/teams";
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
  return (
    <div className="login persona">
      <div className="box wide">
        <p className="hello">Signed in as {email}</p>
        <h1>What do you do?</h1>
        <p className="sub">Pick the team you are working as. You can switch any time from the top of the sidebar.</p>
        <div className="teams">
          {teams.map((t) => (
            <button key={t.key} className="team" data-tone={t.tone} onClick={() => choose(t)} disabled={!!busy}>
              <span className="ic"><TeamIcon kind={t.role} /></span>
              <b>{t.label}</b>
              <span className="cn">{t.codename} {t.version}</span>
              <span className="d">{t.description}</span>
              <span className="w">{t.name}</span>
              <span className="go">{busy === t.key ? "Opening…" : "Continue →"}</span>
            </button>
          ))}
        </div>
        {error && <div className="errbox">{error}</div>}
      </div>
    </div>
  );
}
