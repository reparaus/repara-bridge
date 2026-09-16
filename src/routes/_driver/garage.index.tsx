import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Plus } from "lucide-react";

import { GarageShell, SectionTitle, StatusDot } from "@/components/garage/GarageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getGarageHome } from "@/lib/garage.functions";

export const Route = createFileRoute("/_driver/garage/")({
  head: () => ({
    meta: [
      { title: "My Garage — Repara" },
      {
        name: "description",
        content: "Your vehicles, upcoming maintenance, recall information and service history in one calm place.",
      },
      { property: "og:title", content: "My Garage — Repara" },
      { property: "og:description", content: "Your car, understood." },
    ],
  }),
  component: GarageHome,
});

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function GarageHome() {
  const load = useServerFn(getGarageHome);
  const claim = useServerFn(claimMyRequests);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["garage-home"], queryFn: () => load({}) });

  /**
   * Links requests this driver submitted as a guest. Contact details must match
   * the account, so a VIN alone never claims someone else's request.
   */
  useEffect(() => {
    if (!data?.vehicles.length) return;
    void claim({})
      .then((result) => {
        if (result.claimed > 0) void queryClient.invalidateQueries({ queryKey: ["garage-home"] });
      })
      .catch(() => undefined);
  }, [claim, data?.vehicles.length, queryClient]);

  return (
    <GarageShell>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {greeting()}
        {data?.profile.firstName ? `, ${data.profile.firstName}` : ""}
      </h1>

      <div className="mt-8">
        <SectionTitle>My garage</SectionTitle>

        {isLoading && <Skeleton className="h-36 w-full rounded-2xl" />}

        {!isLoading && data?.vehicles.length === 0 && (
          <div className="rounded-2xl border border-border/70 bg-card p-6 text-center">
            <p className="text-base font-medium text-foreground">Your garage is empty.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your vehicle and Repara will help you keep track of it.
            </p>
            <Button asChild className="mt-4 h-12 w-full text-base sm:w-auto">
              <Link to="/garage/add">Add my car</Link>
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {data?.vehicles.map((vehicle) => (
            <Link
              key={vehicle.id}
              to="/garage/vehicle/$id"
              params={{ id: vehicle.id }}
              className="block rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:border-border"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold leading-tight text-foreground">
                    {vehicle.nickname ?? vehicle.label}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {vehicle.currentMileage
                      ? `${vehicle.currentMileage.toLocaleString()} mi`
                      : "Mileage not added yet"}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm">
                <StatusDot tone={vehicle.status.tone} />
                <span className="text-foreground">{vehicle.status.label}</span>
              </div>

              {vehicle.recallCount > 0 && (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
                  Recall information available
                </p>
              )}

              {vehicle.nextService ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Next service: {vehicle.nextService.label} · {vehicle.nextService.detail}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Maintenance information isn't available for this vehicle yet.
                </p>
              )}
            </Link>
          ))}
        </div>

        {!!data?.vehicles.length && (
          <Button asChild variant="outline" className="mt-3 h-12 w-full">
            <Link to="/garage/add">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add vehicle
            </Link>
          </Button>
        )}
      </div>

      <div className="mt-10">
        <SectionTitle>Ask Repara</SectionTitle>
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <p className="text-base text-foreground">Anything going on with your car?</p>
          <Button asChild variant="secondary" className="mt-3 h-12 w-full">
            <Link to="/garage/ask">Describe a problem</Link>
          </Button>
        </div>
      </div>
    </GarageShell>
  );
}
