import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/components/common/PriceSummary";

/**
 * Service-based quote builder.
 *
 * The customer thinks in SERVICES ("front brakes"), not accounting lines, so
 * labor and parts live inside a service card and are totalled per service. The
 * underlying rows are unchanged `quote_items` — `group_label` is the service —
 * so pricing, part sourcing, internal cost, margin and the customer quote page
 * all keep working exactly as before.
 *
 * Internal cost, supplier and part numbers stay behind a details disclosure and
 * are never part of the customer-facing quote.
 */

export type Line = {
  itemType: "labor" | "part" | "fee" | "discount";
  description: string;
  quantity: string;
  unitPrice: string;
  groupLabel: string;
  partBrand: string;
  partNumber: string;
  supplier: string;
  internalUnitCost: string;
  recommendationId: string | null;
};

export const EMPTY_LINE: Line = {
  itemType: "labor",
  description: "",
  quantity: "1",
  unitPrice: "0",
  groupLabel: "",
  partBrand: "",
  partNumber: "",
  supplier: "",
  internalUnitCost: "",
  recommendationId: null,
};

const UNGROUPED = "Additional items";

const lineTotal = (l: Line) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);

export function QuoteBuilder({
  lines,
  setLines,
  tax,
  setTax,
  expirationDate,
  setExpirationDate,
  customerNotes,
  setCustomerNotes,
  internalNotes,
  setInternalNotes,
}: {
  lines: Line[];
  setLines: (updater: (lines: Line[]) => Line[]) => void;
  tax: string;
  setTax: (value: string) => void;
  expirationDate: string;
  setExpirationDate: (value: string) => void;
  customerNotes: string;
  setCustomerNotes: (value: string) => void;
  internalNotes: string;
  setInternalNotes: (value: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState<number | null>(null);
  const [showCustomerNote, setShowCustomerNote] = useState(Boolean(customerNotes));
  const [showInternalNote, setShowInternalNote] = useState(Boolean(internalNotes));

  // Group by service, preserving the order services first appear in.
  const groups: { name: string; indexes: number[] }[] = [];
  lines.forEach((line, index) => {
    const name = line.groupLabel.trim() || UNGROUPED;
    const existing = groups.find((g) => g.name === name);
    if (existing) existing.indexes.push(index);
    else groups.push({ name, indexes: [index] });
  });

  const patch = (index: number, changes: Partial<Line>) =>
    setLines((all) => all.map((l, i) => (i === index ? { ...l, ...changes } : l)));

  const renameService = (from: string, to: string) =>
    setLines((all) =>
      all.map((l) => ((l.groupLabel.trim() || UNGROUPED) === from ? { ...l, groupLabel: to } : l)),
    );

  const addRow = (service: string, itemType: Line["itemType"]) =>
    setLines((all) => [
      ...all,
      {
        ...EMPTY_LINE,
        itemType,
        groupLabel: service === UNGROUPED ? "" : service,
        quantity: itemType === "labor" ? "1" : "1",
      },
    ]);

  const removeService = (service: string) =>
    setLines((all) => all.filter((l) => (l.groupLabel.trim() || UNGROUPED) !== service));

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const groupLines = group.indexes.map((i) => ({ index: i, line: lines[i] as Line }));
        const laborTotal = groupLines
          .filter((r) => r.line.itemType === "labor")
          .reduce((s, r) => s + lineTotal(r.line), 0);
        const partsTotal = groupLines
          .filter((r) => r.line.itemType === "part")
          .reduce((s, r) => s + lineTotal(r.line), 0);
        const otherTotal = groupLines
          .filter((r) => r.line.itemType === "fee" || r.line.itemType === "discount")
          .reduce(
            (s, r) => s + (r.line.itemType === "discount" ? -lineTotal(r.line) : lineTotal(r.line)),
            0,
          );

        return (
          <section key={group.name} className="surface-panel space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Input
                value={group.name === UNGROUPED ? "" : group.name}
                placeholder="Service name (e.g. Front brake service)"
                aria-label="Service name"
                className="h-11 font-medium"
                onChange={(e) => renameService(group.name, e.target.value)}
              />
              <button
                type="button"
                aria-label="Remove service"
                className="p-2 text-muted-foreground hover:text-destructive"
                onClick={() => removeService(group.name)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            {groupLines.map(({ index, line }) => (
              <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    {line.itemType === "labor"
                      ? "Labor"
                      : line.itemType === "part"
                        ? "Part"
                        : line.itemType === "fee"
                          ? "Fee"
                          : "Discount"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">
                      {formatCurrency(lineTotal(line))}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove line"
                      className="p-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => setLines((all) => all.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                <Input
                  value={line.description}
                  placeholder={
                    line.itemType === "labor"
                      ? "What the labor covers"
                      : line.itemType === "part"
                        ? "Part description"
                        : "Description"
                  }
                  className="h-11"
                  onChange={(e) => patch(index, { description: e.target.value })}
                />

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      {line.itemType === "labor" ? "Hours" : "Qty"}
                    </span>
                    <Input
                      value={line.quantity}
                      inputMode="decimal"
                      className="h-11"
                      onChange={(e) => patch(index, { quantity: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      {line.itemType === "labor" ? "Rate / hr" : "Price each"}
                    </span>
                    <Input
                      value={line.unitPrice}
                      inputMode="decimal"
                      className="h-11"
                      onChange={(e) => patch(index, { unitPrice: e.target.value })}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-4"
                  onClick={() => setDetailsOpen(detailsOpen === index ? null : index)}
                >
                  {detailsOpen === index ? "Hide details" : "Service & pricing details"}
                </button>
                {detailsOpen === index && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={line.partBrand}
                      placeholder="Part brand"
                      className="h-11"
                      onChange={(e) => patch(index, { partBrand: e.target.value })}
                    />
                    <Input
                      value={line.partNumber}
                      placeholder="Part number"
                      className="h-11"
                      onChange={(e) => patch(index, { partNumber: e.target.value })}
                    />
                    <Input
                      value={line.supplier}
                      placeholder="Supplier"
                      className="h-11"
                      onChange={(e) => patch(index, { supplier: e.target.value })}
                    />
                    <Input
                      value={line.internalUnitCost}
                      inputMode="decimal"
                      placeholder="Internal cost each (never shown to customer)"
                      className="h-11"
                      onChange={(e) => patch(index, { internalUnitCost: e.target.value })}
                    />
                  </div>
                )}
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 border-border bg-transparent text-xs"
                  onClick={() => addRow(group.name, "labor")}
                >
                  <Plus className="mr-1.5 size-3.5" /> Labor
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 border-border bg-transparent text-xs"
                  onClick={() => addRow(group.name, "part")}
                >
                  <Plus className="mr-1.5 size-3.5" /> Part
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 text-xs text-muted-foreground"
                  onClick={() => addRow(group.name, "fee")}
                >
                  <Plus className="mr-1.5 size-3.5" /> Fee
                </Button>
              </div>
              <p className="text-sm font-medium tabular-nums">
                Service total {formatCurrency(laborTotal + partsTotal + otherTotal)}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Labor {formatCurrency(laborTotal)} · Parts {formatCurrency(partsTotal)}
            </p>
          </section>
        );
      })}

      <Button
        type="button"
        variant="outline"
        className="h-12 w-full border-border bg-transparent sm:w-auto"
        onClick={() => setLines((all) => [...all, { ...EMPTY_LINE, groupLabel: "" }])}
      >
        <Plus className="mr-2 size-4" /> Add a service
      </Button>

      {/* Notes are opt-in so the builder stays short on a phone. */}
      <div className="flex flex-wrap gap-2">
        {!showCustomerNote && (
          <Button
            type="button"
            variant="ghost"
            className="h-10 text-xs text-muted-foreground"
            onClick={() => setShowCustomerNote(true)}
          >
            + Add customer note
          </Button>
        )}
        {!showInternalNote && (
          <Button
            type="button"
            variant="ghost"
            className="h-10 text-xs text-muted-foreground"
            onClick={() => setShowInternalNote(true)}
          >
            + Add internal note
          </Button>
        )}
      </div>
      {showCustomerNote && (
        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">
            Customer note — appears on the quote they read
          </span>
          <Textarea
            rows={3}
            value={customerNotes}
            onChange={(e) => setCustomerNotes(e.target.value)}
          />
        </label>
      )}
      {showInternalNote && (
        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">
            Internal note — the customer never sees this
          </span>
          <Textarea
            rows={3}
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
          />
        </label>
      )}

      {/* Tax stays a flat amount for now; shop-level automatic tax settings can
          replace this input later without touching the stored quote shape. */}
      <details className="surface-panel p-4">
        <summary className="cursor-pointer text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Quote settings
        </summary>
        <div className="grid gap-3 pt-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Tax amount</span>
            <Input
              inputMode="decimal"
              value={tax}
              className="h-11"
              onChange={(e) => setTax(e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Expiration date</span>
            <Input
              type="date"
              value={expirationDate}
              className="h-11"
              onChange={(e) => setExpirationDate(e.target.value)}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
