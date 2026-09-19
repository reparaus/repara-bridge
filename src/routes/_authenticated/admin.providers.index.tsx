import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listProvidersAdmin, setProviderStatusAdmin } from "@/lib/admin.functions";
import { PROVIDER_STATUS_LABEL, providerKindLabel } from "@/lib/provider-kinds";
import { serviceCategoryLabel } from "@/lib/service-network";

export const Route = createFileRoute("/_authenticated/admin/providers/")({
  head: () => ({
    meta: [
      { title: "Providers — Repara Admin" },
      {
        name: "description",
        content: "Review, activate and pause the automotive service providers on Repara.",
      },
      { property: "og:title", content: "Providers — Repara Admin" },
      { property: "og:description", content: "Provider review and status management." },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminProviders,
});

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending_review", label: "Pending review" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "draft", label: "Draft" },
] as const;

function AdminProviders() {
  const queryClient = useQueryClient();
  const list = useServerFn(listProvidersAdmin);
  const setStatus = useServerFn(setProviderStatusAdmin);

  const [status, setStatusFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-providers", status, search],
    queryFn: () => list({ data: { status, search: search || undefined } }),
  });

  const mutation = useMutation({
    mutationFn: (input: { id: string; status: "active" | "paused" | "pending_review" }) =>
      setStatus({ data: input }),
    onSuccess: async () => {
      toast.success("Provider updated.");
      await queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Providers</h1>
        <Button asChild variant="outline" className="h-11">
          <Link to="/admin/requests">Requests</Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setStatusFilter(filter.key)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              status === filter.key
                ? "border-primary bg-secondary text-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search business name"
        className="mt-4 h-11 max-w-sm"
      />

      {isLoading && <Skeleton className="mt-6 h-32 w-full rounded-2xl" />}

      {!isLoading && data?.providers.length === 0 && (
        <p className="mt-6 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
          No providers yet. Providers appear here once a real business creates a profile.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {data?.providers.map((provider) => (
          <div key={provider.id} className="rounded-2xl border border-border/70 bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-foreground">{provider.businessName}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {providerKindLabel(provider.providerKind)}
                  {provider.location ? ` · ${provider.location}` : ""}
                  {provider.serviceRadiusMiles ? ` · ${provider.serviceRadiusMiles} mi` : ""}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {[
                    provider.offersMobile ? "Mobile" : null,
                    provider.offersInShop ? "In-shop" : null,
                    provider.phone,
                    provider.email,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">
                {PROVIDER_STATUS_LABEL[provider.status] ?? provider.status}
              </span>
            </div>

            {provider.description && (
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                {provider.description}
              </p>
            )}

            {provider.categories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {provider.categories.map((key) => (
                  <span key={key} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">
                    {serviceCategoryLabel(key, "en") ?? key}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {provider.status !== "active" && (
                <Button
                  className="h-11"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ id: provider.id, status: "active" })}
                >
                  Activate
                </Button>
              )}
              {provider.status === "active" && (
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ id: provider.id, status: "paused" })}
                >
                  Pause
                </Button>
              )}
              {provider.status === "active" && (
                <Button asChild variant="outline" className="h-11">
                  <Link to="/providers/$id" params={{ id: provider.id }}>
                    View public page
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
