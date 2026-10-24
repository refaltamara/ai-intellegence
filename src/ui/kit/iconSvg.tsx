import type { ReactNode } from "react";
import { cn } from "../cn";

export type P = { size?: number; className?: string };

// block, not inline: an inline svg sits on the text baseline and rides above the middle of its label
export function Svg({ size = 20, className, view, children }: P & { view: string; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox={view} fill="none" className={cn("block shrink-0", className)} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
