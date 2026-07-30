import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, LogOut, Search } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { listRequests } from "@/lib/admin.functions";
import { REQUEST_STATUSES, SERVICES, serviceLabel, statusLabel } from "@/lib/services";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Repara" },
      { name: "description", content: "Repara internal dashboard for quote requests." },
      { property: "og:title", content: "Admin Dashboard — Repara" },
      { property: "og:description", content: "Repara internal dashboard for quote requests." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const SUMMARY: { key: string; label: string }[] = [
  { key: "new", label: "New Requests" },
  { key: "quoted", label: "Quotes Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "scheduled", label: "Scheduled" },
  { key: "completed", label: "Completed" },
];

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchRequests = useServerFn(listRequests);

  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [since, setSince] = useState("");

  const query = useQuery({
    queryKey: ["admin-requests", status, category, search, since],
    queryFn: () =>
      fetchRequests({
        data: {
          status,
          category,
          search,
          since: since ? new Date(since).toISOString() : undefined,
        },
      }),
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
        <h1 className="font-display text-2xl font-extrabold">Requests</h1>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SUMMARY.map((s) => (
            <div key={s.key} className="surface-panel p-4">
              <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{s.label}</p>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums">
                {query.data?.counts[s.key] ?? 0}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              placeholder="Name, phone, VIN, vehicle"
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 rounded-md border border-input bg-surface px-3 text-sm"
          >
            <option value="all">All statuses</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-11 rounded-md border border-input bg-surface px-3 text-sm"
          >
            <option value="all">All services</option>
            {SERVICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="h-11"
            aria-label="Submitted on or after"
          />
        </div>

        {query.isPending && <SkeletonRows rows={5} />}

        {query.data && query.data.requests.length === 0 && (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="No requests yet"
            description="New quote requests from customers will appear here."
          />
        )}

        {query.data && query.data.requests.length > 0 && (
          <div className="surface-panel overflow-hidden p-0">
            <div className="hidden grid-cols-[1.2fr_1.2fr_1fr_0.9fr_0.8fr_auto] gap-4 border-b border-border px-5 py-3 text-[11px] tracking-[0.16em] text-muted-foreground uppercase lg:grid">
              <span>Customer</span>
              <span>Vehicle</span>
              <span>Service</span>
              <span>Submitted</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="divide-y divide-border">
              {query.data.requests.map((r) => (
                <li
                  key={r.id}
                  className="grid gap-2 px-5 py-4 lg:grid-cols-[1.2fr_1.2fr_1fr_0.9fr_0.8fr_auto] lg:items-center lg:gap-4"
                >
                  <div>
                    <p className="text-sm font-medium">{r.customerName || "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.phone}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.vehicle || "—"}</p>
                  <p className="text-sm text-muted-foreground">{serviceLabel(r.category)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                  <StatusBadge status={r.status} className="justify-self-start" />
                  <Button asChild size="sm" variant="outline" className="border-border bg-transparent">
                    <Link to="/admin/requests/$id" params={{ id: r.id }}>
                      Open
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
