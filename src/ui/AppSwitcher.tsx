"use client";
/**
 * A presenter's brand and its other apps (src/brand/demo.ts): a grid button at the top right opens them, the way
 * an office suite's app launcher does, so moving from this app to the next one feels like one product.
 */
import { useEffect, useRef, useState } from "react";
import type { BrandApp } from "../brand/demo";
import { LogoMark } from "./LogoMark";

export function AppSwitcher({
  apps,
  owner,
}: {
  apps: BrandApp[];
  owner: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="fixed right-3 top-1.5 z-40 md:right-5 md:top-2.5" ref={ref}>
      <button
        type="button"
        className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-brand-palette-600 ${open ? "bg-brand-palette-50 text-brand-palette-700" : "text-gray-500 hover:bg-brand-palette-50 hover:text-brand-palette-700"}`}
        aria-label={`${owner} apps`}
        aria-expanded={open}
        title={`${owner} apps`}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="currentColor"
          aria-hidden="true"
        >
          {[5, 12, 19].flatMap((y) =>
            [5, 12, 19].map((x) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" />
            )),
          )}
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-65 rounded-2xl border border-gray-100 bg-white p-3 shadow-lg"
          role="menu"
          aria-label={`${owner} apps`}
        >
          <b className="block px-1.5 pb-2.5 text-xs font-semibold text-gray-500">
            {owner}
          </b>
          <div className="grid grid-cols-3 gap-1.5">
            {apps.map((a) => (
              <a
                key={a.key}
                href={a.href}
                role="menuitem"
                className={`flex flex-col items-center gap-2 rounded-xl px-1.5 py-3 text-xs font-semibold text-gray-900 focus-visible:outline-2 focus-visible:outline-brand-palette-600 ${a.here ? "bg-brand-palette-50" : "hover:bg-gray-100"}`}
                aria-current={a.here ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl ${a.key === "affiliate" ? "bg-linear-to-br from-[#F0566F] to-[#C42A4A] text-white" : ""}`}
                >
                  {a.key === "listening" ? (
                    <LogoMark size={44} />
                  ) : (
                    <AppIcon kind={a.key} />
                  )}
                </span>
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
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "affiliate" ? (
        <>
          <path d="M6 7h12l-1 13H7z" />
          <path d="M9 7a3 3 0 0 1 6 0" />
        </>
      ) : (
        <rect x="5" y="5" width="14" height="14" rx="3" />
      )}
    </svg>
  );
}
