import type { ReactNode } from "react";
import { LogoMark } from "./LogoMark";

/**
 * The frame of every sign-in page (login, password, invitation), after the agency dashboard's login:
 * the form on a white panel, the brand on an orange one beside it from `lg` up. The orange panel says
 * what the product is and nothing more: no figures, no claims.
 */
export function AuthShell({
  product = "Fair Intelligence",
  title,
  subtitle,
  children,
}: {
  product?: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full bg-gray-50 p-4 md:p-6">
      <div className="flex w-full flex-col justify-center overflow-y-auto rounded-3xl border border-card-border bg-white px-6 py-8 shadow-xs sm:px-8 sm:py-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5">
            <LogoMark size={36} />
            <span className="text-xl font-bold tracking-tight text-gray-900">
              {product}
            </span>
          </div>
          <h1 className="text-2xl font-medium text-gray-900">{title}</h1>
          {subtitle && <p className="text-base text-gray-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="hidden w-1/2 pl-4 md:pl-6 lg:block">
        <div className="relative flex h-full w-full flex-col justify-between overflow-clip rounded-3xl bg-brand-palette-600 p-10 xl:p-14">
          <LogoMark size={64} />
          <SoundBars />
          <p className="relative max-w-md text-3xl font-bold leading-tight text-white">
            Social intelligence on Fair&apos;s social listening data.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The logo's five bars, drawn large and faint behind the panel's sentence: the mark's own motif, not a stock pattern. */
function SoundBars() {
  const bars = [
    [0, 46, 28],
    [1, 34, 52],
    [2, 24, 72],
    [3, 36, 48],
    [4, 46, 28],
  ];
  return (
    <svg
      viewBox="0 0 120 120"
      className="pointer-events-none absolute -right-16 top-1/2 h-[70%] -translate-y-1/2 text-white opacity-15"
      aria-hidden="true"
      focusable="false"
    >
      {bars.map(([i, y, h]) => (
        <rect
          key={i}
          x={19.6 + i * 17.6}
          y={y}
          width="10.4"
          height={h}
          rx="5.2"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

/** A form's one error, read out when it appears. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {children}
    </p>
  );
}

/** Links in sign-in copy: the accent colour and an underline, so they read as links without the colour. */
export const authLink =
  "font-semibold text-brand-palette-700 underline underline-offset-2 hover:text-brand-palette-800";
