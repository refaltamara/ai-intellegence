"use client";
/**
 * Send a signal from the browser (src/learning/kinds.ts): batched for a moment, sent with
 * sendBeacon so it survives leaving the page. Only ids and choices go; the server checks
 * the kind and cleans the payload again.
 */
import type { SignalKind } from "@/learning/kinds";

let queue: { kind: SignalKind; payload: Record<string, unknown> }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ items: queue.splice(0, 20) });
  try {
    if (!navigator.sendBeacon?.("/api/signal", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/signal", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
    }
  } catch { /* a lost signal never matters to the person */ }
  if (queue.length) timer = setTimeout(flush, 500);
}

export function sendSignal(kind: SignalKind, payload: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  queue.push({ kind, payload });
  if (!timer) timer = setTimeout(flush, 1500);
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flush);
