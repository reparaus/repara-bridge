import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { ProviderShell } from "@/components/provider/ProviderShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listProviderRequests } from "@/lib/messaging.functions";
import { serviceCategoryLabel } from "@/lib/service-network";

export const Route = createFileRoute("/_driver/provider/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Repara for Providers" },
      { name: "description", content: "Customers who have requested service from your business through Repara." },
      { property: "og:title", content: "Customers — Repara for Providers" },
      { property: "og:description", content: "Your Repara customers and their service history with your business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderCustomers,
});

const STAGE_LABEL: Record<string, string> = {
  new: "New request",
  reviewing: "Awaiting your response",
  quoted: "Quote sent",
  accepted: "Accepted",
  in_progress: "In progress",
  completed: "Completed",
};

function monthYear(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Customers are derived only from requests this provider can already see
 * (server-side scoped list) — no search across Repara users.
 */
function ProviderCustomers() {
  const load = useServerFn(listProviderRequests);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["provider-requests"],
    queryFn: () => load({}),
  });
  const [open, setOpen] = useState<string | null>(null);

  const customers = useMemo(() => {
    const map = new Map<string, { key: string; name: string; vehicle: string; requests: NonNullable<typeof data>["requests"] }>();
    for (const r of data?.requests ?? []) {
      const key = `${r.customerLabel}|${r.vehicle}`;
      const entry = map.get(key) ?? { key, name: r.customerLabel, vehicle: r.vehicle, requests: [] };
      entry.requests.push(r);
      map.set(key, entry);
    }
    return [...map.values()];
  }, [data]);

  return (
    <ProviderShell>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Customers</h1>
      {isLoading ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : isError ? (
        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5">
          <p className="text-sm text-foreground">Unable to load your customers.</p>
          <Button variant="outline" className="mt-3 h-11" onClick={() => void refetch()}>Try again</Button>
        </div>
      ) : customers.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
          Your Repara customers will appear here after you receive service requests.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {customers.map((c) => {
            const completed = c.requests.filter((r) => r.stage === "completed");
            const expanded = open === c.key;
            return (
              <div key={c.key} className="rounded-2xl border border-border/70 bg-card">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : c.key)}
                  className="flex min-h-[64px] w-full items-center justify-between gap-3 p-4 text-left"
                  aria-expanded={expanded}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{c.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{c.vehicle || "Vehicle not provided"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.requests.length} service request{c.requests.length === 1 ? "" : "s"}
                      {completed[0] ? ` · Last service ${monthYear(completed[0].createdAt)}` : ""}
                    </span>
                  </span>
                  <ChevronRight className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
                </button>
                {expanded && (
                  <div className="border-t border-border/60 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Service history with your business
                    </p>
                    <ul className="mt-2 divide-y divide-border/60">
                      {c.requests.map((r) => (
                        <li key={r.requestId}>
                          <Link
                            to="/provider/project/$id"
                            params={{ id: r.requestId }}
                            className="flex min-h-[48px] items-center justify-between gap-3 py-2"
                          >
                            <span className="min-w-0">
                              <span className="block text-sm text-foreground">
                                {serviceCategoryLabel(r.categoryKey, "en") ?? "Service request"}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {monthYear(r.createdAt)} · {STAGE_LABEL[r.stage] ?? r.stage}
                              </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ProviderShell>
  );
}
