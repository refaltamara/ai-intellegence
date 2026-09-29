"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { TeamChoice } from "@/workspace/teams";
import { TeamIcon } from "./TeamIcon";

type NavItem = { href: string; label: string; tone: string; icon: React.ReactNode; kinds?: string[] };

const NAV: NavItem[] = [
  { href: "/pulse", label: "Pulse", tone: "coral", icon: <path d="M3 12h4l3-8 4 16 3-8h4" />, kinds: ["profile"] },
  { href: "/", label: "Chats", tone: "blue", icon: <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" /> },
  { href: "/decisions", label: "Decisions", tone: "violet", icon: <path d="M4 6h16M4 12h10M4 18h7" /> },
  { href: "/skills", label: "Skills", tone: "sun", icon: <path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4z" /> },
  { href: "/agents", label: "Watching", tone: "mint", icon: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></> },
  { href: "/reports", label: "Reports", tone: "blue", icon: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></> },
  { href: "/data", label: "Data", tone: "violet", icon: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></> },
];

type Product = { name: string; tagline: string; label: string; kind: string };

export function Sidebar({ recent, user, client, product, teams, currentWorkspace }: { recent: { id: string; title: string; href: string }[]; user: { email: string; role: string }; client: string | null; product: Product; teams: TeamChoice[]; currentWorkspace: string }) {
  const path = usePathname();
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const initials = user.email.slice(0, 2).toUpperCase();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  async function switchTo(t: TeamChoice) {
    if (t.workspace_id === currentWorkspace) return;
    setSwitching(t.workspace_id);
    const r = await fetch("/api/workspace/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: t.workspace_id }) });
    setSwitching(null);
    if (!r.ok) return;
    router.push(t.home);
    router.refresh();
  }
  const active = (href: string) => (href === "/" ? path === "/" : href === "/decisions" ? path.startsWith("/decisions") || path.startsWith("/d/") : path.startsWith(href));
  const team = teams.find((t) => t.workspace_id === currentWorkspace);
  return (
    <aside className="side">
      <div className="brand"><div className="mark">{product.name.charAt(0)}</div><div><b>{product.name}</b><small>{team?.label ?? product.tagline}</small></div></div>
      {teams.length > 1 && (
        <div className="teamswitch" role="tablist" aria-label="Team">
          {teams.map((t) => (
            <button key={t.workspace_id} role="tab" aria-selected={t.workspace_id === currentWorkspace} className={t.workspace_id === currentWorkspace ? "on" : ""} data-tone={t.tone} onClick={() => switchTo(t)} disabled={!!switching} title={`${t.label}: ${t.name}`}>
              <TeamIcon kind={t.kind} size={14} />
              {switching === t.workspace_id ? "…" : t.short}
            </button>
          ))}
        </div>
      )}
      <nav className="nav">
        {NAV.filter((n) => !n.kinds || n.kinds.includes(product.kind)).map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""} data-tone={n.tone}>
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{n.icon}</svg></span>
            {n.label}
          </Link>
        ))}
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
        <div className="ws">
          <span>{product.label}</span>
          <b>{client ? (product.kind === "profile" ? `About ${client}` : `On the side of ${client}`) : product.kind === "profile" ? "No subject set yet" : "No client brand yet"}</b>
        </div>
        <Link href="/connect" className={`connect ${path.startsWith("/connect") ? "on" : ""}`}>
          <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0z" /><path d="M12 16v5" /></svg></span>
          Connect Claude / ChatGPT
        </Link>
        <div className="user" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><div className="avatar">{initials}</div><div style={{ minWidth: 0 }}><b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{user.email}</b><span>{user.role}</span></div></div>
          <button className="btn sm ghost" onClick={logout} title="Sign out">Out</button>
        </div>
      </div>
    </aside>
  );
}
