import { cn } from "@/lib/utils";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

export function PriceSummary({
  parts,
  labor,
  fees,
  discounts,
  tax,
  total,
  className,
}: {
  parts: number;
  labor: number;
  fees: number;
  discounts: number;
  tax?: number;
  total: number;
  className?: string;
}) {
  const rows: [string, number][] = [
    ["Parts", parts],
    ["Labor", labor],
    ["Fees", fees],
  ];
  if (discounts) rows.push(["Discounts", -discounts]);
  if (tax) rows.push(["Tax", tax]);

  return (
    <div className={cn("surface-panel p-5", className)}>
      <dl className="space-y-3">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{formatCurrency(amount)}</dd>
          </div>
        ))}
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <dt className="text-sm tracking-wide text-muted-foreground uppercase">Estimated total</dt>
          <dd className="font-display text-2xl font-bold tabular-nums">{formatCurrency(total)}</dd>
        </div>
      </dl>
    </div>
  );
}
