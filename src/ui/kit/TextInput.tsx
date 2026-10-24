import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn";

/**
 * The agency dashboard's text input (DESIGN.md 6.3): label above, hint or error below, an optional
 * control on the right (show password). Hooks only `useId`, so it works in any client form.
 */
export function TextInput({
  label,
  hint,
  error,
  right,
  className,
  id,
  ...rest
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  right?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const inputId = id ?? auto;
  const note = `${inputId}-note`;
  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm text-gray-900">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? note : undefined}
          className={cn(
            "h-13 w-full rounded-2xl border bg-white px-4 font-sans text-sm text-black outline-none transition-all duration-200 ease-in-out placeholder:text-gray-500",
            "focus:border-brand-palette-600 focus:ring-2 focus:ring-brand-palette-500/15",
            error ? "border-red-500 bg-red-50/30" : "border-slate-200",
            right ? "pr-12" : "",
            className,
          )}
          {...rest}
        />
        {right && (
          <div className="absolute inset-y-0 right-1 flex items-center">
            {right}
          </div>
        )}
      </div>
      {(error || hint) && (
        <span
          id={note}
          className={cn("text-xs", error ? "text-red-600" : "text-gray-500")}
        >
          {error ?? hint}
        </span>
      )}
    </div>
  );
}
