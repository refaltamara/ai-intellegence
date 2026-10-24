import { PageLoading } from "@/ui/PageLoading";

/** A case: the crisis view's shape, the same skeleton the page shows inside its Suspense */
export default function Loading() {
  return <PageLoading label="Loading the case…" />;
}
