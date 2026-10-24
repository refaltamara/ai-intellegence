import { CardSkeleton, HeaderSkeleton, SkeletonPage, StatRowSkeleton, TableSkeleton } from "@/ui/kit/Skeleton";

/** Data: the header, the client brand, the four counts, the layers, coverage and loads */
export default function Loading() {
  return (
    <SkeletonPage label="Loading what this workspace holds…">
      <HeaderSkeleton actions={1} />
      <CardSkeleton lines={1} />
      <StatRowSkeleton n={4} />
      <CardSkeleton lines={0} tiles={3} />
      <TableSkeleton rows={6} cols={5} />
    </SkeletonPage>
  );
}
