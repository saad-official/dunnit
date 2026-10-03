import { Skeleton } from "@/components/ui/skeleton";

export default function QueueLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading the queue</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-36" />
        </div>
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="space-y-4 rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 sm:p-5">
          <div className="flex justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-5 w-56 max-w-full" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-40 rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
