import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, ChevronRight, MessageCircle, Plus, Wrench } from "lucide-react";
import { useEffect } from "react";

import { GarageShell, SectionTitle, StatusDot } from "@/components/garage/GarageShell";
import { formatMileage, mileageBadge, mileageTone } from "@/lib/mileage";
import { buildProgressLine, useBuilds } from "@/components/garage/BuildsPanel";
import { VehicleVisual } from "@/components/garage/VehicleVisual";
import { Button } from "@/components/ui/button";
import { LoadError, RefreshingDot, RowSkeletons, VehicleHeroSkeleton } from "@/components/garage/GarageSkeletons";
import { claimMyRequests, getGarageHome } from "@/lib/garage.functions";

export const Route = createFileRoute("/_driver/garage/")({
  head: () => ({
    meta: [
      { title: "My Garage — Repara" },
      {
        name: "description",
        content: "Your vehicles, upcoming maintenance, recall information and service history in one calm place.",
      },
      { property: "og:title", content: "My Garage — Repara" },
      { property: "og:description", content: "Everything your car needs, in one place." },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

/** Provenance wording — an owner-entered record is never shown as verified. */
const SOURCE_LABEL: Record<string, string> = {
  repara_verified: "Repara Verified",
  owner_provided: "Owner Record",
  imported: "Imported History",
  connected_vehicle: "Connected Provider",
  document: "From a document",
};

function GarageHome() {
  const load = useServerFn(getGarageHome);
  const claim = useServerFn(claimMyRequests);
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({ queryKey: ["garage-home"], queryFn: () => load({}) });

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

  const vehicles = data?.vehicles ?? [];
  const primary = vehicles.find((v) => v.isPrimary) ?? vehicles[0];
  const others = vehicles.filter((v) => v.id !== primary?.id);
  const upcoming = vehicles.filter((v) => v.nextService);
  const activity = data?.recentActivity ?? [];

  return (
    <GarageShell>
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-[27px] font-semibold leading-tight tracking-tight text-foreground">
            Everything your car needs, in one place.
          </h1>
          <RefreshingDot active={isFetching && !isLoading} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {greeting()}
          {data?.profile.firstName ? `, ${data.profile.firstName}` : ""} — Your car, understood.
        </p>
      </header>

      {isLoading && (
        <>
          <VehicleHeroSkeleton />
          <RowSkeletons rows={2} className="mt-10" />
        </>
      )}

      {isError && !data && (
        <LoadError message="Couldn't load your garage right now." onRetry={() => void refetch()} />
      )}

      {!isLoading && !isError && !primary && (
        <div className="mt-6 rounded-3xl border border-border/60 bg-card p-6 text-center">
          <p className="text-base font-medium text-foreground">Your garage is empty.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your vehicle and Repara will help you keep track of it.
          </p>
          <Button asChild className="mt-4 h-12 w-full text-base sm:w-auto">
            <Link to="/garage/add">Add my car</Link>
          </Button>
        </div>
      )}

      {primary && (
        <section className="mt-6">
          <Link
            to="/garage/vehicle/$id"
            params={{ id: primary.id }}
            className="block overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md"
          >
            <VehicleVisual
              size="hero"
              year={primary.year}
              make={primary.make}
              model={primary.model}
              trim={primary.trim}
              className="rounded-b-none"
            />
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[19px] font-semibold leading-tight text-foreground">
                    {primary.nickname ?? primary.label}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {[primary.trim, primary.engine].filter(Boolean).join(" · ") || "Vehicle details"}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {primary.currentMileage
                      ? `${formatMileage(primary.currentMileage, primary.mileageConfidence)}${mileageBadge(mileageTone(primary.mileageSource, primary.mileageConfidence)) ? ` · ${mileageBadge(mileageTone(primary.mileageSource, primary.mileageConfidence))}` : ""}`
                      : "Mileage not added yet"}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm">
                <StatusDot tone={primary.currentMileage ? primary.status.tone : "unknown"} />
                <span className="text-foreground">
                  {primary.currentMileage ? primary.status.label : "Not enough information yet"}
                </span>
              </div>

              {primary.recallCount > 0 && (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
                  Recall information available for this year, make and model
                </p>
              )}
            </div>
          </Link>

          <ActiveBuildLine vehicleId={primary.id} />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Link
              to="/garage/ask"
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-border"
            >
              <MessageCircle className="h-5 w-5 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-semibold text-foreground">Ask Repara</span>
                <span className="block text-xs text-muted-foreground">What's going on with your car?</span>
              </span>
            </Link>
            <Link
              to="/garage/service"
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-border"
            >
              <Wrench className="h-5 w-5 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-semibold text-foreground">Service</span>
                <span className="block text-xs text-muted-foreground">Find someone to take care of it</span>
              </span>
            </Link>
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="mt-10">
          <SectionTitle>My garage</SectionTitle>
          <div className="space-y-3">
            {others.map((vehicle) => (
              <Link
                key={vehicle.id}
                to="/garage/vehicle/$id"
                params={{ id: vehicle.id }}
                className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-border"
              >
                <VehicleVisual
                  year={vehicle.year}
                  make={vehicle.make}
                  model={vehicle.model}
                  trim={vehicle.trim}
                  className="h-14 w-20 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-foreground">
                    {vehicle.nickname ?? vehicle.label}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {vehicle.currentMileage
                      ? `${formatMileage(vehicle.currentMileage, vehicle.mileageConfidence)}${mileageBadge(mileageTone(vehicle.mileageSource, vehicle.mileageConfidence)) ? ` · ${mileageBadge(mileageTone(vehicle.mileageSource, vehicle.mileageConfidence))}` : ""}`
                      : "Mileage not added yet"}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Upcoming</SectionTitle>
          <div className="space-y-2">
            {upcoming.map((vehicle) => (
              <div
                key={vehicle.id}
                className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4"
              >
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-foreground">{vehicle.nextService?.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {vehicle.nickname ?? vehicle.label} · {vehicle.nextService?.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activity.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Recent activity</SectionTitle>
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
            {activity.map((event) => (
              <div key={`${event.kind}-${event.id}`} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[event.date, event.detail].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {event.source && (
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {SOURCE_LABEL[event.source] ?? event.source}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {vehicles.length > 0 && (
        <Button asChild variant="outline" className="mt-6 h-12 w-full">
          <Link to="/garage/add">
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Add vehicle
          </Link>
        </Button>
      )}
    </GarageShell>
  );
}

/** Active build at a glance; hidden until the driver has one. */
function ActiveBuildLine({ vehicleId }: { vehicleId: string }) {
  const { data } = useBuilds(vehicleId);
  const active = data?.builds.find((b) => b.isActive);
  if (!active) return null;
  return (
    <Link
      to="/garage/build/$buildId"
      params={{ buildId: active.id }}
      className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-border animate-in fade-in duration-300"
    >
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">Active build</span>
        <span className="block truncate text-sm font-semibold text-foreground">{active.name}</span>
        <span className="block text-xs text-muted-foreground">
          {buildProgressLine(active)}
          {active.estimate ? "" : " · Estimate unavailable"}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
