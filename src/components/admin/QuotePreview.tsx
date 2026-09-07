import { Logo } from "@/components/brand/Logo";
import { formatCurrency } from "@/components/common/PriceSummary";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Exactly what the customer will see, before it is sent.
 *
 * Internal cost and margin are NEVER part of the customer view — they appear
 * only in the clearly separated admin-only footer of this dialog.
 */
export type PreviewLine = {
  itemType: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  groupLabel: string;
  partBrand: string;
  partNumber: string;
};

export function QuotePreview({
  open,
  onOpenChange,
  requestNumber,
  vehicle,
  lines,
  parts,
  labor,
  fees,
  discounts,
  tax,
  total,
  customerNotes,
  expirationDate,
  internalCost,
  margin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestNumber: string;
  vehicle: string;
  lines: PreviewLine[];
  parts: number;
  labor: number;
  fees: number;
  discounts: number;
  tax: number;
  total: number;
  customerNotes: string;
  expirationDate: string;
  internalCost: number;
  margin: number;
}) {
  // Lines are grouped per service card, exactly like the customer quote page.
  const groups: { label: string; lines: PreviewLine[] }[] = [];
  for (const line of lines) {
    const label = line.groupLabel.trim() || "Recommended service";
    const group = groups.find((g) => g.label === label);
    if (group) group.lines.push(line);
    else groups.push({ label, lines: [line] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quote preview</DialogTitle>
          <DialogDescription>
            This is the customer's view. Internal costs are not included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 rounded-xl border border-border bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Logo className="h-8 w-auto" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Quote for request</p>
              <p className="font-display text-sm font-bold">#{requestNumber}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Vehicle</p>
            <p className="text-sm font-medium">{vehicle || "—"}</p>
          </div>

          <div className="space-y-4">
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground">No line items yet.</p>
            )}
            {groups.map((group) => (
              <div key={group.label} className="rounded-lg border border-border p-3">
                <p className="font-display text-sm font-bold">{group.label}</p>
                <ul className="mt-2 space-y-2">
                  {group.lines.map((line, index) => (
                    <li key={`${line.description}-${index}`} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm break-words">{line.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            line.itemType === "part" ? "Part" : line.itemType === "labor" ? "Labor" : null,
                            line.partBrand || null,
                            line.partNumber ? `#${line.partNumber}` : null,
                            line.quantity !== 1 ? `Qty ${line.quantity}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums">
                        {formatCurrency(line.total)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t border-border pt-3 text-sm">
            <Row label="Parts" value={parts} />
            <Row label="Labor" value={labor} />
            {fees > 0 && <Row label="Fees" value={fees} />}
            {discounts > 0 && <Row label="Discount" value={-discounts} />}
            {tax > 0 && <Row label="Tax" value={tax} />}
            <div className="flex items-baseline justify-between pt-1.5">
              <span className="font-display text-base font-extrabold">Total</span>
              <span className="font-display text-base font-extrabold tabular-nums">
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          {customerNotes.trim() && (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm whitespace-pre-line">{customerNotes}</p>
            </div>
          )}

          {expirationDate && (
            <p className="text-xs text-muted-foreground">Valid through {expirationDate}</p>
          )}

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            The customer approves or declines from this quote — no account needed.
          </div>
        </div>

        {/* ADMIN ONLY — never part of the customer document above. */}
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Internal only — not shown to the customer
          </p>
          <div className="mt-1.5 flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">Part cost {formatCurrency(internalCost)}</span>
            <span className="font-medium">Estimated margin {formatCurrency(margin)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}
