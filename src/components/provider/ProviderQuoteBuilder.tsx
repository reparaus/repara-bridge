import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ProgressStepper } from "@/components/common/ProgressStepper";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, parseDollars } from "@/lib/money";
import { getLaborSuggestions, getPricingSettings, getRepairOperations, saveLaborDefault, type LaborSource, type LaborSuggestion } from "@/lib/labor.functions";
import { relatedCategories, suggestParts } from "@/lib/part-suggestions";
import { submitProviderQuoteLines } from "@/lib/provider-quotes.functions";

type Vehicle = { year: number | null; make: string | null; model: string | null; trim: string | null; engine: string | null; fuelType: string | null; drivetrain: string | null };
type PartRow = { name: string; brand: string; partNumber: string; qty: string; cost: string; price: string };
type FeeRow = { name: string; price: string };
type LaborRow = { id: number; operationKey: string | null; name: string; hours: string; source: LaborSource; suggestedHours: number | null };

let laborSeq = 0;
const newLabor = (operationKey: string | null, name: string): LaborRow => ({ id: ++laborSeq, operationKey, name, hours: "", source: "manual", suggestedHours: null });

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
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [rate, setRate] = useState(laborRateCents !== null ? (laborRateCents / 100).toFixed(2) : "");
  const [overrideRate, setOverrideRate] = useState(laborRateCents === null);
  const [showAllOps, setShowAllOps] = useState(false);
  const [showWarranty, setShowWarranty] = useState(false);
  const [manualLabor, setManualLabor] = useState(presetLaborCents ? (presetLaborCents / 100).toFixed(2) : "");
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [tax, setTax] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [warranty, setWarranty] = useState("");
  const [note, setNote] = useState("");
  const [fitment, setFitment] = useState(false);
  const suggestions = useMemo(() => suggestParts(categoryKey, services), [categoryKey, services]);
  const cats = useMemo(() => relatedCategories(categoryKey, services), [categoryKey, services]);
  const loadOps = useServerFn(getRepairOperations);
  const loadPricing = useServerFn(getPricingSettings);
  const opsQ = useQuery({ queryKey: ["repair-operations", cats], queryFn: () => loadOps({ data: { categoryKeys: cats } }), staleTime: 5 * 60_000 });
  const pricingQ = useQuery({ queryKey: ["pricing-settings"], queryFn: () => loadPricing({}) });
  const operations = opsQ.data ?? [];
  const pricing = pricingQ.data;
  const savedRate = pricing?.laborRateCents ?? laborRateCents;

  // Pre-add the operations that clearly match this request (provider can remove them).
  useEffect(() => {
    if (!opsQ.data || labor.length) return;
    const related = opsQ.data.filter((o) => o.related);
    if (related.length === 1) setLabor([newLabor(related[0]!.key, related[0]!.name)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opsQ.data]);

  const partLines = parts.map((p) => ({ ...p, q: qtyOf(p.qty), c: p.cost.trim() ? parseDollars(p.cost) : 0, pr: parseDollars(p.price) }));
  const partsValid = partLines.every((p) => p.name.trim() && p.q !== null && p.c !== null && p.pr !== null);
  const partsTotal = partLines.reduce((a, p) => a + Math.round((p.q ?? 0) * (p.pr ?? 0)), 0);
  const partsCost = partLines.reduce((a, p) => a + Math.round((p.q ?? 0) * (p.c ?? 0)), 0);

  const rateCents = overrideRate ? parseDollars(rate) : savedRate;
  const hasRate = rateCents !== null && rateCents > 0;
  const laborLines = labor.map((l) => ({ ...l, h: l.hours.trim() ? Number(l.hours) : 0 }));
  const laborHours = Math.round(laborLines.reduce((a, l) => a + (Number.isFinite(l.h) ? l.h : 0), 0) * 100) / 100;
  const manualCents = parseDollars(manualLabor);
  const laborTotal = hasRate
    ? laborLines.reduce((a, l) => a + (l.h > 0 ? Math.round(l.h * rateCents!) : 0), 0)
    : (manualCents ?? 0);
  const laborValid =
    rateCents !== null &&
    manualCents !== null &&
    laborLines.every((l) => l.name.trim() && Number.isFinite(l.h) && l.h >= 0 && (!hasRate || l.h > 0));

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
          warranty: showWarranty ? warranty : "",
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
            ...(hasRate
              ? laborLines.filter((l) => l.h > 0).map((l) => ({
                  kind: "labor" as const,
                  name: `${l.name.trim()} — ${l.h} hr`,
                  quantity: l.h,
                  unitPriceCents: rateCents!,
                  brand: "", partNumber: "", providerUnitCostCents: null, supplier: "",
                  laborHours: l.h,
                  laborRateCents: rateCents!,
                  operationKey: l.operationKey,
                  laborTimeSource: l.source,
                  suggestedLaborHours: l.suggestedHours,
                }))
              : laborTotal > 0
                ? [{
                    kind: "labor" as const,
                    name: laborLines.map((l) => l.name.trim()).filter(Boolean).join(", ") || "Labor",
                    quantity: 1,
                    unitPriceCents: manualCents!,
                    brand: "", partNumber: "", providerUnitCostCents: null, supplier: "",
                    laborHours: laborHours > 0 ? laborHours : null,
                    laborRateCents: null,
                    operationKey: laborLines.length === 1 ? laborLines[0]!.operationKey : null,
                    laborTimeSource: laborLines.length === 1 ? laborLines[0]!.source : null,
                    suggestedLaborHours: laborLines.length === 1 ? laborLines[0]!.suggestedHours : null,
                  }]
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
          <div className="flex flex-wrap gap-2">
            {pricing?.defaultShopSuppliesCents ? (
              <Button type="button" size="sm" variant="outline" disabled={fees.some((f) => f.name === "Shop supplies")} onClick={() => setFees((r) => [...r, { name: "Shop supplies", price: (pricing.defaultShopSuppliesCents! / 100).toFixed(2) }])}>
                + Shop supplies {formatCents(pricing.defaultShopSuppliesCents)}
              </Button>
            ) : null}
            {pricing?.defaultDisposalFeeCents ? (
              <Button type="button" size="sm" variant="outline" disabled={fees.some((f) => f.name === "Disposal / environmental fee")} onClick={() => setFees((r) => [...r, { name: "Disposal / environmental fee", price: (pricing.defaultDisposalFeeCents! / 100).toFixed(2) }])}>
                + Disposal fee {formatCents(pricing.defaultDisposalFeeCents)}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={() => setFees((r) => [...r, { name: "", price: "" }])}>
              <Plus className="h-4 w-4" /> Add fee
            </Button>
          </div>
          {fees.length === 0 && <p className="text-xs text-muted-foreground">No fees on this quote. Fees are optional.</p>}
          <div>
            <Label htmlFor="tax">Tax</Label>
            <Input id="tax" className="mt-1 h-11" inputMode="decimal" placeholder="$0" value={tax} onChange={(e) => setTax(e.target.value)} aria-invalid={taxCents === null} />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-base font-semibold text-foreground">{vehicleLabel}</p>
            {labor.length > 0 && <p className="text-muted-foreground">{labor.map((l) => l.name).filter(Boolean).join(" · ")}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-y-1 rounded-xl bg-secondary/60 p-3">
            <dt className="text-muted-foreground">Parts</dt><dd className="text-right">{formatCents(partsTotal)}</dd>
            <dt className="text-muted-foreground">Labor{hasRate && laborHours > 0 ? ` (${laborHours} hr)` : ""}</dt><dd className="text-right">{formatCents(laborTotal)}</dd>
            <dt className="text-muted-foreground">Fees</dt><dd className="text-right">{formatCents(feesTotal)}</dd>
            <dt className="text-muted-foreground">Tax</dt><dd className="text-right">{formatCents(taxCents ?? 0)}</dd>
            <dt className="border-t border-border/60 pt-1 font-semibold text-foreground">Total</dt>
            <dd className="border-t border-border/60 pt-1 text-right font-semibold text-foreground">{formatCents(total)}</dd>
          </dl>
          {partsCost > 0 && <p className="text-xs text-muted-foreground">Private to you: parts cost {formatCents(partsCost)} — the customer never sees this.</p>}
          <div>
            <Label htmlFor="timeframe">Estimated completion</Label>
            <Input id="timeframe" className="mt-1 h-11" maxLength={200} value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="e.g. ~45 minutes, same day" />
          </div>
          {showWarranty ? (
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="warranty">Warranty</Label>
                <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => { setShowWarranty(false); setWarranty(""); }}>Remove</button>
              </div>
              <Input id="warranty" className="mt-1 h-11" maxLength={500} value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="e.g. 12 months / 12,000 miles" />
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => { setShowWarranty(true); if (!warranty && pricing?.defaultWarranty) setWarranty(pricing.defaultWarranty); }}>
              <Plus className="h-4 w-4" /> Add warranty (optional)
            </Button>
          )}
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

const SOURCE_LABEL: Record<LaborSource, string> = {
  licensed: "Licensed labor data",
  reference: "Reference estimate",
  repara_observed: "Repara observed average",
  provider_default: "Your default",
  manual: "Entered by you",
};

function LaborOperationRow({
  row,
  vehicle,
  rateCents,
  onChange,
  onRemove,
}: {
  row: LaborRow;
  vehicle: Vehicle;
  rateCents: number | null;
  onChange: (patch: Partial<LaborRow>) => void;
  onRemove: () => void;
}) {
  const load = useServerFn(getLaborSuggestions);
  const saveDefault = useServerFn(saveLaborDefault);
  const q = useQuery({
    queryKey: ["labor-suggestions", row.operationKey, vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.engine, vehicle.drivetrain],
    enabled: Boolean(row.operationKey),
    queryFn: () =>
      load({ data: { operationKey: row.operationKey!, vehicle: { year: vehicle.year, make: vehicle.make, model: vehicle.model, trim: vehicle.trim, engine: vehicle.engine, drivetrain: vehicle.drivetrain } } }),
    staleTime: 5 * 60_000,
  });
  const defMut = useMutation({
    mutationFn: (hours: number) => saveDefault({ data: { operationKey: row.operationKey!, hours } }),
    onSuccess: () => { toast.success("Saved as your default time for this job."); void q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const list: LaborSuggestion[] = q.data ?? [];
  const primary = list[0] ?? null;
  const h = row.hours.trim() ? Number(row.hours) : 0;
  const hoursInvalid = !Number.isFinite(h) || h < 0 || (rateCents !== null && rateCents > 0 && row.hours.trim() !== "" && h === 0);

  const note = (s: LaborSuggestion) =>
    s.isTestData ? "Test data — not an official labor time" : s.isWarrantyTime ? "Warranty time — real-world time is often longer" : s.source === "provider_default" ? "Your saved time" : "Verify before sending";

  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-3">
      <div className="flex gap-2">
        {row.operationKey ? (
          <p className="flex-1 self-center text-sm font-medium text-foreground">{row.name}</p>
        ) : (
          <Input className="h-10" placeholder="Labor description" value={row.name} maxLength={160} onChange={(e) => onChange({ name: e.target.value })} aria-invalid={!row.name.trim()} />
        )}
        <Button type="button" variant="ghost" size="icon" aria-label="Remove labor" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {row.operationKey && (
        q.isLoading ? (
          <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Looking for a labor time…</p>
        ) : primary ? (
          <div className="rounded-lg bg-secondary/60 p-3 text-sm">
            <p className="text-xs text-muted-foreground">Suggested labor time</p>
            <p className="text-lg font-semibold text-foreground">{primary.hours} hr</p>
            <p className="text-xs text-muted-foreground">{SOURCE_LABEL[primary.source]} — {note(primary)}</p>
            {list.length > 1 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {list.slice(1).map((s) => (
                  <li key={s.source}>
                    <button type="button" className="hover:underline" onClick={() => onChange({ hours: String(s.hours), source: s.source, suggestedHours: s.hours })}>
                      {SOURCE_LABEL[s.source]}: {s.hours} hr{s.sampleSize ? ` (${s.sampleSize} jobs)` : ""}{s.isTestData ? " · test data" : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" onClick={() => onChange({ hours: String(primary.hours), source: primary.source, suggestedHours: primary.hours })}>
                Use {primary.hours} hr
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No labor time available yet. Enter your labor time below.</p>
        )
      )}

      <div className="grid grid-cols-2 items-end gap-2">
        <div>
          <Label className="text-xs" htmlFor={`hours-${row.id}`}>Labor hours</Label>
          <Input
            id={`hours-${row.id}`}
            className="h-10"
            inputMode="decimal"
            placeholder="0.0"
            value={row.hours}
            onChange={(e) => onChange({ hours: e.target.value, source: row.suggestedHours !== null && Number(e.target.value) === row.suggestedHours ? row.source : "manual" })}
            aria-invalid={hoursInvalid}
          />
        </div>
        <p className="pb-2 text-right text-sm text-foreground">
          {rateCents && h > 0 ? `${h} hr × ${formatCents(rateCents)} = ${formatCents(Math.round(h * rateCents))}` : ""}
        </p>
      </div>
      {row.operationKey && h > 0 && row.source === "manual" && (
        <button type="button" className="text-xs text-primary hover:underline" disabled={defMut.isPending} onClick={() => defMut.mutate(h)}>
          Save {h} hr as my default for this job
        </button>
      )}
    </div>
  );
}
