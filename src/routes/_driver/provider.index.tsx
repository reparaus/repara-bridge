import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";

import { ProviderShell, ProviderStatusPill } from "@/components/provider/ProviderShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listProviderRequests } from "@/lib/messaging.functions";
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
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderHome,
});

function ProviderHome() {
  const load = useServerFn(getMyProviderFn);
  const { data, isLoading } = useQuery({ queryKey: ["my-provider"], queryFn: () => load({}) });
  const loadRequests = useServerFn(listProviderRequests);
  const work = useQuery({
    queryKey: ["provider-requests"],
    queryFn: () => loadRequests({}),
    enabled: Boolean(data?.provider),
    refetchInterval: 30_000,
  });

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

      <section className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">New requests</p>
        {work.isLoading ? (
          <Skeleton className="mt-3 h-24 w-full rounded-2xl" />
        ) : (work.data?.requests ?? []).filter((r) => r.stage === "new").length === 0 ? (
          <p className="mt-3 rounded-2xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">
            No new service requests. When customers request your services through Repara, they'll appear here.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {(work.data?.requests ?? [])
              .filter((r) => r.stage === "new")
              .slice(0, 3)
              .map((r) => (
                <Link
                  key={r.requestId}
                  to="/provider/project/$id"
                  params={{ id: r.requestId }}
                  className="block rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-border"
                >
                  <p className="text-sm font-semibold text-foreground">{r.vehicle || "Vehicle not provided"}</p>
                  <p className="text-sm text-muted-foreground">{serviceCategoryLabel(r.categoryKey, "en") ?? "Service request"}</p>
                  {r.concern && <p className="mt-1 line-clamp-2 text-sm text-foreground">“{r.concern}”</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.mileage ? `${Number(r.mileage).toLocaleString()} mi · ` : ""}
                    <span className="text-primary">View request</span>
                  </p>
                </Link>
              ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11"><Link to="/provider/requests">View requests</Link></Button>
          <Button asChild variant="outline" className="h-11"><Link to="/provider/profile">Update profile</Link></Button>
          <Button asChild variant="outline" className="h-11"><Link to="/provider/customers">View customers</Link></Button>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Your requests</p>
          <Link to="/provider/requests" className="text-sm text-primary">Open workspace</Link>
        </div>
        {work.isLoading ? (
          <Skeleton className="mt-3 h-24 w-full rounded-2xl" />
        ) : work.isError ? (
          <p className="mt-3 rounded-2xl border border-border/70 bg-card p-4 text-sm">
            Couldn't load your requests. <button className="text-primary" onClick={() => void work.refetch()}>Try again</button>
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(
              [
                ["New requests", (r) => r.stage === "new"],
                ["Awaiting your response", (r) => r.stage === "reviewing"],
                ["Quotes sent", (r) => r.stage === "quoted"],
                ["Upcoming jobs", (r) => r.stage === "accepted"],
                ["In progress", (r) => r.stage === "in_progress"],
                ["Completed", (r) => r.stage === "completed"],
              ] as [string, (r: { stage: string }) => boolean][]
            ).map(([label, test]) => (
              <Link key={label} to="/provider/requests" className="rounded-2xl border border-border/70 bg-card p-4">
                <p className="text-2xl font-semibold text-foreground">{(work.data?.requests ?? []).filter(test).length}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </Link>
            ))}
          </div>
        )}
        {(work.data?.requests ?? []).some((r) => r.unread > 0) && (
          <p className="mt-3 text-sm text-primary">
            You have unread customer messages.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Requests arrive when a driver picks you or when they match your services and ZIP area. {requests.length} directly assigned.
        </p>
      </section>

      <Link to="/provider/settings" className="mt-6 block rounded-2xl border border-border/70 bg-card p-5">
        <p className="text-sm font-medium text-foreground">Services &amp; preset pricing</p>
        <p className="mt-1 text-sm text-muted-foreground">Set fixed, starting-at or range prices so quotes start in one tap.</p>
      </Link>
    </ProviderShell>
  );
}
