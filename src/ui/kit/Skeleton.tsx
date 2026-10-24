/**
 * Loading skeletons (DESIGN.md 6.2, "Empty, loading, error states"): grey shapes with the geometry of what
 * is coming, so the page does not jump when it lands. Text lines are bg-gray-200, pills and buttons
 * bg-gray-100; cards keep their real frame. Each page's loading.tsx composes these to match its own layout.
 */
import { cn } from "../cn";

/** one grey shape; give it the size of what it stands for */
export function Skel({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse rounded bg-gray-200", className)} />;
}

/** a pill or a button: lighter, rounder */
export function SkelPill({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block h-10 w-24 animate-pulse rounded-xl bg-gray-100", className)} />;
}

/** the page frame while it loads: read out once, the shapes stay silent */
export function SkeletonPage({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <section data-tw role="status" aria-busy="true" aria-live="polite" className={cn("flex min-h-full flex-col gap-6 px-4 pb-6 md:px-6", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </section>
  );
}

/** PageHeader's shape: a title and its line, the actions on the right */
export function HeaderSkeleton({ actions = 2 }: { actions?: number }) {
  return (
    <div className="flex flex-col gap-3 border-0 border-b border-dashed border-gray-300 pb-4 pt-4 md:flex-row md:items-center md:justify-between md:pt-6">
      <div className="flex flex-col gap-1.5">
        <Skel className="h-6 w-40" />
        <Skel className="h-3 w-72 max-w-full" />
      </div>
      {actions > 0 && (
        <div className="flex gap-2">{Array.from({ length: actions }, (_, i) => <SkelPill key={i} />)}</div>
      )}
    </div>
  );
}

/** the table in 6.2: a header row and rows of cells, the first column wider */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-white">
      <div className="flex gap-4 border-0 border-b border-card-border px-3 py-3.5">
        {Array.from({ length: cols }, (_, c) => <Skel key={c} className={cn("h-3.5", c === 0 ? "w-1/4" : "flex-1")} />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-0 border-b border-card-border px-3 py-4 last:border-b-0">
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} className={cn("flex flex-col gap-1.5", c === 0 ? "w-1/4" : "flex-1")}>
              <Skel className={cn("h-3.5", c === 0 ? "w-3/4" : "w-2/3")} />
              {c === 0 && <Skel className="h-3 w-1/2" />}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** a section card with its heading and some lines or tiles */
export function CardSkeleton({ lines = 3, tiles = 0, className }: { lines?: number; tiles?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-3xl border border-card-border bg-white p-5 md:p-6", className)}>
      <div className="flex flex-col gap-1.5">
        <Skel className="h-5 w-48" />
        <Skel className="h-3 w-80 max-w-full" />
      </div>
      {tiles > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: tiles }, (_, i) => <span key={i} aria-hidden="true" className="block h-24 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      )}
      {Array.from({ length: lines }, (_, i) => <Skel key={i} className={cn("h-3.5", i === lines - 1 ? "w-1/2" : "w-full")} />)}
    </div>
  );
}

/** a row of stat cards (6.2): label, a big number */
export function StatRowSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-3xl border border-card-border bg-white p-5">
          <Skel className="h-3.5 w-24" />
          <Skel className="h-8 w-20" />
          <Skel className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

/** a row of filters: a segmented track, a select, a picker */
export function FilterRowSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      <SkelPill className="h-10 w-72 max-w-full" />
      <SkelPill className="h-10 w-52" />
      <SkelPill className="h-10 w-56" />
    </div>
  );
}

/** a section card holding a chart: heading, then a plot of the chart's height */
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-3xl border border-card-border bg-white p-5 md:p-6", className)}>
      <div className="flex flex-col gap-1.5">
        <Skel className="h-5 w-48" />
        <Skel className="h-3 w-80 max-w-full" />
      </div>
      <span aria-hidden="true" className="block h-56 animate-pulse rounded-2xl bg-gray-100" />
    </div>
  );
}

/** the slide viewer: version tabs, a 16:9 slide, the nav, thumbnails, and the Ask AI panel beside it */
export function ViewerSkeleton() {
  return (
    <>
      <div className="flex gap-1.5">{Array.from({ length: 5 }, (_, i) => <SkelPill key={i} className="h-9 w-28" />)}</div>
      <div className="grid gap-4 min-[1101px]:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-3">
          <span aria-hidden="true" className="block aspect-video w-full animate-pulse rounded-lg bg-gray-200" />
          <div className="flex justify-center"><Skel className="h-4 w-56" /></div>
          <div className="flex gap-2 overflow-hidden">{Array.from({ length: 8 }, (_, i) => <span key={i} aria-hidden="true" className="block h-[78px] w-[136px] shrink-0 animate-pulse rounded-lg bg-gray-100" />)}</div>
        </div>
        <div className="hidden flex-col gap-3 rounded-2xl border border-card-border bg-white p-4 min-[1101px]:flex">
          <Skel className="h-4 w-20" />
          <Skel className="h-3 w-40" />
          <span aria-hidden="true" className="mt-2 block h-16 animate-pulse rounded-2xl bg-gray-100" />
          <span aria-hidden="true" className="mt-auto block h-24 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      </div>
    </>
  );
}
