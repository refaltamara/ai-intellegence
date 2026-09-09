"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/", label: "Today", icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></> },
  { href: "/decisions", label: "Decisions", icon: <path d="M4 6h16M4 12h10M4 18h7" /> },
  { href: "/agents", label: "Watching", icon: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></> },
  { href: "/reports", label: "Reports", icon: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></> },
  { href: "/data", label: "Data", icon: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></> },
];

export function Sidebar({ decisions, user, client }: { decisions: { id: string; name: string }[]; user: { email: string; role: string }; client: string | null }) {
  const path = usePathname();
  const router = useRouter();
  const initials = user.email.slice(0, 2).toUpperCase();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  const active = (href: string) => (href === "/" ? path === "/" : href === "/decisions" ? path.startsWith("/decisions") || path.startsWith("/d/") : path.startsWith(href));
  return (
    <aside className="side">
      <div className="brand"><div className="mark">C</div><div><b>CeMO</b><small>Your CMO</small></div></div>
      <nav className="nav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{n.icon}</svg>
            {n.label}
          </Link>
        ))}
      </nav>
      <div>
        <h6>Open decisions</h6>
        <div className="recent">
          {decisions.length === 0 && <span style={{ padding: "7px 10px", fontSize: 12, color: "var(--text-3)" }}>Nothing open yet</span>}
          {decisions.map((d) => (
            <Link key={d.id} href={`/d/${d.id}`} title={d.name} className={path === `/d/${d.id}` ? "on" : ""}>{d.name}</Link>
          ))}
        </div>
      </div>
      <div className="bottom">
        <div className="ws"><div><span>Beauty · Indonesia</span><b>{client ? `On the side of ${client}` : "No client brand yet"}</b></div></div>
        <div className="user" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><div className="avatar">{initials}</div><div style={{ minWidth: 0 }}><b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{user.email}</b><span>{user.role}</span></div></div>
          <button className="btn sm ghost" onClick={logout} title="Sign out">Out</button>
        </div>
      </div>
    </aside>
  );
}
