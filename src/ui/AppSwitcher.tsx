"use client";
/**
 * A presenter's brand and its other apps (src/brand/demo.ts): a grid button at the top right opens them, the way
 * an office suite's app launcher does, so moving from this app to the next one feels like one product.
 */
import { useEffect, useRef, useState } from "react";
import type { BrandApp } from "../brand/demo";
import { LogoMark } from "./LogoMark";

export function AppSwitcher({ apps, owner }: { apps: BrandApp[]; owner: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="appswitch" ref={ref}>
      <button type="button" className="appswitch-btn" aria-label={`${owner} apps`} aria-expanded={open} title={`${owner} apps`} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          {[5, 12, 19].flatMap((y) => [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" />))}
        </svg>
      </button>
      {open && (
        <div className="appswitch-menu" role="menu" aria-label={`${owner} apps`}>
          <b>{owner}</b>
          <div className="grid">
            {apps.map((a) => (
              <a key={a.key} href={a.href} role="menuitem" className={a.here ? "here" : ""} aria-current={a.here ? "page" : undefined} onClick={() => setOpen(false)}>
                <span className={`tile ${a.key}`}>{a.key === "listening" ? <LogoMark size={44} /> : <AppIcon kind={a.key} />}</span>
                <span>{a.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AppIcon({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "affiliate" ? <><path d="M6 7h12l-1 13H7z" /><path d="M9 7a3 3 0 0 1 6 0" /></> : <rect x="5" y="5" width="14" height="14" rx="3" />}
    </svg>
  );
}
