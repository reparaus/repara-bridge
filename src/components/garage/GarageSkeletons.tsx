import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shape-matched loading placeholders for the driver area. They never contain
 * text or numbers, so nothing can be mistaken for real vehicle data.
 */
export function VehicleHeroSkeleton() {
  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-border/60 bg-card" aria-hidden>
      <Skeleton className="h-44 w-full rounded-none sm:h-56" />
      <div className="space-y-2.5 p-5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="mt-4 h-4 w-1/2" />
      </div>
    </div>
  );
}

export function RowSkeletons({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4">
          <Skeleton className="h-12 w-16 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeletons({ rows = 2, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-2xl border border-border/60 bg-card p-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mt-6 rounded-2xl border border-border/60 bg-card p-5 text-center">
      <p className="text-sm text-foreground">{message}</p>
      <Button variant="outline" className="mt-3 h-11" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Small, non-blocking indicator while cached content refreshes in the background. */
export function RefreshingDot({ active }: { active: boolean }) {
  return (
    <Loader2
      aria-label={active ? "Refreshing" : undefined}
      aria-hidden={!active}
      className={cn("size-4 animate-spin text-muted-foreground transition-opacity", active ? "opacity-100" : "opacity-0")}
    />
  );
}
