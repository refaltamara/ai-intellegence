import { HeaderSkeleton, SkeletonPage, TableSkeleton } from "@/ui/kit/Skeleton";

/** Cases: the header and the table of cases */
export default function Loading() {
  return (
    <SkeletonPage label="Loading your cases…">
      <HeaderSkeleton actions={1} />
      <TableSkeleton rows={3} cols={4} />
    </SkeletonPage>
  );
}
