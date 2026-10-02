import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardSkeletons, LoadError } from "@/components/garage/GarageSkeletons";
import { Button } from "@/components/ui/button";
import { createProviderAlert, driverInviteProviders, matchProvidersForRequest } from "@/lib/provider-quotes.functions";
import { serviceCategoryLabel } from "@/lib/service-network";
import { cn } from "@/lib/utils";
import { formatDistance } from "@/lib/geo/geo";

/** Potential providers for a request — matched by service and ZIP, never ranked. */
export function ProviderMatch({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(matchProvidersForRequest);
  const invite = useServerFn(driverInviteProviders);
  const alert = useServerFn(createProviderAlert);
  const [picked, setPicked] = useState<string[]>([]);
  // undefined = use the preference saved on the request; null = closest first (nearby).
  const [maxMiles, setMaxMiles] = useState<10 | 25 | 50 | null | undefined>(undefined);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["provider-match", requestId, maxMiles ?? "saved"],
    queryFn: () => load({ data: { requestId, ...(maxMiles !== undefined ? { maxMiles } : {}) } }),
  });
  const activeMiles = maxMiles !== undefined ? maxMiles : (data?.maxMiles ?? null);
  const distanceFilter = (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Provider distance</p>
      <div className="flex flex-wrap gap-2">
        {([null, 10, 25, 50] as const).map((m) => (
          <button
            key={String(m)}
            type="button"
            onClick={() => setMaxMiles(m)}
            aria-pressed={activeMiles === m}
            className={cn(
              "h-9 rounded-full border px-3 text-xs",
              activeMiles === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
            )}
          >
            {m == null ? "Closest first" : `Within ${m} miles`}
          </button>
        ))}
      </div>
    </div>
  );

  const inviteMut = useMutation({
    mutationFn: () => invite({ data: { requestId, providerIds: picked } }),
    onSuccess: async () => {
      toast.success("Sent. Providers will reply with actual quotes.");
      setPicked([]);
      await queryClient.invalidateQueries({ queryKey: ["my-request", requestId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const alertMut = useMutation({
    mutationFn: () => alert({ data: { requestId, categories: data?.categories ?? [] } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["provider-match", requestId] }),
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <CardSkeletons rows={2} />;
  if (isError || !data) return <LoadError message="Couldn't look up providers right now." onRetry={() => void refetch()} />;

  if (data.providers.length === 0) {
    return (
      <div className="space-y-3">
      {distanceFilter}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <p className="text-sm font-medium text-foreground">We don't have a provider for this service in your area yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">Repara will keep reviewing your request.</p>
        {data.alertActive ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-primary">
            <Check className="h-4 w-4" /> We'll notify you when a provider becomes available.
          </p>
        ) : (
          <Button variant="outline" className="mt-3 h-11 w-full" disabled={alertMut.isPending} onClick={() => alertMut.mutate()}>
            {alertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Notify me when a provider becomes available
          </Button>
        )}
      </div>
      </div>
    );
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 5 ? [...p, id] : p));

  return (
    <div className="space-y-2">
      {distanceFilter}
      <p className="text-sm text-muted-foreground">Choose who should quote this work (up to 5). Sorted by approximate distance — closer isn't always better, so compare quotes.</p>
      {data.providers.map((p) => {
        const on = picked.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            aria-pressed={on}
            className={cn(
              "flex w-full items-start justify-between gap-3 rounded-2xl border bg-card p-4 text-left transition-colors",
              on ? "border-primary" : "border-border/60",
            )}
          >
            <span className="min-w-0">
              <span className="block text-base font-semibold text-foreground">{p.name}</span>
              <span className="block text-xs text-muted-foreground">
                {p.services.map((s) => serviceCategoryLabel(s, "en")).join(", ")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {[
                  p.mode === "mobile"
                    ? `Mobile service${p.travelRadiusMiles ? ` · Travels up to ${p.travelRadiusMiles} miles` : ""}`
                    : p.mode === "in_shop"
                      ? "Visit this provider"
                      : "Service area not confirmed",
                  formatDistance(p.distanceMiles),
                  p.area,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className={cn("mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
              {on ? <Check className="h-3 w-3" /> : null}
            </span>
          </button>
        );
      })}
      <Button className="h-12 w-full" disabled={!picked.length || inviteMut.isPending} onClick={() => inviteMut.mutate()}>
        {inviteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Request quotes{picked.length ? ` from ${picked.length}` : ""}
      </Button>
    </div>
  );
}
