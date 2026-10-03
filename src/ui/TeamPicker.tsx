"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TeamChoice } from "@/workspace/teams";
import { TeamIcon } from "./TeamIcon";

export function TeamPicker({ teams, email, next }: { teams: TeamChoice[]; email: string; next: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function choose(t: TeamChoice) {
    setBusy(t.key);
    setError("");
    const r = await fetch("/api/workspace/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: t.workspace_id, role: t.role }) });
    if (!r.ok) {
      setBusy(null);
      setError((await r.json().catch(() => ({}))).error ?? "Could not switch");
      return;
    }
    router.push(next ?? t.home);
    router.refresh();
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
