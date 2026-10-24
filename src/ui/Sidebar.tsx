"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ROLES, ROLE_ORDER, type NavKey } from "@/roles/model";
import type { TeamChoice } from "@/workspace/teams";
import { RoleIcon } from "./RoleIcon";
import { LogoMark } from "./LogoMark";
import { AccountMenu } from "./AccountMenu";
import { useDrawer } from "./Shell";
import { cn } from "./cn";
import { SelectInput } from "./kit/SelectInput";
import { IconBriefcase, IconChart, IconChevronLeft, IconChevronRight, IconClose, IconDocument, IconFolderFavorite, IconMessages, IconPlug } from "./kit/icons";

type NavItem = { key: NavKey; href: string; label: string; icon: ReactNode };

/**
 * The same four places for every team (Refal, 16 Oct 2026): the numbers (Dashboard), the decks the team
 * builds (Decks), the conversation (Chats) and the watches inside the panel (Cases; each case shows only to
 * the people on its list). What CeMO can do lives behind "/" in the composer; the data inventory sits under
 * the account. At the top: the workspace (the data) and the role (how you work on it), all three roles
 * always, one the workspace does not offer shown as not available there.
 */
const NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: <IconChart /> },
  { key: "weekly", href: "/weekly", label: "Weekly Reports", icon: <IconDocument /> },
  // Decks took in Pulse and Reports (DECISIONS, 2 Oct 2026); a one-person PR workspace keeps both
  { key: "decks", href: "/decks", label: "Decks", icon: <IconDocument /> },
  { key: "pulse", href: "/pulse", label: "Pulse", icon: <IconChart /> },
  { key: "chats", href: "/", label: "Chats", icon: <IconMessages /> },
  { key: "reports", href: "/reports", label: "Reports", icon: <IconDocument /> },
  { key: "cases", href: "/cases", label: "Cases", icon: <IconBriefcase /> },
];

const COOKIE = "fi_sidebar";
const FOCUS = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-palette-600";

type Product = { name: string; tagline: string; label: string; kind: string };

export function Sidebar({ recent, user, product, teams, currentWorkspace, currentRole, collapsed: startCollapsed = false }: { recent: { id: string; title: string; href: string }[]; user: { email: string; role: string; team?: boolean; cms?: boolean; company?: { label: string; waiting: number }; cases?: number }; product: Product; teams: TeamChoice[]; currentWorkspace: string; currentRole: string; collapsed?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const { open, setOpen } = useDrawer();
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState("");
  const left = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Back can bring this page out of the browser's cache mid-switch, controls disabled and the
    // team cookie already moved on: load it again so it shows the team the next click acts on
    const back = (e: PageTransitionEvent) => {
      if (e.persisted && left.current) window.location.reload();
    };
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);
  // the phone drawer closes when you go somewhere, and on Escape
  useEffect(() => setOpen(false), [path, setOpen]);
  // closing by hand puts focus back on the button that opened it
  const dismiss = () => {
    setOpen(false);
    document.querySelector<HTMLButtonElement>("button[aria-controls=\"sidebar\"][aria-label=\"Open menu\"]")?.focus();
  };
  useEffect(() => {
    if (!open) return;
    // the drawer is still invisible on this frame; focus can only land once it is shown
    const f = requestAnimationFrame(() => closeRef.current?.focus());
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", esc);
    return () => { cancelAnimationFrame(f); document.removeEventListener("keydown", esc); };
  }, [open, setOpen]);
  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // a cookie, not localStorage: the layout reads it so the first paint already has the right width
    document.cookie = `${COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }
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
  const nav: NavKey[] = team?.nav ?? ["dashboard", "decks", "chats", "cases"];
  // switching workspace keeps the role when the other workspace offers it
  const pickWorkspace = (id: string) => {
    const t = teams.find((x) => x.workspace_id === id && x.role === currentRole) ?? teams.find((x) => x.workspace_id === id);
    if (t) switchTo(t);
  };
  // collapsed narrows the desktop sidebar only; the phone drawer always shows its words
  const label = collapsed ? "md:hidden" : "";
  const navLink = (on: boolean) => cn("group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm leading-5 transition-colors", FOCUS, collapsed && "md:justify-center", on ? "bg-brand-palette-50 font-semibold text-brand-palette-700" : "text-gray-600 hover:bg-brand-palette-50 hover:text-brand-palette-700");
  return (
    <>
      <div onClick={dismiss} aria-hidden="true" className={cn("fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 md:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} />
      <aside
        id="sidebar"
        aria-label="Main"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-64 shrink-0 flex-col border-r border-gray-200 bg-white shadow-xl duration-300 ease-in-out",
          // the transform makes the aside its own stacking context: z-30 keeps the narrow sidebar's tips above the page
          "md:relative md:z-30 md:translate-x-0 md:shadow-none",
          // shown at once on opening (so focus can move in), hidden only after sliding out (so Tab skips it when closed)
          open ? "translate-x-0 transition-[transform,width]" : "max-md:invisible -translate-x-full transition-[transform,width,visibility]",
          collapsed ? "md:w-18" : "md:w-64",
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center gap-2.5 px-5", collapsed && "md:justify-center md:px-0")}>
          <LogoMark size={30} />
          <div className={cn("min-w-0 flex-1", label)}>
            <p className="truncate text-base font-bold leading-tight text-gray-800">{product.name}</p>
            {(team?.label ?? product.tagline) && <p className="truncate text-xs text-gray-500">{team?.label ?? product.tagline}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={dismiss} aria-label="Close menu" className={cn("flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 md:hidden", FOCUS)}>
            <IconClose size={20} />
          </button>
        </div>

        <div className={cn("flex flex-col gap-2 px-3 pb-2", collapsed && "md:px-2")}>
          {workspaces.length > 1 && (
            <SelectInput
              label="Workspace"
              size="sm"
              withSearch
              searchPlaceholder="Find a workspace"
              options={workspaces.map((w) => ({ value: w.workspace_id, label: w.name }))}
              value={currentWorkspace}
              onChange={pickWorkspace}
              disabled={!!switching}
              className={label}
            />
          )}
          {/* the narrow sidebar keeps the workspace as its initials; the phone drawer always has the field above */}
          {workspaces.length > 1 && collapsed && (
            <div className="group relative hidden justify-center md:flex">
              <SelectInput
                variant="badge"
                label="Workspace"
                withSearch
                searchPlaceholder="Find a workspace"
                options={workspaces.map((w) => ({ value: w.workspace_id, label: w.name }))}
                value={currentWorkspace}
                onChange={pickWorkspace}
                disabled={!!switching}
              />
              <Tip show>Workspace: {team?.name ?? workspaces.find((w) => w.workspace_id === currentWorkspace)?.name}</Tip>
            </div>
          )}
          <div role="tablist" aria-label="Team" className={cn("flex gap-1 rounded-xl bg-gray-100 p-1", collapsed && "md:flex-col")}>
            {ROLE_ORDER.map((id) => {
              const t = roles.find((x) => x.role === id);
              // cells sized by their words, so "Brand & KOL" is never cut
              const cell = "flex min-h-11 flex-auto flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] leading-tight transition-colors";
              if (!t) {
                const r = ROLES[id];
                return (
                  <button key={id} type="button" role="tab" aria-selected={false} aria-disabled="true" disabled title={`${r.label}: not available on ${team?.name ?? "this workspace"}`} className={cn(cell, "cursor-not-allowed text-gray-400")}>
                    <RoleIcon role={id} size={18} />
                    <span className={label || undefined}>{r.short}</span>
                  </button>
                );
              }
              const on = t.key === team?.key;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => switchTo(t)} disabled={!!switching} title={`${t.label} · ${t.codename} ${t.version}: ${t.description}`} className={cn(cell, FOCUS, on ? "bg-white font-semibold text-brand-palette-700 shadow-xs" : "cursor-pointer text-gray-600 hover:text-brand-palette-700", switching && !on && "cursor-wait")}>
                  <RoleIcon role={t.role} size={18} />
                  <span className={label || undefined}>{switching === t.key ? "…" : t.short}</span>
                </button>
              );
            })}
          </div>
          {switchError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{switchError}</p>}
        </div>

        <nav className={cn("no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pt-2", collapsed && "md:overflow-visible md:px-2")}>
          {nav.flatMap((k) => NAV.filter((n) => n.key === k)).map((n) => {
            const count = n.key === "cases" ? user.cases ?? 0 : 0;
            return (
              <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={navLink(active(n.href))} title={n.key === "cases" ? "Cases: watches inside the panel, such as a crisis; each one shows only to the people on its list" : undefined}>
                <span className="shrink-0">{n.icon}</span>
                <span className={cn("flex-1 truncate", label)}>{n.label}</span>
                {count > 0 && <Count n={count} title={`${count} case${count === 1 ? "" : "s"} you are on`} collapsed={collapsed} />}
                <Tip show={collapsed}>{n.label}</Tip>
              </Link>
            );
          })}

          {/* a grey well, not more menu: these are conversations, the rows above are places */}
          <section aria-labelledby="recent-chats" className={cn("mt-4 mb-2 flex flex-col gap-0.5 rounded-2xl border border-card-border bg-gray-50 p-1.5", label)}>
            <h2 id="recent-chats" className="flex items-center gap-2 px-2.5 pb-1 pt-1.5 text-xs font-semibold text-gray-500">
              <IconMessages size={14} />
              Recent chats
            </h2>
            {recent.length === 0 && <p className="px-2.5 pb-2 pt-1 text-xs text-gray-500">No chats yet. Ask CeMO something in Chats and it shows up here.</p>}
            {recent.map((c) => (
              <Link key={c.id} href={c.href} title={c.title} className={cn("truncate rounded-xl px-2.5 py-2 max-md:py-3 text-[13px] leading-5 text-gray-700 transition-colors hover:bg-white hover:text-gray-900 hover:shadow-xs", FOCUS)}>
                {c.title.replace(/^\/[\w-]+\s*/, "")}
              </Link>
            ))}
          </section>
        </nav>

        <div className={cn("flex shrink-0 flex-col gap-1 border-t border-card-border px-3 py-3", collapsed && "md:px-2")}>
          {user.company && (
            <Link href="/company" aria-current={active("/company") ? "page" : undefined} className={navLink(active("/company"))} title="Your team's own version: what it changed, made and approved">
              <span className="shrink-0"><IconFolderFavorite /></span>
              <span className={cn("flex-1 truncate", label)}>{user.company.label}</span>
              {user.company.waiting > 0 && <Count n={user.company.waiting} title={`${user.company.waiting} waiting for your approval`} collapsed={collapsed} />}
              <Tip show={collapsed}>{user.company.label}</Tip>
            </Link>
          )}
          <Link href="/connect" aria-current={active("/connect") ? "page" : undefined} className={navLink(active("/connect"))}>
            <span className="shrink-0"><IconPlug /></span>
            <span className={cn("flex-1 truncate", label)}>Connect Claude / ChatGPT</span>
            <Tip show={collapsed}>Connect Claude / ChatGPT</Tip>
          </Link>

          <div className="mt-2">
            <AccountMenu email={user.email} role={user.role} team={user.team} cms={user.cms} path={path} collapsed={collapsed} onSignOut={logout} />
          </div>
        </div>

        <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Show menu" : "Hide menu"} aria-expanded={!collapsed} aria-controls="sidebar" className={cn("hidden h-12 shrink-0 items-center gap-2.5 border-t border-card-border px-5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 md:flex", FOCUS, collapsed && "md:justify-center md:px-0")}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-card-border text-gray-500">{collapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}</span>
          {!collapsed && "Hide menu"}
        </button>
      </aside>
    </>
  );
}

/** a count beside a nav item; on the narrow sidebar it sits on the icon's corner */
function Count({ n, title, collapsed }: { n: number; title: string; collapsed: boolean }) {
  return (
    <b title={title} className={cn("min-w-5 rounded-full bg-brand-palette-100 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-brand-palette-800", collapsed && "md:absolute md:right-1 md:top-1")}>
      {n}
    </b>
  );
}

/** the name of an icon on the narrow sidebar, on hover and on keyboard focus; it is also the link's accessible name there */
function Tip({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-300 group-focus-visible:opacity-100 group-has-focus-visible:opacity-100 group-has-aria-expanded:invisible md:block">
      {children}
    </span>
  );
}
