"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/", label: "Ask", icon: <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" /> },
  { href: "/skills", label: "Skills", icon: <path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4z" /> },
  { href: "/agents", label: "Agents", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { href: "/reports", label: "Reports", icon: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></> },
  { href: "/data", label: "Data", icon: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></> },
];

export function Sidebar({ recent, user }: { recent: { id: string; title: string }[]; user: { email: string; role: string } }) {
  const path = usePathname();
  const router = useRouter();
  const initials = user.email.slice(0, 2).toUpperCase();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <aside className="side">
      <div className="brand"><div className="mark">F</div><div><b>Fair Intel</b><small>proof of concept</small></div></div>
      <nav className="nav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{n.icon}</svg>
            {n.label}
          </Link>
        ))}
      </nav>
      <div>
        <h6>Recent</h6>
        <div className="recent">
          {recent.length === 0 && <span style={{ padding: "7px 10px", fontSize: 12, color: "var(--text-3)" }}>No conversations yet</span>}
          {recent.map((c) => (
            <Link key={c.id} href={`/?c=${c.id}`} title={c.title}>{c.title}</Link>
          ))}
        </div>
      </div>
      <div className="bottom">
        <div className="ws"><div><span>Category workspace</span><b>Beauty · Indonesia</b></div></div>
        <div className="user" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><div className="avatar">{initials}</div><div style={{ minWidth: 0 }}><b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{user.email}</b><span>{user.role}</span></div></div>
          <button className="btn sm ghost" onClick={logout} title="Sign out">Out</button>
        </div>
      </div>
    </aside>
  );
}
