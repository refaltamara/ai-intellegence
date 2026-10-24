import { HeaderSkeleton, SkeletonPage, ViewerSkeleton } from "@/ui/kit/Skeleton";

/** Weekly Reports: the same slide viewer as a deck */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the reports…" className="gap-4">
      <HeaderSkeleton actions={3} />
      <ViewerSkeleton />
    </SkeletonPage>
  );
}
