import { cn } from "@/lib/utils";

export function ProgressStepper({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={step} className="flex-1">
            <div
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i <= current ? "bg-chrome" : "bg-muted",
              )}
            />
            <p
              className={cn(
                "mt-2 text-[11px] tracking-[0.14em] uppercase transition-colors",
                i === current
                  ? "text-foreground"
                  : i < current
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50",
              )}
            >
              {step}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
