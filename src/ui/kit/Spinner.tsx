import { cn } from "../cn";

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin text-brand-palette-600", className)} />;
}
