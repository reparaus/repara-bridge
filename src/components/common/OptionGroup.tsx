import { cn } from "@/lib/utils";
import type { Choice } from "@/lib/services";

/** Large tap-target choice group — single or multi select. */
export function OptionGroup({
  options,
  value,
  onChange,
  multiple = false,
  columns = 2,
}: {
  options: Choice[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  columns?: 1 | 2;
}) {
  function toggle(v: string) {
    if (multiple) {
      onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    } else {
      onChange([v]);
    }
  }

  return (
    <div className={cn("grid gap-3", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            aria-pressed={active}
            className={cn(
              "min-h-[52px] rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 active:scale-[0.985]",
              active
                ? "border-chrome bg-accent text-foreground"
                : "border-border bg-surface text-muted-foreground hover:border-chrome/40 hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
