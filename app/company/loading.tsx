import { CardSkeleton, HeaderSkeleton, SkeletonPage } from "@/ui/kit/Skeleton";

/** Our {codename}: the header, then the team's sections as cards */
export default function Loading() {
  return (
    <SkeletonPage label="Loading your team's version…">
      <HeaderSkeleton actions={1} />
      <CardSkeleton lines={3} />
      <CardSkeleton lines={2} />
      <div className="grid gap-6 lg:grid-cols-2"><CardSkeleton lines={2} /><CardSkeleton lines={2} /></div>
    </SkeletonPage>
  );
}
