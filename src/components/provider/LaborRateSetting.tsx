import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDollars } from "@/lib/money";
import { getLaborRate, saveLaborRate } from "@/lib/provider-quotes.functions";

/** Optional hourly rate. Left empty, quotes use a manual labor amount. */
export function LaborRateSetting() {
  const qc = useQueryClient();
  const load = useServerFn(getLaborRate);
  const save = useServerFn(saveLaborRate);
  const q = useQuery({ queryKey: ["labor-rate"], queryFn: () => load({}) });
  const [value, setValue] = useState("");
  useEffect(() => {
    if (q.data) setValue(q.data.laborRateCents === null ? "" : (q.data.laborRateCents / 100).toFixed(2));
  }, [q.data]);
  const parsed = parseDollars(value);
  const mut = useMutation({
    mutationFn: () => save({ data: { laborRateCents: value.trim() ? parsed : null } }),
    onSuccess: () => {
      toast.success("Labor rate saved.");
      void qc.invalidateQueries({ queryKey: ["labor-rate"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-sm text-muted-foreground">Used to calculate labor (hours × rate) when you build a quote. Leave empty to enter labor amounts manually.</p>
      <div className="mt-3 flex gap-2">
        <Input inputMode="decimal" placeholder="$0 / hr" className="h-11" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={parsed === null} disabled={q.isLoading} />
        <Button className="h-11" disabled={mut.isPending || parsed === null} onClick={() => mut.mutate()}>
          {mut.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
