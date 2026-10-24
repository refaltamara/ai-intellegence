/**
 * What a page shows while its numbers load: the sidebar is already there, so the wait reads as loading, not as a
 * stuck click. The dashboard shape (header, filters, stat tiles, a chart and a table) for the Dashboard, the Pulse
 * and a case; a page with another layout composes its own from src/ui/kit/Skeleton.tsx.
 */
import { CardSkeleton, ChartSkeleton, FilterRowSkeleton, HeaderSkeleton, SkeletonPage, StatRowSkeleton, TableSkeleton } from "./kit/Skeleton";

export function PageLoading({ label }: { label: string }) {
  return (
    <SkeletonPage label={label}>
      <HeaderSkeleton actions={2} />
      <FilterRowSkeleton />
      <StatRowSkeleton />
      <ChartSkeleton />
      <TableSkeleton rows={5} cols={6} />
      <CardSkeleton lines={3} />
    </SkeletonPage>
  );
}
