import { HeaderSkeleton, Skel, SkelPill, SkeletonPage, TableSkeleton } from "@/ui/kit/Skeleton";

/** Reports: the header, the schedules table, then the reports with their filter */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the reports…">
      <HeaderSkeleton actions={2} />
      <div className="flex flex-col gap-3">
        <Skel className="h-5 w-32" />
        <TableSkeleton rows={2} cols={4} />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Skel className="h-5 w-28" />
          <SkelPill className="h-11 w-80 max-w-full" />
        </div>
        <TableSkeleton rows={6} cols={4} />
      </div>
    </SkeletonPage>
  );
}
