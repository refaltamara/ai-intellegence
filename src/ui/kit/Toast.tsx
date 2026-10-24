"use client";
/** One short sentence that says what just happened (DESIGN.md 6.2): shown at the bottom, read out, gone after a few seconds. */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../cn";

export function useToast(ms = 3500) {
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = useCallback((t: string) => {
    if (timer.current) clearTimeout(timer.current);
    setText(t);
    timer.current = setTimeout(() => setText(""), ms);
  }, [ms]);
  return { text, show };
}

export function Toast({ text }: { text: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("pointer-events-none fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl bg-gray-900 px-4 py-2.5 font-sans text-sm text-white shadow-lg transition-all duration-200", text ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}>{text}</div>
  );
}
