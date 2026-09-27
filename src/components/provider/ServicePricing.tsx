import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getMyServicePricing, saveServicePrice, type ServicePrice } from "@/lib/messaging.functions";
import { formatCents, parseDollars } from "@/lib/money";
import { serviceCategoryLabel } from "@/lib/service-network";

const MODES: { key: ServicePrice["pricingMode"]; label: string }[] = [
  { key: "fixed", label: "Fixed" },
  { key: "starting_at", label: "Starting at" },
  { key: "range", label: "Range" },
  { key: "quote", label: "Contact for quote" },
];

export function priceSummary(s: ServicePrice) {
  if (s.pricingMode === "quote" || s.priceCents === null) return "Contact for quote";
  if (s.pricingMode === "fixed") return `Fixed — ${formatCents(s.priceCents)}`;
  if (s.pricingMode === "starting_at") return `Starting at ${formatCents(s.priceCents)}`;
  return `${formatCents(s.priceCents)}–${formatCents(s.priceMaxCents ?? s.priceCents)}`;
}

/** Quick per-service preset editor. Presets are reusable defaults, never quotes. */
export function ServicePricing() {
  const load = useServerFn(getMyServicePricing);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["my-service-pricing"], queryFn: () => load({}) });
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-32 w-full rounded-2xl" />;
  if (isError)
    return (
      <p className="rounded-2xl border border-border/70 bg-card p-5 text-sm">
        Couldn't load your services. <button className="text-primary" onClick={() => void refetch()}>Try again</button>
      </p>
    );
  const services = data?.services ?? [];
  if (!services.length)
    return <p className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">Select services on your profile first.</p>;

  return (
    <div className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card">
      {services.map((s) => (
        <div key={s.categoryKey} className="p-4">
          <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(open === s.categoryKey ? null : s.categoryKey)}>
            <span>
              <span className="block text-sm font-medium text-foreground">{serviceCategoryLabel(s.categoryKey, "en") ?? s.categoryKey}</span>
              <span className="text-xs text-muted-foreground">{s.isActive ? priceSummary(s) : "Inactive"}</span>
            </span>
            <span className="text-xs text-primary">{open === s.categoryKey ? "Close" : "Edit"}</span>
          </button>
          {open === s.categoryKey && <PriceEditor service={s} onDone={() => setOpen(null)} />}
        </div>
      ))}
    </div>
  );
}

function PriceEditor({ service, onDone }: { service: ServicePrice; onDone: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveServicePrice);
  const [f, setF] = useState({
    isActive: service.isActive,
    mode: service.pricingMode,
    price: service.priceCents !== null ? (service.priceCents / 100).toString() : "",
    max: service.priceMaxCents !== null ? (service.priceMaxCents / 100).toString() : "",
    hours: service.durationMinutes ? (service.durationMinutes / 60).toString() : "",
    notes: service.notes ?? "",
  });
  useEffect(() => undefined, []);
  const mut = useMutation({
    mutationFn: () => {
      const price = f.price ? parseDollars(f.price) : null;
      const max = f.max ? parseDollars(f.max) : null;
      const hours = f.hours ? Number(f.hours) : null;
      return save({
        data: {
          categoryKey: service.categoryKey,
          isActive: f.isActive,
          pricingMode: f.mode,
          priceCents: price,
          priceMaxCents: max,
          durationMinutes: hours && Number.isFinite(hours) ? Math.round(hours * 60) : null,
          notes: f.notes || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Saved.");
      void qc.invalidateQueries({ queryKey: ["my-service-pricing"] });
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mt-3 space-y-3">
      <label className="flex items-center justify-between text-sm">
        Active <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
      </label>
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setF({ ...f, mode: m.key })}
            className={`rounded-full border px-3 py-1.5 text-xs ${f.mode === m.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {f.mode !== "quote" && (
        <div className="grid grid-cols-2 gap-2">
          <Input inputMode="decimal" placeholder={f.mode === "range" ? "From $" : "Price $"} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="h-11" />
          {f.mode === "range" && (
            <Input inputMode="decimal" placeholder="To $" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} className="h-11" />
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Input inputMode="decimal" placeholder="Duration (hours)" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} className="h-11" />
        <Input placeholder="Notes (optional)" maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="h-11" />
      </div>
      <Button className="h-11 w-full" disabled={mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
