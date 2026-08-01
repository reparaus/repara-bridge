import { cn } from "@/lib/utils";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * One-tap copy for values an admin retypes constantly (phone, VIN).
 * Kept deliberately small so it works inside dense request cards on mobile.
 */
export function CopyValue({
  value,
  label,
  className,
  mono,
}: {
  value: string;
  label: string;
  className?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="text-sm text-muted-foreground">—</span>;

  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:border-chrome/50 hover:text-foreground",
        copied ? "border-success/40 text-success" : "text-muted-foreground",
        className,
      )}
    >
      <span className={cn("truncate", mono && "font-mono tracking-tight")}>{value}</span>
      {copied ? (
        <Check className="size-3 shrink-0" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-70" />
      )}
    </button>
  );
}
