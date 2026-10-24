import { CardSkeleton, HeaderSkeleton, SkeletonPage } from "@/ui/kit/Skeleton";

/** Edit a deck: the form's cards, with no describe box or templates */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the deck…">
      <HeaderSkeleton actions={1} />
      <CardSkeleton lines={3} />
      <CardSkeleton lines={0} tiles={6} />
      <CardSkeleton lines={2} />
    </SkeletonPage>
  );
}
