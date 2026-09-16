import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { GarageShell, SectionTitle } from "@/components/garage/GarageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getGarageHome } from "@/lib/garage.functions";

/**
 * Find Service — V1 deliberately routes into the EXISTING Repara service-request
 * flow. No marketplace, no fabricated partner shops, no invented availability or
 * pricing. The layout leaves room for real shop options once they exist.
 */
export const Route = createFileRoute("/_driver/garage/service")({
  validateSearch: (search: Record<string, unknown>): { vehicle?: string } =>
    typeof search.vehicle === "string" ? { vehicle: search.vehicle } : {},
  head: () => ({
    meta: [
      { title: "Find service — Repara" },
      {
        name: "description",
        content: "Request service for a vehicle already in your Repara garage — no need to re-enter anything.",
      },
      { property: "og:title", content: "Find service — Repara" },
      { property: "og:description", content: "Request service using the vehicle Repara already knows." },
    ],
  }),
  component: FindService,
});

function FindService() {
  const { vehicle: vehicleParam } = Route.useSearch();
  const load = useServerFn(getGarageHome);
  const { data, isLoading } = useQuery({ queryKey: ["garage-home"], queryFn: () => load({}) });
  const [selected, setSelected] = useState<string | null>(vehicleParam ?? null);

  const vehicles = data?.vehicles ?? [];
  const vehicleId = selected ?? vehicles.find((v) => v.isPrimary)?.id ?? vehicles[0]?.id ?? null;

  if (isLoading) {
    return (
      <GarageShell>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </GarageShell>
    );
  }

  return (
    <GarageShell>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Find service</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tell Repara what your vehicle needs. We'll use the vehicle details already in your garage.
      </p>

      {vehicles.length > 1 && (
        <div className="mt-5">
          <SectionTitle>Which vehicle?</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelected(v.id)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  v.id === vehicleId
                    ? "border-primary bg-secondary text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {v.nickname ?? v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {vehicleId ? (
          <Button asChild className="h-12 w-full text-base">
            <Link to="/quote" search={{ v: vehicleId }}>
              Request service with Repara
            </Link>
          </Button>
        ) : (
          <Button asChild className="h-12 w-full text-base">
            <Link to="/garage/add">Add my car first</Link>
          </Button>
        )}
        <Button asChild variant="outline" className="h-12 w-full">
          <Link to="/garage/ask" search={vehicleId ? { vehicle: vehicleId } : {}}>
            Not sure what's wrong? Ask Repara
          </Link>
        </Button>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Repara is building its network of participating shops. For now every request goes through Repara.
      </p>
    </GarageShell>
  );
}
