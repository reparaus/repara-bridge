import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 py-16 text-center", className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-5 animate-spin text-chrome" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/60" />
      ))}
    </div>
  );
}
