"use client";
/**
 * The account at the foot of the sidebar, after the agency dashboard's user menu: one button with the
 * avatar, the email and what the person is here (Builder, Member, Fair duties); it opens the account's
 * places (Team, CMS, Data and settings) and Sign out. Upwards on the full sidebar and the phone drawer,
 * to the right on the narrow one.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { IconChevronDown, IconDocumentCloud, IconPeople, IconSetting, IconSignOut } from "./kit/icons";

type Item = { href: string; label: string; hint: string; icon: React.ReactNode };

export function AccountMenu({ email, role, team, cms, path, collapsed, onSignOut }: { email: string; role: string; team?: boolean; cms?: boolean; path: string; collapsed: boolean; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const items: Item[] = [
    ...(team ? [{ href: "/team", label: "Team", hint: "Who is in this workspace", icon: <IconPeople size={18} /> }] : []),
    ...(cms ? [{ href: "/admin", label: "CMS", hint: "Fair's side of the product", icon: <IconSetting size={18} /> }] : []),
    { href: "/data", label: "Data and settings", hint: "What this workspace holds", icon: <IconDocumentCloud size={18} /> },
  ];

  // going somewhere closes it
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  function keys(e: React.KeyboardEvent) {
    const all = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); button.current?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); all[(at + 1) % all.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); all[(at - 1 + all.length) % all.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); all[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); all[all.length - 1]?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  }

  const initials = email.slice(0, 2).toUpperCase();
  const here = items.some((i) => path.startsWith(i.href));
  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? `Account: ${email}` : undefined}
        title={collapsed ? email : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-2xl border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600",
          open || here ? "border-brand-palette-200 bg-brand-palette-50" : "border-card-border bg-gray-50 hover:border-gray-200 hover:bg-gray-100",
          collapsed && "md:justify-center md:border-transparent md:bg-transparent md:p-1 md:hover:bg-gray-100",
        )}
      >
        <span className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-brand-palette-600 text-xs font-bold text-white">{initials}</span>
        <span className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
          <span className="block truncate text-sm font-semibold text-gray-900">{email}</span>
          {role && <span className="block truncate text-xs text-gray-500">{role}</span>}
        </span>
        <IconChevronDown size={16} className={cn("text-gray-500 transition-transform duration-200", !open && "rotate-180", collapsed && "md:hidden")} />
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Account"
          onKeyDown={keys}
          className={cn(
            "absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg",
            // the narrow sidebar has no width for it: it opens beside the avatar instead
            collapsed && "md:bottom-0 md:left-full md:right-auto md:mb-0 md:ml-3 md:w-64",
          )}
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="break-all text-sm font-semibold text-gray-900">{email}</p>
            {role && <p className="text-xs text-gray-500">{role}</p>}
          </div>
          <div className="flex flex-col p-1.5">
            {items.map((i) => {
              const on = path.startsWith(i.href);
              return (
                <Link key={i.href} href={i.href} role="menuitem" tabIndex={-1} aria-current={on ? "page" : undefined} onClick={() => setOpen(false)} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 outline-none transition-colors focus-visible:bg-gray-100", on ? "bg-brand-palette-50 text-brand-palette-700" : "text-gray-700 hover:bg-gray-100")}>
                  <span className={on ? "text-brand-palette-700" : "text-gray-500"}>{i.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{i.label}</span>
                    <span className="block text-xs text-gray-500">{i.hint}</span>
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="border-t border-gray-100 p-1.5">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={leaving}
              onClick={() => { setLeaving(true); onSignOut(); }}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-600 outline-none transition-colors hover:bg-red-50 focus-visible:bg-red-50 disabled:cursor-wait"
            >
              <IconSignOut size={18} />
              {leaving ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
