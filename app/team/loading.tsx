import { CardSkeleton, HeaderSkeleton, SkeletonPage, TableSkeleton } from "@/ui/kit/Skeleton";

/** Team: the header, the people table, the invite form */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the team…">
      <HeaderSkeleton actions={0} />
      <TableSkeleton rows={5} cols={5} />
      <CardSkeleton lines={2} />
    </SkeletonPage>
  );
}
