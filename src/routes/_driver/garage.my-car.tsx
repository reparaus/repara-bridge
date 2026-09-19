import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";

import { GarageShell } from "@/components/garage/GarageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getGarageHome } from "@/lib/garage.functions";

/**
 * "My Car" tab. Opens the driver's primary vehicle directly, so the tab bar can
 * stay static while the destination follows whichever vehicle is primary.
 */
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
    ],
  }),
  component: MyCar,
});

function MyCar() {
  const load = useServerFn(getGarageHome);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["garage-home"], queryFn: () => load({}) });

  const primary = data?.vehicles.find((v) => v.isPrimary) ?? data?.vehicles[0];

  useEffect(() => {
    if (primary) void navigate({ to: "/garage/vehicle/$id", params: { id: primary.id }, replace: true });
  }, [navigate, primary]);

  return (
    <GarageShell>
      {isLoading || primary ? (
        <Skeleton className="h-48 w-full rounded-3xl" />
      ) : (
        <div className="rounded-3xl border border-border/60 bg-card p-6 text-center">
          <p className="text-base font-medium text-foreground">No vehicle yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your car and Repara will keep track of it for you.
          </p>
          <Button asChild className="mt-4 h-12 w-full text-base sm:w-auto">
            <Link to="/garage/add">Add my car</Link>
          </Button>
        </div>
      )}
    </GarageShell>
  );
}
