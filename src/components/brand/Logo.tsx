import { cn } from "@/lib/utils";
import markAsset from "@/assets/repara-mark.png.asset.json";
import lockupAsset from "@/assets/repara-lockup.png.asset.json";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <img
        src={compact ? markAsset.url : lockupAsset.url}
        alt="Repara — auto service"
        className={compact ? "h-8 w-auto" : "h-9 w-auto sm:h-10"}
        loading="eager"
        decoding="async"
      />
    </span>
  );
}
