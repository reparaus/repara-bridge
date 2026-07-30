import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/services";

const TONE: Record<string, string> = {
  new: "bg-info/15 text-info border-info/30",
  reviewing: "bg-chrome/15 text-chrome border-chrome/30",
  quoted: "bg-warning/15 text-warning border-warning/30",
  sent: "bg-warning/15 text-warning border-warning/30",
  accepted: "bg-success/15 text-success border-success/30",
  scheduled: "bg-info/15 text-info border-info/30",
  in_progress: "bg-chrome/15 text-chrome border-chrome/30",
  completed: "bg-success/15 text-success border-success/30",
  declined: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase",
        TONE[status] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
