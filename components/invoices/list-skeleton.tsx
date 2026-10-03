import { Skeleton } from "@/components/ui/skeleton";

/** Loading state for the invoice and customer lists. */
export function ListSkeleton({ label, withTabs = false }: { label: string; withTabs?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      {withTabs ? <Skeleton className="h-9 w-full max-w-lg rounded-lg" /> : null}
      <div className="grid gap-3 md:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl ring-1 ring-foreground/10 md:block">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t px-4 py-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Loading state for the invoice and customer detail pages. */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-4 w-20" />
      <div className="space-y-3">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}
