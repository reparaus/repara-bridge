import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, LogOut, MapPinOff, Search } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { listRequests } from "@/lib/admin.functions";
import { REQUEST_STATUSES, serviceLabel, statusLabel } from "@/lib/services";

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

const SUMMARY = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
] as const;

const SELECT_CLASS =
  "h-11 rounded-md border border-input bg-surface px-3 text-sm text-foreground";

function RequestsDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchRequests = useServerFn(listRequests);

  const [status, setStatus] = useState("all");
  const [serviceArea, setServiceArea] = useState<"all" | "eligible" | "outside_area" | "unknown">(
    "all",
  );
  const [zip, setZip] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["admin-requests", status, serviceArea, zip, vehicle, search],
    queryFn: () => fetchRequests({ data: { status, serviceArea, zip, vehicle, search } }),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
            <LogOut className="mr-2 size-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold">Service Requests</h1>
          {query.data && (
            <p className="text-xs text-muted-foreground">
              {query.data.areaCounts.outside_area ?? 0} outside the service area
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SUMMARY.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatus((cur) => (cur === s.key ? "all" : s.key))}
              className={`surface-panel p-4 text-left transition-colors ${
                status === s.key ? "border-chrome/50" : ""
              }`}
            >
              <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                {s.label}
              </p>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums">
                {query.data?.counts[s.key] ?? 0}
              </p>
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              placeholder="Name, phone, vehicle, ZIP"
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-9"
              aria-label="Search requests"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={SELECT_CLASS}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <select
            value={serviceArea}
            onChange={(e) => setServiceArea(e.target.value as typeof serviceArea)}
            className={SELECT_CLASS}
            aria-label="Filter by service area"
          >
            <option value="all">All areas</option>
            <option value="eligible">In service area</option>
            <option value="outside_area">Outside area</option>
            <option value="unknown">Unknown</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={zip}
              placeholder="ZIP"
              inputMode="numeric"
              onChange={(e) => setZip(e.target.value)}
              className="h-11"
              aria-label="Filter by ZIP code"
            />
            <Input
              value={vehicle}
              placeholder="Vehicle"
              onChange={(e) => setVehicle(e.target.value)}
              className="h-11"
              aria-label="Filter by vehicle"
            />
          </div>
        </div>

        {query.isPending && <SkeletonRows rows={5} />}

        {query.data && query.data.requests.length === 0 && (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="No requests match"
            description="Adjust your filters, or wait for new customer requests to arrive."
          />
        )}

        {query.data && query.data.requests.length > 0 && (
          <div className="surface-panel overflow-hidden p-0">
            <div className="hidden grid-cols-[1.2fr_1.2fr_1fr_0.9fr_0.9fr_auto] gap-4 border-b border-border px-5 py-3 text-[11px] tracking-[0.16em] text-muted-foreground uppercase lg:grid">
              <span>Customer</span>
              <span>Vehicle</span>
              <span>Service</span>
              <span>Location</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="divide-y divide-border">
              {query.data.requests.map((r) => {
                const outside = r.serviceAreaStatus === "outside_area";
                return (
                  <li
                    key={r.id}
                    className={`grid gap-2 px-5 py-4 lg:grid-cols-[1.2fr_1.2fr_1fr_0.9fr_0.9fr_auto] lg:items-center lg:gap-4 ${
                      outside ? "border-l-2 border-l-warning bg-warning/5" : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{r.customerName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.phone}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.vehicle || "—"}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.serviceLabels.length ? r.serviceLabels.join(", ") : serviceLabel(r.category)}
                    </p>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {[r.city, r.zipCode].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {outside && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-warning">
                          <MapPinOff className="size-3" /> Outside area
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <StatusBadge status={r.status} className="justify-self-start" />
                    <Button asChild size="sm" variant="outline" className="border-border bg-transparent">
                      <Link to="/admin/requests/$id" params={{ id: r.id }}>
                        Open
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
