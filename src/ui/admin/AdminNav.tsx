"use client";
/** The CMS's own sidebar: Fair's side of the product, never shown to clients. */
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Home", icon: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></> },
  { href: "/admin/roles", label: "Roles", icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></> },
  { href: "/admin/workspaces", label: "Workspaces", icon: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></> },
  { href: "/admin/people", label: "People", icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.8 2.6 3 5.2" /></> },
  { href: "/admin/audit", label: "Audit", icon: <><path d="M9 4h6l1 2h3v15H5V6h3z" /><path d="M9 12h6M9 16h4" /></> },
];

export function AdminNav({ email, duties }: { email: string; duties: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <aside className="side admin">
      <div className="brand"><div className="mark">F</div><div><b>Fair CMS</b><small>The brain behind Fair Intelligence</small></div></div>
      <nav className="nav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""}>
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{n.icon}</svg></span>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="bottom">
        <Link href="/" className="connect">← Back to the product</Link>
        <div className="user"><div style={{ minWidth: 0 }}><b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</b><span>{duties}</span></div></div>
      </div>
    </aside>
  );
}
