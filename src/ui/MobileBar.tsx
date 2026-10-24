"use client";
import { LogoMark } from "./LogoMark";
import { IconMenu } from "./kit/icons";
import { useDrawer } from "./Shell";

/** Phones only: the way to the sidebar, which is a drawer there. */
export function MobileBar({ product }: { product: string }) {
  const { open, setOpen } = useDrawer();
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-2 md:hidden">
      <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="sidebar" className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand-palette-600">
        <IconMenu size={22} />
      </button>
      <LogoMark size={28} />
      <span className="truncate text-base font-bold text-gray-800">{product}</span>
    </div>
  );
}
