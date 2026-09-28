import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { GarageShell } from "@/components/garage/GarageShell";
import { VehicleVisual } from "@/components/garage/VehicleVisual";
import { formatMileage } from "@/lib/mileage";
import { Button } from "@/components/ui/button";
import { LoadError, RowSkeletons } from "@/components/garage/GarageSkeletons";
import { getGarageHome } from "@/lib/garage.functions";

export const Route = createFileRoute("/_driver/garage/my-car")({
  head: () => ({
    meta: [
      { title: "My Car — Repara" },
      {
        name: "description",
        content: "Your vehicle's mileage, maintenance, service history and vehicle information.",
      },
      { property: "og:title", content: "My Car — Repara" },
      { property: "og:description", content: "Your car, understood." },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyCar,
});

function MyCar() {
  const load = useServerFn(getGarageHome);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["garage-home"], queryFn: () => load({}) });
  const vehicles = data?.vehicles ?? [];

  return (
    <GarageShell>
      <h1 className="text-2xl font-semibold text-foreground">My Car</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose a vehicle to see its maintenance, history, and details.</p>
      {isLoading ? <RowSkeletons rows={2} className="mt-6" /> : null}
      {isError && !data ? (
        <LoadError message="Couldn't load your vehicles right now." onRetry={() => void refetch()} />
      ) : null}
      {!isLoading && !isError && !vehicles.length ? (
        <div className="rounded-3xl border border-border/60 bg-card p-6 text-center">
          <p className="text-base font-medium text-foreground">No vehicle yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your car and Repara will keep track of it for you.
          </p>
          <Button asChild className="mt-4 h-12 w-full text-base sm:w-auto">
            <Link to="/garage/add">Add my car</Link>
          </Button>
        </div>
      ) : null}
      <div className="mt-6 space-y-3 animate-in fade-in duration-200">
        {vehicles.map((vehicle) => (
          <Link
            key={vehicle.id}
            to="/garage/vehicle/$id"
            params={{ id: vehicle.id }}
            className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <VehicleVisual
              year={vehicle.year}
              make={vehicle.make}
              model={vehicle.model}
              trim={vehicle.trim}
              className="h-14 w-20 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-base font-semibold text-foreground">{vehicle.nickname ?? vehicle.label}</span>
                {vehicle.isPrimary ? (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">Primary</span>
                ) : null}
              </span>
              <span className="block text-sm text-muted-foreground">
                {vehicle.currentMileage
                  ? formatMileage(vehicle.currentMileage, vehicle.mileageConfidence)
                  : "Mileage not added yet"}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
    </GarageShell>
  );
}
