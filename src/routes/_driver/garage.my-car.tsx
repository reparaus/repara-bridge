import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { GarageShell } from "@/components/garage/GarageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
      {isLoading ? <Skeleton className="mt-6 h-48 w-full rounded-lg" /> : null}
      {isError ? (
        <div className="mt-6 border border-border bg-card p-5 text-center">
          <p className="text-sm text-foreground">Your vehicles could not be loaded.</p>
          <Button variant="outline" className="mt-3" onClick={() => void refetch()}>Try again</Button>
        </div>
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
      <div className="mt-6 space-y-3">
        {vehicles.map((vehicle) => (
          <Link key={vehicle.id} to="/garage/vehicle/$id" params={{ id: vehicle.id }} className="block border border-border bg-card p-5 transition-colors hover:border-primary">
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-semibold text-foreground">{vehicle.nickname ?? vehicle.label}</p><p className="mt-1 text-sm text-muted-foreground">{vehicle.currentMileage ? `${vehicle.currentMileage.toLocaleString()} mi` : "Mileage unknown"}</p></div>
              {vehicle.isPrimary ? <span className="text-xs text-primary">Primary</span> : null}
            </div>
          </Link>
        ))}
      </div>
    </GarageShell>
  );
}
