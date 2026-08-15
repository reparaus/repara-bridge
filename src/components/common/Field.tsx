import type { ReactNode } from "react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {optional && (
          <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{t("common.optional")}</span>
        )}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
