import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { ProviderShell } from "@/components/provider/ProviderShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyProviderFn } from "@/lib/provider.functions";
import { serviceCategoryLabel } from "@/lib/service-network";

export const Route = createFileRoute("/_driver/provider/requests")({
  head: () => ({
    meta: [
      { title: "Provider requests — Repara" },
      {
        name: "description",
        content: "Service requests drivers sent directly to your Repara provider profile.",
      },
      { property: "og:title", content: "Provider requests — Repara" },
      { property: "og:description", content: "Requests sent to you, with the vehicle details already attached." },
    ],
  }),
  component: ProviderRequests;
});

function ProviderRequests() {
  const load = useServerFn(getMyProviderFn);
  const { data, isLoading } = useQuery({ queryKey: ["my-provider"], queryFn: () => load({}) });

  if (isLoading) {
    return (
      <ProviderShell>
        <Skeleton className="h-32 w-full rounded-2xl" />
      </ProviderShell>
    );
  }

  if (!data?.provider) {
    return (
      <ProviderShell>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Requests</h1>
        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
          Create your provider profile first so drivers can send you requests.
        </div>
        <Button asChild className="mt-4 h-12 w-full sm:w-auto">
          <Link to="/provider/onboarding">Start setup</Link>
        </Button>
      </ProviderShell>
    );
  }

  const requests = data.requests;

  return (
    <ProviderShell>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Requests</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Requests drivers sent to {data.provider.businessName}.
      </p>

      {requests.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
          No requests yet. Once your profile is active, drivers who pick you will show up here.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="rounded-2xl border border-border/70 bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {request.vehicleLabel ?? "Vehicle"}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    #{request.requestNumber} ·{" "}
                    {new Date(request.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">
                  {request.status}
                </span>
              </div>
              {request.categoryKey && (
                <p className="mt-3 text-sm text-foreground">
                  {serviceCategoryLabel(request.categoryKey, "en") ?? request.categoryKey}
                </p>
              )}
              {request.concern && (
                <p className="mt-1 text-sm text-muted-foreground">{request.concern}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </ProviderShell>
  );
}
