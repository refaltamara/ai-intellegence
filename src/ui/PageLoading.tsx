/**
 * What a page shows while its numbers load: the sidebar is already there, so the wait reads as loading, not as a
 * stuck click. The dashboard shape (header, stat cards, two blocks) for the Dashboard, the Pulse and a case; a
 * page with another layout composes its own from src/ui/kit/Skeleton.tsx.
 */
import { CardSkeleton, HeaderSkeleton, SkeletonPage, StatRowSkeleton } from "./kit/Skeleton";

export function PageLoading({ label }: { label: string }) {
  return (
    <SkeletonPage label={label}>
      <HeaderSkeleton actions={1} />
      <StatRowSkeleton />
      <CardSkeleton lines={6} />
      <CardSkeleton lines={3} />
    </SkeletonPage>
  );
}
