import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle } from "lucide-react";
import { useState } from "react";

import { ProviderShell } from "@/components/provider/ProviderShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listProviderRequests, type ProviderRequestRow } from "@/lib/messaging.functions";
import { getMyProviderFn } from "@/lib/provider.functions";
import { serviceCategoryLabel } from "@/lib/service-network";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_driver/provider/requests")({
  head: () => ({
    meta: [
      { title: "Provider requests — Repara" },
      { name: "description", content: "Service requests matched to your Repara provider profile." },
      { property: "og:title", content: "Provider requests — Repara" },
      { property: "og:description", content: "Requests sent to you, with the vehicle details already attached." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderRequests,
});

export const STAGES: { key: ProviderRequestRow["stage"]; label: string }[] = [
  { key: "new", label: "New" },
  { key: "reviewing", label: "Reviewing" },
  { key: "quoted", label: "Quoted" },
  { key: "accepted", label: "Accepted" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
];

const QUOTE_LABEL: Record<string, string> = {
  submitted: "Quote sent",
  accepted: "Quote accepted",
  declined: "Quote declined",
  withdrawn: "Quote withdrawn",
};

function ProviderRequests() {
  const loadProvider = useServerFn(getMyProviderFn);
  const provider = useQuery({ queryKey: ["my-provider"], queryFn: () => loadProvider({}) });
  const load = useServerFn(listProviderRequests);
  const list = useQuery({ queryKey: ["provider-requests"], queryFn: () => load({}), refetchInterval: 30_000 });
  const [stage, setStage] = useState<ProviderRequestRow["stage"]>("new");

  if (provider.isLoading) {
    return (
      <ProviderShell>
        <Skeleton className="h-32 w-full rounded-2xl" />
      </ProviderShell>
    );
  }
  if (!provider.data?.provider) {
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

  const rows = list.data?.requests ?? [];
  const shown = rows.filter((r) => r.stage === stage);

  return (
    <ProviderShell>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Requests</h1>
      <div className="-mx-4 mt-4 overflow-x-auto px-4">
        <div className="flex gap-2">
          {STAGES.map((s) => {
            const count = rows.filter((r) => r.stage === s.key).length;
            return (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                  stage === s.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
                )}
              >
                {s.label}
                {count ? ` · ${count}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {list.isLoading ? (
        <Skeleton className="mt-6 h-32 w-full rounded-2xl" />
      ) : list.isError ? (
        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5 text-sm">
          Couldn't load requests. <button className="text-primary" onClick={() => void list.refetch()}>Try again</button>
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
          {rows.length === 0
            ? "No requests yet. Requests that match your services and area appear here."
            : "Nothing in this tab."}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {shown.map((r) => (
            <Link
              key={r.requestId}
              to="/provider/project/$id"
              params={{ id: r.requestId }}
              className="block rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:border-border"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-foreground">{r.vehicle || "Vehicle"}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {[
                      r.categoryKey ? serviceCategoryLabel(r.categoryKey, "en") ?? r.categoryKey : null,
                      r.mileage ? `${r.mileage.toLocaleString()} mi` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {r.unread > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    <MessageCircle className="size-3" /> {r.unread}
                  </span>
                )}
              </div>
              {r.concern && <p className="mt-2 line-clamp-2 text-sm text-foreground">{r.concern}</p>}
              <p className="mt-3 text-xs text-muted-foreground">
                {r.customerLabel} · #{r.requestNumber} · {new Date(r.createdAt).toLocaleDateString()}
                {r.quoteStatus ? ` · ${QUOTE_LABEL[r.quoteStatus] ?? r.quoteStatus}` : ""}
                {r.appointmentStatus === "pending" ? " · Appointment pending" : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </ProviderShell>
  );
}
