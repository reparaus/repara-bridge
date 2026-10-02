import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ProgressStepper } from "@/components/common/ProgressStepper";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, parseDollars } from "@/lib/money";
import { suggestParts } from "@/lib/part-suggestions";
import { submitProviderQuoteLines } from "@/lib/provider-quotes.functions";

type Vehicle = { year: number | null; make: string | null; model: string | null; trim: string | null; engine: string | null; fuelType: string | null; drivetrain: string | null };
type PartRow = { name: string; brand: string; partNumber: string; qty: string; cost: string; price: string };
type FeeRow = { name: string; price: string };

const STEPS = ["Vehicle", "Parts", "Labor", "Fees", "Review"];
const emptyPart = (name = ""): PartRow => ({ name, brand: "", partNumber: "", qty: "1", cost: "", price: "" });
const qtyOf = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function ProviderQuoteBuilder({
  requestId,
  vehicle,
  mileage,
  services,
  categoryKey,
  notes,
  laborRateCents,
  presetLaborCents,
  revising,
  onDone,
  onCancel,
}: {
  requestId: string;
  vehicle: Vehicle;
  mileage: number | null;
  services: string[];
  categoryKey: string | null;
  notes: string | null;
  laborRateCents: number | null;
  presetLaborCents?: number | null;
  revising: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const submit = useServerFn(submitProviderQuoteLines);
  const [step, setStep] = useState(0);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState(laborRateCents !== null ? (laborRateCents / 100).toFixed(2) : "");
  const [manualLabor, setManualLabor] = useState(presetLaborCents ? (presetLaborCents / 100).toFixed(2) : "");
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [tax, setTax] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [warranty, setWarranty] = useState("");
  const [note, setNote] = useState("");
  const [fitment, setFitment] = useState(false);
  const suggestions = useMemo(() => suggestParts(categoryKey, services), [categoryKey, services]);

  const partLines = parts.map((p) => ({ ...p, q: qtyOf(p.qty), c: p.cost.trim() ? parseDollars(p.cost) : 0, pr: parseDollars(p.price) }));
  const partsValid = partLines.every((p) => p.name.trim() && p.q !== null && p.c !== null && p.pr !== null);
  const partsTotal = partLines.reduce((a, p) => a + Math.round((p.q ?? 0) * (p.pr ?? 0)), 0);
  const partsCost = partLines.reduce((a, p) => a + Math.round((p.q ?? 0) * (p.c ?? 0)), 0);

  const h = hours.trim() ? Number(hours) : 0;
  const rateCents = parseDollars(rate);
  const useRate = h > 0 && rateCents !== null && rateCents > 0;
  const manualCents = parseDollars(manualLabor);
  const laborTotal = useRate ? Math.round(h * rateCents!) : (manualCents ?? 0);
  const laborValid = Number.isFinite(h) && h >= 0 && rateCents !== null && manualCents !== null;

  const feeLines = fees.map((f) => ({ ...f, pr: parseDollars(f.price) }));
  const feesValid = feeLines.every((f) => f.name.trim() && f.pr !== null);
  const feesTotal = feeLines.reduce((a, f) => a + (f.pr ?? 0), 0);
  const taxCents = parseDollars(tax);
  const total = partsTotal + laborTotal + feesTotal + (taxCents ?? 0);

  const mut = useMutation({
    mutationFn: () =>
      submit({
        data: {
          requestId,
          taxCents: taxCents ?? 0,
          notes: note,
          timeframe,
          warranty,
          fitmentConfirmed: parts.length === 0 || fitment,
          items: [
            ...partLines.map((p) => ({
              kind: "part" as const,
              name: p.name.trim(),
              quantity: p.q!,
              unitPriceCents: p.pr!,
              brand: p.brand,
              partNumber: p.partNumber,
              providerUnitCostCents: p.cost.trim() ? p.c! : null,
              supplier: "",
              laborHours: null,
              laborRateCents: null,
            })),
            ...(laborTotal > 0
              ? [
                  useRate
                    ? { kind: "labor" as const, name: `Labor — ${h} hr`, quantity: h, unitPriceCents: rateCents!, brand: "", partNumber: "", providerUnitCostCents: null, supplier: "", laborHours: h, laborRateCents: rateCents! }
                    : { kind: "labor" as const, name: "Labor", quantity: 1, unitPriceCents: manualCents!, brand: "", partNumber: "", providerUnitCostCents: null, supplier: "", laborHours: h > 0 ? h : null, laborRateCents: null },
                ]
              : []),
            ...feeLines.map((f) => ({ kind: "fee" as const, name: f.name.trim(), quantity: 1, unitPriceCents: f.pr!, brand: "", partNumber: "", providerUnitCostCents: null, supplier: "", laborHours: null, laborRateCents: null })),
          ],
        },
      }),
    onSuccess: () => {
      toast.success("Quote sent to the driver.");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const stepValid = [true, partsValid, laborValid, feesValid && taxCents !== null, true][step];
  const canSend = partsValid && laborValid && feesValid && taxCents !== null && total > 0 && (parts.length === 0 || fitment);
  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") || "Vehicle";
  const patchPart = (i: number, p: Partial<PartRow>) => setParts((rows) => rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <div className="mt-6 space-y-5 rounded-2xl border border-border/60 bg-card p-5">
      <ProgressStepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="space-y-2 text-sm">
          <p className="text-base font-semibold text-foreground">{vehicleLabel}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Engine</dt><dd>{vehicle.engine ?? "Not provided"}</dd>
            <dt className="text-muted-foreground">Fuel</dt><dd className="capitalize">{vehicle.fuelType ?? "Not provided"}</dd>
            <dt className="text-muted-foreground">Drivetrain</dt><dd>{vehicle.drivetrain ?? "Not provided"}</dd>
            <dt className="text-muted-foreground">Mileage</dt><dd>{mileage ? `${mileage.toLocaleString()} mi` : "Not provided"}</dd>
            <dt className="text-muted-foreground">Service</dt><dd>{services.join(", ") || "—"}</dd>
          </dl>
          {notes && <p className="whitespace-pre-line rounded-xl bg-secondary/60 p-3 text-foreground">{notes}</p>}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {suggestions.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Common for this service — tap to add what applies</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((s) => {
                  const added = parts.some((p) => p.name === s);
                  return (
                    <Button key={s} type="button" size="sm" variant={added ? "secondary" : "outline"} disabled={added} onClick={() => setParts((r) => [...r, emptyPart(s)])}>
                      {added ? "✓ " : "+ "}{s}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          {parts.map((p, i) => {
            const l = partLines[i]!;
            return (
              <div key={i} className="space-y-2 rounded-xl border border-border/60 p-3">
                <div className="flex gap-2">
                  <Input className="h-10" placeholder="Part name" value={p.name} maxLength={200} onChange={(e) => patchPart(i, { name: e.target.value })} aria-invalid={!p.name.trim()} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove part" onClick={() => setParts((r) => r.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input className="h-10" placeholder="Brand" value={p.brand} maxLength={120} onChange={(e) => patchPart(i, { brand: e.target.value })} />
                  <Input className="h-10" placeholder="Part # (if known)" value={p.partNumber} maxLength={120} onChange={(e) => patchPart(i, { partNumber: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Qty</Label>
                    <Input className="h-10" inputMode="decimal" value={p.qty} onChange={(e) => patchPart(i, { qty: e.target.value })} aria-invalid={l.q === null} />
                  </div>
                  <div>
                    <Label className="text-xs">Your cost (private)</Label>
                    <Input className="h-10" inputMode="decimal" placeholder="$0" value={p.cost} onChange={(e) => patchPart(i, { cost: e.target.value })} aria-invalid={l.c === null} />
                  </div>
                  <div>
                    <Label className="text-xs">Customer price</Label>
                    <Input className="h-10" inputMode="decimal" placeholder="$0" value={p.price} onChange={(e) => patchPart(i, { price: e.target.value })} aria-invalid={l.pr === null} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Fitment not verified — confirm before sending</p>
              </div>
            );
          })}
          <Button type="button" variant="outline" className="h-10" onClick={() => setParts((r) => [...r, emptyPart()])}>
            <Plus className="h-4 w-4" /> Add part
          </Button>
          <p className="text-sm text-muted-foreground">Parts subtotal {formatCents(partsTotal)}{partsCost > 0 ? ` · your cost ${formatCents(partsCost)}` : ""}</p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl bg-secondary/60 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Labor rate</span>
              {overrideRate ? (
                <Input aria-label="Labor rate for this quote" className="h-9 w-28" inputMode="decimal" placeholder="$0" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={rateCents === null} />
              ) : (
                <span className="font-medium text-foreground">{savedRate !== null ? `${formatCents(savedRate)} / hr` : "Not set"}</span>
              )}
            </div>
            <button type="button" className="mt-1 text-xs text-primary underline-offset-2 hover:underline" onClick={() => { if (overrideRate) setRate(savedRate !== null ? (savedRate / 100).toFixed(2) : ""); setOverrideRate((v) => !v); }}>
              {overrideRate ? "Use my saved rate" : savedRate !== null ? "Override for this quote only" : "Enter a rate for this quote"}
            </button>
          </div>

          {labor.map((row, i) => (
            <LaborOperationRow
              key={row.id}
              row={row}
              vehicle={vehicle}
              rateCents={rateCents}
              onChange={(patch) => setLabor((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))}
              onRemove={() => setLabor((rows) => rows.filter((_, j) => j !== i))}
            />
          ))}

          {operations.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Add a repair operation</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[...operations].sort((a, b) => Number(b.related) - Number(a.related)).slice(0, showAllOps ? undefined : 6).map((op) => {
                  const added = labor.some((l) => l.operationKey === op.key);
                  return (
                    <Button key={op.key} type="button" size="sm" variant={added ? "secondary" : "outline"} disabled={added} onClick={() => setLabor((r) => [...r, newLabor(op.key, op.name)])}>
                      {added ? "✓ " : "+ "}{op.name}
                    </Button>
                  );
                })}
                {operations.length > 6 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowAllOps((v) => !v)}>{showAllOps ? "Fewer" : "More…"}</Button>
                )}
              </div>
            </div>
          )}
          <Button type="button" variant="outline" className="h-10" onClick={() => setLabor((r) => [...r, newLabor(null, "")])}>
            <Plus className="h-4 w-4" /> Add other labor
          </Button>

          {!hasRate && (
            <div>
              <Label htmlFor="manualLabor">Labor amount</Label>
              <Input id="manualLabor" className="mt-1 h-11" inputMode="decimal" placeholder="$0" value={manualLabor} onChange={(e) => setManualLabor(e.target.value)} aria-invalid={manualCents === null} />
              <p className="mt-1 text-xs text-muted-foreground">No labor rate set — enter the labor total, or set a rate above to calculate it from hours.</p>
            </div>
          )}
          <p className="text-sm font-medium text-foreground">Labor total {formatCents(laborTotal)}{hasRate && laborHours > 0 ? ` · ${laborHours} hr × ${formatCents(rateCents!)}` : ""}</p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {fees.map((f, i) => (
            <div key={i} className="flex gap-2">
              <Input className="h-10" placeholder="Fee (e.g. shop supplies)" value={f.name} maxLength={200} onChange={(e) => setFees((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input className="h-10 w-28" inputMode="decimal" placeholder="$0" value={f.price} onChange={(e) => setFees((r) => r.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} aria-invalid={feeLines[i]!.pr === null} />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove fee" onClick={() => setFees((r) => r.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" className="h-10" onClick={() => setFees((r) => [...r, { name: "", price: "" }])}>
            <Plus className="h-4 w-4" /> Add fee
          </Button>
          <div>
            <Label htmlFor="tax">Tax</Label>
            <Input id="tax" className="mt-1 h-11" inputMode="decimal" placeholder="$0" value={tax} onChange={(e) => setTax(e.target.value)} aria-invalid={taxCents === null} />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-secondary/60 p-3">
            <p className="text-xs text-muted-foreground">Repara estimate: unavailable</p>
          </div>
          <dl className="grid grid-cols-2 gap-y-1">
            {partLines.map((p, i) => (
              <div key={i} className="contents">
                <dt className="text-muted-foreground">{p.name}{p.q !== 1 ? ` × ${p.q}` : ""}</dt>
                <dd className="text-right">{formatCents(Math.round((p.q ?? 0) * (p.pr ?? 0)))}</dd>
              </div>
            ))}
            <dt className="text-muted-foreground">Labor</dt><dd className="text-right">{formatCents(laborTotal)}</dd>
            {feeLines.map((f, i) => (
              <div key={i} className="contents">
                <dt className="text-muted-foreground">{f.name}</dt><dd className="text-right">{formatCents(f.pr ?? 0)}</dd>
              </div>
            ))}
            {(taxCents ?? 0) > 0 && (<><dt className="text-muted-foreground">Tax</dt><dd className="text-right">{formatCents(taxCents!)}</dd></>)}
          </dl>
          <p className="text-base font-semibold text-foreground">Customer total {formatCents(total)}</p>
          {partsCost > 0 && <p className="text-xs text-muted-foreground">Private to you: parts cost {formatCents(partsCost)} — the customer never sees this.</p>}
          <div>
            <Label htmlFor="timeframe">Estimated completion time</Label>
            <Input id="timeframe" className="mt-1 h-11" maxLength={200} value={timeframe} onChange={(e) => setTimeframe(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="warranty">Warranty</Label>
            <Input id="warranty" className="mt-1 h-11" maxLength={500} value={warranty} onChange={(e) => setWarranty(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="notes">Notes for the driver</Label>
            <Textarea id="notes" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {parts.length > 0 && (
            <label className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
              <Checkbox checked={fitment} onCheckedChange={(v) => setFitment(v === true)} className="mt-0.5" />
              <span>I confirmed these parts fit this vehicle. Repara has not verified fitment.</span>
            </label>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" className="h-12" disabled={mut.isPending} onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}>
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" className="h-12" disabled={!stepValid} onClick={() => setStep((s) => s + 1)}>Next</Button>
        ) : (
          <Button type="button" className="h-12" disabled={!canSend || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : revising ? "Send revised quote" : "Send quote"}
          </Button>
        )}
      </div>
    </div>
  );
}
