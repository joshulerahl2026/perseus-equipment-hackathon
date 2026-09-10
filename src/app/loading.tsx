import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="animate-pulse">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="mt-4 h-64" />
      <Skeleton className="mt-4 h-96" />
      <span className="sr-only">Loading data from the dealership database</span>
    </div>
  );
}
