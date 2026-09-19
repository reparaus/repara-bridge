import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, MessageCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { GarageShell, SectionTitle } from "@/components/garage/GarageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { findProviders, getGarageHome } from "@/lib/garage.functions";
import {
  SERVICE_CATEGORIES,
  SERVICE_GROUPS,
  requestServiceKeyFor,
  serviceCategoryLabel,
  type ServiceGroupKey,
} from "@/lib/service-network";
import { isServiceKey } from "@/lib/services";

export const Route = createFileRoute("/_driver/garage/service")({
  head: () => ({
    meta: [
      { title: "Service — Repara" },
      {
        name: "description",
        content: "Tell Repara what you need, or pick the service yourself. Your vehicle details come along automatically.",
      },
      { property: "og:title", content: "Service — Repara" },
      { property: "og:description", content: "Find someone to take care of it." },
    ],
  }),
  component: ServiceArea,
});

function ServiceArea() {
  const load = useServerFn(getGarageHome);
  const lookupProviders = useServerFn(findProviders);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["garage-home"], queryFn: () => load({}) });

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openGroup, setOpenGroup] = useState<ServiceGroupKey | null>("repair");
  const [selected, setSelected] = useState<string | null>(null);

  const language = data?.profile.preferredLanguage ?? "en";
  const vehicles = data?.vehicles ?? [];
  const activeVehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles.find((v) => v.isPrimary) ?? vehicles[0];

  const { data: providerData } = useQuery({
    queryKey: ["providers", selected],
    queryFn: () => lookupProviders({ data: { categoryKey: selected ?? undefined } }),
    enabled: Boolean(selected),
  });

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return SERVICE_CATEGORIES.filter((category) => {
      const label = (language === "es" ? category.es : category.en).toLowerCase();
      return (
        label.includes(needle) ||
        category.hints.some((hint) => hint.includes(needle) || needle.includes(hint))
      );
    }).slice(0, 8);
  }, [language, query]);

  function startRequest(categoryKey: string) {
    setSelected(categoryKey);
    const serviceKey = requestServiceKeyFor(categoryKey);
    void navigate({
      to: "/quote",
      search: {
        ...(isServiceKey(serviceKey) ? { service: serviceKey } : {}),
        ...(activeVehicle ? { v: activeVehicle.id } : {}),
      },
    });
  }

  return (
    <GarageShell>
      <h1 className="text-[27px] font-semibold leading-tight tracking-tight text-foreground">Service</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell Repara what you need, or pick it yourself. Your vehicle details come along automatically.
      </p>

      {isLoading && <Skeleton className="mt-6 h-28 w-full rounded-2xl" />}

      {!isLoading && !vehicles.length && (
        <div className="mt-6 rounded-3xl border border-border/60 bg-card p-6 text-center">
          <p className="text-base font-medium text-foreground">Add your car first.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Then every request already knows the vehicle.
          </p>
          <Button asChild className="mt-4 h-12 w-full text-base sm:w-auto">
            <Link to="/garage/add">Add my car</Link>
          </Button>
        </div>
      )}

      {vehicles.length > 1 && (
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {vehicles.map((vehicle) => (
            <button
              key={vehicle.id}
              type="button"
              onClick={() => setVehicleId(vehicle.id)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                activeVehicle?.id === vehicle.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground",
              )}
            >
              {vehicle.nickname ?? vehicle.label}
            </button>
          ))}
        </div>
      )}

      {/* Path A — let Repara work out what's needed. */}
      <Link
        to="/garage/ask"
        className="mt-6 flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-5 transition-colors hover:border-border"
      >
        <MessageCircle className="h-5 w-5 text-primary" aria-hidden />
        <span>
          <span className="block text-base font-semibold text-foreground">Ask Repara</span>
          <span className="block text-sm text-muted-foreground">
            Not sure what it needs? Describe it in your own words.
          </span>
        </span>
      </Link>

      {/* Path B — the driver already knows. */}
      <section className="mt-8">
        <SectionTitle>I know what I need</SectionTitle>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tint, tires, brakes, detailing…"
            className="h-12 pl-9 text-base"
            aria-label="Search services"
          />
        </div>

        {matches && (
          <div className="mt-3 space-y-2">
            {matches.length === 0 && (
              <p className="px-1 text-sm text-muted-foreground">
                Nothing matched. Try "Ask Repara" and describe it in your own words.
              </p>
            )}
            {matches.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => startRequest(category.key)}
                className="flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-border/60 bg-card px-4 text-left text-sm font-medium text-foreground transition-colors hover:border-border"
              >
                {serviceCategoryLabel(category.key, language)}
                <span className="text-xs font-normal text-muted-foreground">Request</span>
              </button>
            ))}
          </div>
        )}

        {!matches && (
          <div className="mt-3 space-y-2">
            {SERVICE_GROUPS.map((group) => {
              const categories = SERVICE_CATEGORIES.filter((c) => c.group === group.key);
              const open = openGroup === group.key;
              return (
                <div key={group.key} className="overflow-hidden rounded-2xl border border-border/60 bg-card">
                  <button
                    type="button"
                    onClick={() => setOpenGroup(open ? null : group.key)}
                    className="flex min-h-[52px] w-full items-center justify-between px-4 text-left text-sm font-semibold text-foreground"
                    aria-expanded={open}
                  >
                    {language === "es" ? group.es : group.en}
                    <ChevronDown
                      className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                  {open && (
                    <div className="border-t border-border/50 p-2">
                      {categories.map((category) => (
                        <button
                          key={category.key}
                          type="button"
                          onClick={() => startRequest(category.key)}
                          className="flex min-h-[48px] w-full items-center justify-between rounded-xl px-3 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                        >
                          {serviceCategoryLabel(category.key, language)}
                          <span className="text-xs text-muted-foreground">Request</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Providers: only real, active providers ever appear here. */}
      <section className="mt-8">
        <SectionTitle>Who does the work</SectionTitle>
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          {providerData?.providers.length ? (
            <div className="space-y-3">
              {providerData.providers.map((provider) => (
                <div key={provider.id}>
                  <p className="text-sm font-semibold text-foreground">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[provider.location, provider.offersMobile ? "Mobile service" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Repara is building its network of participating providers. For now every request is handled
              through Repara, and you'll hear back directly.
            </p>
          )}
        </div>
      </section>
    </GarageShell>
  );
}
