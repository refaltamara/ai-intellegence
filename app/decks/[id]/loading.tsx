import { HeaderSkeleton, SkeletonPage, ViewerSkeleton } from "@/ui/kit/Skeleton";

/** A deck: the slide viewer with its versions and the Ask AI panel */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the deck…" className="gap-4">
      <HeaderSkeleton actions={4} />
      <ViewerSkeleton />
    </SkeletonPage>
  );
}
