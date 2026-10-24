import { CardSkeleton, HeaderSkeleton, SkeletonPage, TableSkeleton } from "@/ui/kit/Skeleton";

/** Connect: the header, the address card, the two how-to panels, the connected apps */
export default function Loading() {
  return (
    <SkeletonPage label="Loading your connections…">
      <HeaderSkeleton actions={1} />
      <CardSkeleton lines={2} />
      <div className="grid gap-6 lg:grid-cols-2"><CardSkeleton lines={3} /><CardSkeleton lines={3} /></div>
      <TableSkeleton rows={2} cols={5} />
    </SkeletonPage>
  );
}
