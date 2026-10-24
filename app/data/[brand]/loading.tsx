import { CardSkeleton, ChartSkeleton, HeaderSkeleton, SkeletonPage, TableSkeleton } from "@/ui/kit/Skeleton";

/** A brand's page: the header, coverage per platform, tiers, posts over time, top creators */
export default function Loading() {
  return (
    <SkeletonPage label="Loading what was collected about this brand…">
      <HeaderSkeleton actions={1} />
      <CardSkeleton lines={1} tiles={2} />
      <TableSkeleton rows={5} cols={6} />
      <ChartSkeleton />
      <TableSkeleton rows={8} cols={7} />
    </SkeletonPage>
  );
}
