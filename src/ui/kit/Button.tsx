import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "link" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const BASE = "inline-flex items-center justify-center font-semibold cursor-pointer select-none transition-all duration-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-brand-palette-700 hover:shadow-md disabled:opacity-50 disabled:hover:bg-primary disabled:hover:shadow-none",
  secondary: "bg-brand-palette-50 text-brand-palette-700 hover:bg-brand-palette-100 disabled:bg-gray-100 disabled:text-gray-600",
  link: "bg-white text-brand-palette-700 hover:bg-brand-palette-50 disabled:text-gray-600",
  // the quiet one, for a row of follow-up actions that should not compete with the answer above them
  outline: "border border-slate-200 bg-white text-gray-700 hover:border-brand-palette-300 hover:text-brand-palette-700 disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-gray-700",
  // no frame at all: Discard, Undo, Cancel beside a primary action
  ghost: "bg-transparent text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent",
};

/** the same look for a Link or an <a> that acts as a button */
export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

const SIZES: Record<Size, string> = {
  sm: "min-h-10 py-2 px-3 rounded-xl text-xs gap-2",
  md: "min-h-11 py-3 px-6 rounded-2xl text-sm gap-2.5",
  lg: "min-h-[52px] py-4 px-8 rounded-2xl text-base gap-2",
};

type Common = { variant?: Variant; size?: Size; isLoading?: boolean; loadingLabel?: string; children: ReactNode };

/** The agency dashboard's button (DESIGN.md 6.1); a busy button keeps its place and says what it is doing. */
export function Button({ variant = "primary", size = "md", isLoading, loadingLabel, className, children, disabled, ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(BASE, VARIANTS[variant], SIZES[size], className)} disabled={disabled || isLoading} aria-busy={isLoading || undefined} {...rest}>
      {isLoading ? <><Spinner className="text-current" />{loadingLabel ?? children}</> : children}
    </button>
  );
}

/** A link that looks like a button, for "Back to sign in" and the like. */
export function ButtonLink({ variant = "primary", size = "md", className, children, ...rest }: Omit<Common, "isLoading" | "loadingLabel"> & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...rest}>{children}</a>;
}
