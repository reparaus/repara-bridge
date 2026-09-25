import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { ProviderShell } from "@/components/provider/ProviderShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listProviderInvites } from "@/lib/provider-quotes.functions";
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
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderRequests,
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
      <ProjectInvites />
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
            <Link
              key={request.id}
              to="/admin/requests/$id"
              params={{ id: request.id }}
              className="block rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:border-border"
            >
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
              <p className="mt-4 text-xs font-medium text-primary">Open Job Workspace</p>
            </Link>
          ))}
        </div>
      )}
    </ProviderShell>
  );
}

const INVITE_LABEL: Record<string, string> = {
  invited: "New",
  viewed: "Viewed",
  quoted: "Quoted",
  declined: "Declined",
  selected: "Selected",
  not_selected: "Not selected",
};

/** Project requests sent to this provider for an actual quote. */
function ProjectInvites() {
  const load = useServerFn(listProviderInvites);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["provider-invites"], queryFn: () => load({}) });
  if (isLoading) return <Skeleton className="mt-6 h-24 w-full rounded-2xl" />;
  if (isError)
    return (
      <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5 text-sm">
        Couldn't load quote requests. <button className="text-primary" onClick={() => void refetch()}>Try again</button>
      </div>
    );
  const invites = data?.invites ?? [];
  if (!invites.length) return null;
  return (
    <section className="mt-6">
      <p className="mb-2 text-sm font-medium text-foreground">Quote requests</p>
      <div className="space-y-3">
        {invites.map((i) => (
          <Link
            key={i.requestId}
            to="/provider/project/$id"
            params={{ id: i.requestId }}
            className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:border-border"
          >
            <div>
              <p className="text-base font-semibold text-foreground">{i.vehicleLabel || "Vehicle"}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                #{i.requestNumber}
                {i.buildName ? ` · ${i.buildName}` : ""}
                {i.categoryKey ? ` · ${serviceCategoryLabel(i.categoryKey, "en") ?? i.categoryKey}` : ""}
              </p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">{INVITE_LABEL[i.status] ?? i.status}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
