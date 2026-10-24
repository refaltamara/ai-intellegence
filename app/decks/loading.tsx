import { HeaderSkeleton, SkelPill, SkeletonPage, TableSkeleton } from "@/ui/kit/Skeleton";

/** Decks: the header, the status filter and the table of decks */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the decks…">
      <HeaderSkeleton actions={2} />
      <div className="flex flex-col gap-3">
        <SkelPill className="h-11 w-80 max-w-full" />
        <TableSkeleton rows={6} cols={5} />
      </div>
    </SkeletonPage>
  );
}
