import { CardSkeleton, HeaderSkeleton, SkeletonPage } from "@/ui/kit/Skeleton";

/** One report: the header with its actions, then the document's cards */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the report…">
      <HeaderSkeleton actions={3} />
      <CardSkeleton lines={3} />
      <CardSkeleton lines={4} />
      <CardSkeleton lines={2} />
    </SkeletonPage>
  );
}
