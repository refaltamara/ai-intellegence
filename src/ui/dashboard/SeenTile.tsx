"use client";
/**
 * A dashboard section that says once when it has been in view for two seconds (the
 * "tile viewed" signal of the learning loop, src/learning/kinds.ts). It adds a plain box
 * around the section and nothing else.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { sendSignal } from "../signal";

export function SeenTile({ tile, children }: { tile: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let t: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const io = new IntersectionObserver(([e]) => {
      if (done) return;
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        t ??= setTimeout(() => { done = true; sendSignal("dashboard.tile_viewed", { tile }); io.disconnect(); }, 2000);
      } else if (t) { clearTimeout(t); t = null; }
    }, { threshold: [0, 0.5] });
    io.observe(el);
    return () => { io.disconnect(); if (t) clearTimeout(t); };
  }, [tile]);
  // min-w-0: inside a two-column grid a wide table must scroll, not stretch the column
  return <div ref={ref} className="flex min-w-0 flex-col">{children}</div>;
}
