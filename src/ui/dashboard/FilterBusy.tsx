/** "Updating…" beside a filter row while the page loads the new view; the spinner marks real work */
import { Spinner } from "../kit/Spinner";

export function FilterBusy({ on }: { on: boolean }) {
  return (
    <span aria-live="polite" className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-gray-600">
      {on && <><Spinner />Updating…</>}
    </span>
  );
}
