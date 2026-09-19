import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";

import { ProviderShell, ProviderStatusPill } from "@/components/provider/ProviderShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyProviderFn } from "@/lib/provider.functions";
import { PROVIDER_STATUS_LABEL, providerKindLabel } from "@/lib/provider-kinds";
import { serviceCategoryLabel } from "@/lib/service-network";

export const Route = createFileRoute("/_driver/provider/")({
  head: () => ({
    meta: [
      { title: "Provider home — Repara" },
      {
        name: "description",
        content: "Your Repara provider profile, the services you offer, your service area and incoming requests.",
      },
      { property: "og:title", content: "Repara for providers" },
      { property: "og:description", content: "Manage your provider profile and the requests drivers send you." },
    ],
  }),
  component: ProviderHome,
});

function ProviderHome() {
  const load = useServerFn(getMyProviderFn);
  const { data, isLoading } = useQuery({ queryKey: ["my-provider"], queryFn: () => load({}) });

  if (isLoading) {
    return (
      <ProviderShell>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </ProviderShell>
    );
  }

  // No profile yet: the only thing to do is start the guided setup.
  if (!data?.provider) {
    return (
      <ProviderShell>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Offer your services through Repara
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your provider profile so drivers can find you and send you service requests. It takes a
          few minutes and you stay in control of what's shown.
        </p>
        <Button asChild className="mt-6 h-12 w-full text-base sm:w-auto">
          <Link to="/provider/onboarding">
            Get started
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </ProviderShell>
    );
  }

  const { provider, completion, requests } = data;

  return (
    <ProviderShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {provider.businessName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {providerKindLabel(provider.providerKind)}
            {provider.city ? ` · ${provider.city}${provider.region ? `, ${provider.region}` : ""}` : ""}
          </p>
        </div>
        <ProviderStatusPill
          status={provider.status}
          label={PROVIDER_STATUS_LABEL[provider.status] ?? provider.status}
        />
      </div>

      {provider.status !== "active" && (
        <div className="mt-4 rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-sm text-foreground">
            {provider.status === "pending_review"
              ? "Your profile is with Repara for review. Drivers can't see it yet."
              : provider.status === "paused"
                ? "Your profile is paused. Your information is kept — you can resume any time."
                : "Your profile is a draft. Finish it and submit it when you're ready."}
          </p>
          <Button asChild variant="outline" className="mt-3 h-11">
            <Link to="/provider/settings">Manage status</Link>
          </Button>
        </div>
      )}

      {/* Completion is guidance for the provider only — it never ranks anyone. */}
      {completion && (
        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Profile completion</p>
            <p className="text-sm text-muted-foreground">{completion.percent}%</p>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${completion.percent}%` }} />
          </div>
          {completion.done < completion.total && (
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {completion.checks
                .filter((check) => !check.done)
                .map((check) => (
                  <li key={check.label}>Still needed: {check.label}</li>
                ))}
            </ul>
          )}
          <Button asChild variant="outline" className="mt-4 h-11 w-full">
            <Link to="/provider/profile">Edit profile</Link>
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Services offered
          </p>
          {provider.categories.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {provider.categories.map((key) => (
                <span key={key} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">
                  {serviceCategoryLabel(key, "en") ?? key}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No services selected yet.</p>
          )}
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Service area
          </p>
          <p className="mt-2 text-sm text-foreground">
            {provider.city || provider.postalCode
              ? [provider.city, provider.region, provider.postalCode].filter(Boolean).join(" · ")
              : "Not set yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {provider.serviceRadiusMiles ? `Up to ${provider.serviceRadiusMiles} miles` : ""}
            {provider.areas.length ? ` · ${provider.areas.length} ZIP codes listed` : ""}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {[
              provider.offersMobile ? "Mobile service" : null,
              provider.offersInShop ? "In-shop service" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No service type selected"}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Incoming requests</p>
          <p className="text-sm text-muted-foreground">{requests.length}</p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          When a driver asks for service and chooses you, the request arrives here with the vehicle, VIN,
          mileage and what they described — no back-and-forth to collect the basics.
        </p>
        <Button asChild variant="outline" className="mt-4 h-11 w-full">
          <Link to="/provider/requests">View requests</Link>
        </Button>
      </div>
    </ProviderShell>
  );
}
