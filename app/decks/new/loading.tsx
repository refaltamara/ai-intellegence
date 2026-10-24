import { CardSkeleton, HeaderSkeleton, SkeletonPage } from "@/ui/kit/Skeleton";

/** New deck: the describe box, the templates, then the form's cards */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the deck form…">
      <HeaderSkeleton actions={0} />
      <CardSkeleton lines={1} />
      <CardSkeleton lines={0} tiles={6} />
      <CardSkeleton lines={3} />
    </SkeletonPage>
  );
}
