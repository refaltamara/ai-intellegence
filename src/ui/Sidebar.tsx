"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavKey } from "@/roles/model";
import type { TeamChoice } from "@/workspace/teams";
import { TeamIcon } from "./TeamIcon";
import { LogoMark } from "./LogoMark";

type NavItem = { key: NavKey; href: string; label: string; tone: string; icon: React.ReactNode };

/**
 * The same places for every role: the fixed numbers (Dashboard), the decks the team
 * builds (Decks), the conversation (Chats); the role model decides which appear
 * (src/roles/model.ts). What CeMO can do lives behind "/" in the composer; the data
 * inventory sits under the account. At the top: the workspace (the data) and, when
 * it offers more than one, the role (how you work on it).
 */
const NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", tone: "coral", icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></> },
  { key: "weekly", href: "/weekly", label: "Weekly Reports", tone: "sun", icon: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /><path d="M7 13l3-3 3 2 4-4" /></> },
  // Decks took in Pulse and Reports (DECISIONS, 2 Oct 2026); a one-person PR workspace keeps both
  { key: "decks", href: "/decks", label: "Decks", tone: "violet", icon: <><rect x="3" y="5" width="14" height="10" rx="1.5" /><path d="M7 19h12a2 2 0 0 0 2-2V9" /></> },
  { key: "pulse", href: "/pulse", label: "Pulse", tone: "violet", icon: <path d="M3 12h4l3-8 4 16 3-8h4" /> },
  { key: "chats", href: "/", label: "Chats", tone: "blue", icon: <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" /> },
  { key: "reports", href: "/reports", label: "Reports", tone: "mint", icon: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></> },
];

type Product = { name: string; tagline: string; label: string; kind: string };

export function Sidebar({ recent, user, product, teams, currentWorkspace, currentRole }: { recent: { id: string; title: string; href: string }[]; user: { email: string; role: string; team?: boolean; cms?: boolean; company?: { label: string; waiting: number } }; product: Product; teams: TeamChoice[]; currentWorkspace: string; currentRole: string }) {
  const path = usePathname();
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState("");
  const left = useRef(false);
  useEffect(() => {
    // Back can bring this page out of the browser's cache mid-switch, controls disabled and the
    // team cookie already moved on: load it again so it shows the team the next click acts on
    const back = (e: PageTransitionEvent) => {
      if (e.persisted && left.current) window.location.reload();
    };
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);
  const initials = user.email.slice(0, 2).toUpperCase();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  async function switchTo(t: TeamChoice) {
    if (t.key === team?.key) return;
    setSwitching(t.key);
    setSwitchError("");
    const failed = (why: string) => {
      setSwitching(null);
      setSwitchError(why);
    };
    try {
      const r = await fetch("/api/workspace/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: t.workspace_id, role: t.role }) });
      if (!r.ok) return failed(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Could not switch team.");
    } catch {
      return failed("Could not switch team: check the connection and try again.");
    }
    // one full load: push + refresh drew the new team's page twice (the second time with the sidebar);
    // the switching mark stays until the new team's page replaces this one
    left.current = true;
    window.location.assign(t.home);
  }
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const team = teams.find((t) => t.workspace_id === currentWorkspace && t.role === currentRole) ?? teams.find((t) => t.workspace_id === currentWorkspace);
  const workspaces = teams.filter((t, i) => teams.findIndex((x) => x.workspace_id === t.workspace_id) === i);
  const roles = teams.filter((t) => t.workspace_id === currentWorkspace);
  const nav = team?.nav ?? ["dashboard", "chats"];
  // switching workspace keeps the role when the other workspace offers it
  const pickWorkspace = (id: string) => {
    const t = teams.find((x) => x.workspace_id === id && x.role === currentRole) ?? teams.find((x) => x.workspace_id === id);
    if (t) switchTo(t);
  };
  return (
    <aside className="side">
      <div className="brand"><LogoMark /><div><b>{product.name}</b><small>{team?.label ?? product.tagline}</small></div></div>
      {workspaces.length > 1 && (
        <label className="wspick" title="Workspace: the data you are working on">
          <span>Workspace</span>
          <select value={currentWorkspace} onChange={(e) => pickWorkspace(e.target.value)} disabled={!!switching}>
            {workspaces.map((w) => <option key={w.workspace_id} value={w.workspace_id}>{w.name}</option>)}
          </select>
        </label>
      )}
      {roles.length > 1 && (
        <div className="teamswitch" role="tablist" aria-label="Team">
          {roles.map((t) => (
            <button key={t.key} role="tab" aria-selected={t.key === team?.key} className={t.key === team?.key ? "on" : ""} data-tone={t.tone} onClick={() => switchTo(t)} disabled={!!switching} title={`${t.label} · ${t.codename} ${t.version}: ${t.description}`}>
              <TeamIcon kind={t.role} size={14} />
              {switching === t.key ? "…" : t.short}
            </button>
          ))}
        </div>
      )}
      {switchError && <p className="switch-err" role="alert">{switchError}</p>}
      <nav className="nav">
        {NAV.filter((n) => nav.includes(n.key)).map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""} data-tone={n.tone}>
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{n.icon}</svg></span>
            {n.label}
          </Link>
        ))}
        {user.company && (
          <Link href="/company" className={`ours ${active("/company") ? "on" : ""}`} data-tone="violet" title="Your team's own version: what it changed, made and approved">
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" /></svg></span>
            {user.company.label}
            {user.company.waiting > 0 && <b className="count" title={`${user.company.waiting} waiting for your approval`}>{user.company.waiting}</b>}
          </Link>
        )}
      </nav>
      <div>
        <h6>Recent chats</h6>
        <div className="recent">
          {recent.length === 0 && <span style={{ padding: "7px 10px", fontSize: 12, color: "var(--text-3)" }}>No chats yet</span>}
          {recent.map((c) => (
            <Link key={c.id} href={c.href} title={c.title}>{c.title.replace(/^\/[\w-]+\s*/, "")}</Link>
          ))}
        </div>
      </div>
      <div className="bottom">
        <Link href="/connect" className={`connect ${path.startsWith("/connect") ? "on" : ""}`}>
          <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0z" /><path d="M12 16v5" /></svg></span>
          Connect Claude / ChatGPT
        </Link>
        <div className="user" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><div className="avatar">{initials}</div><div style={{ minWidth: 0 }}><b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{user.email}</b><span>{user.role}</span></div></div>
          <span className="useracts">
            {user.team && (
              <Link href="/team" className={`iconbtn ${path.startsWith("/team") ? "on" : ""}`} title="Team: who is in this workspace" aria-label="Team">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.8 2.6 3 5.2" /></svg>
              </Link>
            )}
            {user.cms && (
              <Link href="/admin" className="iconbtn" title="CMS: Fair's side of the product" aria-label="CMS">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></svg>
              </Link>
            )}
            <Link href="/data" className={`iconbtn ${path.startsWith("/data") ? "on" : ""}`} title="Data and settings" aria-label="Data and settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
            </Link>
            <button className="btn sm ghost" onClick={logout} title="Sign out">Out</button>
          </span>
        </div>
      </div>
    </aside>
  );
}
