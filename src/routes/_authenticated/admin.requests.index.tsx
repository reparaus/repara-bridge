import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, LogOut, MailWarning, MapPinOff, Search } from "lucide-react";

import { CopyValue } from "@/components/admin/CopyValue";
import { Logo } from "@/components/brand/Logo";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { listRequests } from "@/lib/admin.functions";
import { serviceLabel } from "@/lib/services";

export const Route = createFileRoute("/_authenticated/admin/requests/")({
  head: () => ({
    meta: [
      { title: "Service Requests — Repara Admin" },
      { name: "description", content: "Repara internal dashboard for customer service requests." },
      { property: "og:title", content: "Service Requests — Repara Admin" },
      { property: "og:description", content: "Repara internal dashboard for customer service requests." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequestsDashboard,
});

/** Filter chips. `outside_area` filters by service area rather than status. */
const FILTERS = [
  { key: "all", label: "All", kind: "status" },
  { key: "new", label: "New", kind: "status" },
  { key: "contacted", label: "Contacted", kind: "status" },
  { key: "scheduled", label: "Scheduled", kind: "status" },
  { key: "completed", label: "Completed", kind: "status" },
  { key: "cancelled", label: "Cancelled", kind: "status" },
  { key: "outside_area", label: "Outside area", kind: "area" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/**
 * Work that has not been taken on yet vs work in progress. Incoming requests
 * need a decision (take it, assign it, decline it); jobs need to be finished.
 */
const INCOMING_STATUSES = new Set(["new", "contacted", "reviewing", "quoted", "declined"]);

const ASSIGNMENT_LABEL: Record<string, string> = {
  unassigned: "Unassigned",
  self: "Doing it myself",
  assigned: "Assigned to a provider",
  declined: "Declined",
};

function RequestsDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchRequests = useServerFn(listRequests);

  const [view, setView] = useState<"incoming" | "jobs">("incoming");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const status = filter === "outside_area" || filter === "all" ? "all" : filter;
  const serviceArea = filter === "outside_area" ? "outside_area" : "all";

  const query = useQuery({
    queryKey: ["admin-requests", filter, search],
    queryFn: () => fetchRequests({ data: { status, serviceArea, search } }),
  });

  const counts = query.data?.counts ?? {};
  const areaCounts = query.data?.areaCounts ?? {};
  const all = query.data?.requests ?? [];
  const isIncoming = (r: (typeof all)[number]) =>
    INCOMING_STATUSES.has(r.status) && !r.acceptedAt;
  const visible = all.filter((r) => (view === "incoming" ? isIncoming(r) : !isIncoming(r)));

  function countFor(f: (typeof FILTERS)[number]) {
    if (f.key === "all") return Object.values(counts).reduce((s, n) => s + n, 0);
    if (f.kind === "area") return areaCounts['outside_area'] ?? 0;
    return counts[f.key] ?? 0;
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-5">
          <div className="flex items-center gap-3">
            <Logo />
            {(query.data?.unviewedCount ?? 0) > 0 && (
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-info px-2 text-[11px] font-bold text-background"
                aria-label={`${query.data?.unviewedCount} new requests not yet viewed`}
              >
                {query.data?.unviewedCount}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
            <LogOut className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-5 sm:py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-xl font-extrabold sm:text-2xl">
            {view === "incoming" ? "Incoming Requests" : "Jobs"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {(query.data?.unviewedCount ?? 0) > 0
              ? `${query.data?.unviewedCount} not yet viewed`
              : "All requests viewed"}
          </p>
        </div>

        <div className="flex gap-2">
          {(
            [
              { key: "incoming", label: "Incoming Requests" },
              { key: "jobs", label: "Jobs" },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              aria-pressed={view === v.key}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                view === v.key
                  ? "border-chrome/60 bg-chrome/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.label}
              <span className="ml-1.5 tabular-nums opacity-70">
                {all.filter((r) => (v.key === "incoming" ? isIncoming(r) : !isIncoming(r))).length}
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            placeholder="Search name, phone, VIN or request #"
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 pl-9"
            aria-label="Search requests"
          />
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f.key
                  ? "border-chrome/60 bg-chrome/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums opacity-70">{countFor(f)}</span>
            </button>
          ))}
        </div>

        {query.isPending && <SkeletonRows rows={5} />}

        {query.isError && (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="Could not load requests"
            description="Check your connection and try again."
          />
        )}

        {query.data && query.data.requests.length === 0 && (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="No requests match"
            description="Adjust your filters, or wait for new customer requests to arrive."
          />
        )}

        {query.data && query.data.requests.length > 0 && (
          <ul className="grid gap-3 lg:grid-cols-2">
            {query.data.requests.map((r) => {
              const outside = r.serviceAreaStatus === "outside_area";
              return (
                <li key={r.id}>
                  <Link
                    to="/admin/requests/$id"
                    params={{ id: r.id }}
                    className={`surface-panel block space-y-3 p-4 transition-colors hover:border-chrome/50 ${
                      outside ? "border-l-2 border-l-warning" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs text-muted-foreground">
                            {r.requestNumber}
                          </p>
                          {!r.viewed && (
                            <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-info uppercase">
                              Unviewed
                            </span>
                          )}

                        </div>
                        <p className="mt-1 truncate text-base font-semibold">
                          {r.customerName || "—"}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>

                    <div className="grid gap-1.5 text-sm">
                      <Detail label="Vehicle" value={r.vehicle || "—"} />
                      <Detail
                        label="Service"
                        value={
                          r.serviceLabels.length
                            ? r.serviceLabels.join(", ")
                            : serviceLabel(r.category)
                        }
                      />
                      <Detail
                        label="Location"
                        value={[r.city, r.zipCode].filter(Boolean).join(" · ") || "—"}
                      />
                      <Detail
                        label="Submitted"
                        value={new Date(r.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <CopyValue value={r.phone} label="phone number" />
                      {r.vin && <CopyValue value={r.vin} label="VIN" mono />}
                      {outside && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning">
                          <MapPinOff className="size-3" /> Outside area
                        </span>
                      )}
                      {(r.emailStatus === "partial" || r.emailStatus === "failed") && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
                          <MailWarning className="size-3" /> Email issue
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-right text-sm">{value}</span>
    </div>
  );
}
