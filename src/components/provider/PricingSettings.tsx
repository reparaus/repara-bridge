import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPricingSettings, savePricingSettings } from "@/lib/labor.functions";
import { parseDollars } from "@/lib/money";

const toDollars = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));
const optionalCents = (s: string) => (s.trim() ? parseDollars(s) : null);

/** Provider's own pricing defaults: labor rate plus optional fee/warranty defaults. */
export function PricingSettings() {
  const qc = useQueryClient();
  const load = useServerFn(getPricingSettings);
  const save = useServerFn(savePricingSettings);
  const q = useQuery({ queryKey: ["pricing-settings"], queryFn: () => load({}) });
  const [rate, setRate] = useState("");
  const [supplies, setSupplies] = useState("");
  const [disposal, setDisposal] = useState("");
  const [warranty, setWarranty] = useState("");

  useEffect(() => {
    if (!q.data) return;
    setRate(toDollars(q.data.laborRateCents));
    setSupplies(toDollars(q.data.defaultShopSuppliesCents));
    setDisposal(toDollars(q.data.defaultDisposalFeeCents));
    setWarranty(q.data.defaultWarranty ?? "");
  }, [q.data]);

  const rateC = optionalCents(rate);
  const suppliesC = optionalCents(supplies);
  const disposalC = optionalCents(disposal);
  const invalid = (rate.trim() && rateC === null) || (supplies.trim() && suppliesC === null) || (disposal.trim() && disposalC === null);

  const mut = useMutation({
    mutationFn: () =>
      save({ data: { laborRateCents: rateC, defaultShopSuppliesCents: suppliesC, defaultDisposalFeeCents: disposalC, defaultWarranty: warranty.trim() || null } }),
    onSuccess: () => {
      toast.success("Pricing saved.");
      void qc.invalidateQueries({ queryKey: ["pricing-settings"] });
      void qc.invalidateQueries({ queryKey: ["labor-rate"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
      <div>
        <Label htmlFor="labor-rate">Standard labor rate</Label>
        <div className="mt-1 flex items-center gap-2">
          <Input id="labor-rate" inputMode="decimal" placeholder="$0.00" className="h-11" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={Boolean(rate.trim()) && rateC === null} disabled={q.isLoading} />
          <span className="shrink-0 text-sm text-muted-foreground">/ hr</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          This rate is used to automatically calculate labor on new quotes. You can change the labor time or override the rate on an individual quote.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="supplies">Shop supplies (optional)</Label>
          <Input id="supplies" inputMode="decimal" placeholder="$0" className="mt-1 h-11" value={supplies} onChange={(e) => setSupplies(e.target.value)} disabled={q.isLoading} />
        </div>
        <div>
          <Label htmlFor="disposal">Disposal fee (optional)</Label>
          <Input id="disposal" inputMode="decimal" placeholder="$0" className="mt-1 h-11" value={disposal} onChange={(e) => setDisposal(e.target.value)} disabled={q.isLoading} />
        </div>
      </div>
      <div>
        <Label htmlFor="def-warranty">Default warranty policy (optional)</Label>
        <Input id="def-warranty" maxLength={500} placeholder="e.g. 12 months / 12,000 miles parts & labor" className="mt-1 h-11" value={warranty} onChange={(e) => setWarranty(e.target.value)} disabled={q.isLoading} />
        <p className="mt-1 text-xs text-muted-foreground">Never added automatically. Offered only when you choose "Add warranty" on a quote.</p>
      </div>
      <p className="text-xs text-muted-foreground">Fee defaults are offered as one-tap additions on a quote; they're never added on their own.</p>
      <Button className="h-11 w-full sm:w-auto" disabled={mut.isPending || Boolean(invalid) || q.isLoading} onClick={() => mut.mutate()}>
        {mut.isPending ? "Saving…" : "Save pricing"}
      </Button>
    </div>
  );
}
