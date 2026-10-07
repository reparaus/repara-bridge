import { cn } from "@/lib/utils";
import markUrl from "@/assets/repara-mark.png";
import lockupUrl from "@/assets/repara-lockup.png";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <img
        src={compact ? markUrl : lockupUrl}
        alt="Repara — auto service"
        className={compact ? "h-8 w-auto" : "h-9 w-auto sm:h-10"}
        loading="eager"
        decoding="async"
      />
    </span>
  );
}
