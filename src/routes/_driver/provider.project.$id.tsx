import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardSkeletons, LoadError } from "@/components/garage/GarageSkeletons";
import { ProviderShell } from "@/components/provider/ProviderShell";
import { Button } from "@/components/ui/button";
import { buildItem } from "@/lib/build-catalog";
import { formatCents } from "@/lib/money";
import { ProviderQuoteBuilder } from "@/components/provider/ProviderQuoteBuilder";
import { RequestMessages } from "@/components/common/RequestMessages";
import { getMyServicePricing } from "@/lib/messaging.functions";
import { declineProviderInvite, getProviderBrief } from "@/lib/provider-quotes.functions";
import { serviceCategoryLabel } from "@/lib/service-network";

export const Route = createFileRoute("/_driver/provider/project/$id")({
  head: () => ({
    meta: [
      { title: "Project request — Repara Provider" },
      { name: "description", content: "Review a driver's project and send your actual quote." },
      { property: "og:title", content: "Project request — Repara Provider" },
      { property: "og:description", content: "Review the project and send real pricing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectRequest,
});

function ProjectRequest() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getProviderBrief);
  const decline = useServerFn(declineProviderInvite);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["provider-brief", id], queryFn: () => load({ data: { requestId: id } }) });
  const loadPricing = useServerFn(getMyServicePricing);
  const pricing = useQuery({ queryKey: ["my-service-pricing"], queryFn: () => loadPricing({}) });
  const [showForm, setShowForm] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["provider-brief", id] });
    void queryClient.invalidateQueries({ queryKey: ["provider-invites"] });
  };

  const declineMut = useMutation({
    mutationFn: () => decline({ data: { requestId: id, reason: "" } }),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  if (isError && !data) {
    return (
      <ProviderShell>
        <LoadError message="Couldn't load this request right now." onRetry={() => void refetch()} />
      </ProviderShell>
    );
  }
  if (isLoading || !data) {
    return (
      <ProviderShell>
        <CardSkeletons rows={3} />
      </ProviderShell>
    );
  }

  const closed = ["declined", "selected", "not_selected"].includes(data.inviteStatus);
  const current = data.quotes.find((q) => q.status === "submitted" || q.status === "accepted");
  const preset = pricing.data?.services.find((s) => s.categoryKey === data.categoryKey && s.isActive && s.pricingMode !== "quote" && s.priceCents !== null);
  const presetLaborCents = preset?.priceCents ?? null;

  return (
    <ProviderShell>
      <Link to="/provider/requests" className="text-sm text-muted-foreground hover:text-foreground">← Requests</Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">New project request</p>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{data.vehicleLabel || "Vehicle"}</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        #{data.requestNumber} · {new Date(data.createdAt).toLocaleDateString()}
        {data.zip ? ` · Area ${data.zip}` : ""}
        {data.mileage ? ` · ${data.mileage.toLocaleString()} mi` : ""}
      </p>

      <section className="mt-6 space-y-3 rounded-2xl border border-border/60 bg-card p-5">
        {data.categoryKey && <p className="text-sm font-medium text-foreground">{serviceCategoryLabel(data.categoryKey, "en")}</p>}
        {data.build && (
          <div>
            <p className="text-xs text-muted-foreground">Build: {data.build.name}</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-foreground">
              {data.build.modifications.map((m, i) => (
                <li key={i}>
                  {buildItem(m.item)?.label ?? m.item}
                  {m.detail ? ` (${m.detail})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.services.length > 0 && <p className="text-sm text-muted-foreground">Services: {data.services.join(", ")}</p>}
        {data.notes && <p className="whitespace-pre-line text-sm text-foreground">{data.notes}</p>}
        <p className="text-xs text-muted-foreground">Repara estimate: unavailable</p>
        <p className="text-xs text-muted-foreground">Customer contact details are shared if the driver selects your quote.</p>
      </section>

      {data.quotes.length > 0 && (
        <section className="mt-6">
          <p className="mb-2 text-sm font-medium text-foreground">Your quotes</p>
          <div className="space-y-2">
            {data.quotes.map((q) => (
              <div key={q.id} className="flex flex-wrap items-center justify-between rounded-2xl border border-border/60 bg-card p-4 text-sm">
                <span>
                  Version {q.version} · {formatCents(q.totalCents)}
                </span>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {q.status}
                </span>
                {data.items.some((i) => i.quoteId === q.id) && (
                  <ul className="mt-2 w-full space-y-0.5 text-xs text-muted-foreground">
                    {data.items.filter((i) => i.quoteId === q.id).map((i, n) => (
                      <li key={n} className="flex justify-between gap-2">
                        <span>{i.name}{i.kind === "part" && i.quantity !== 1 ? ` × ${i.quantity}` : ""}{i.brand ? ` · ${i.brand}` : ""}{i.partNumber ? ` #${i.partNumber}` : ""}</span>
                        <span>{formatCents(i.lineTotalCents)}{i.providerUnitCostCents !== null ? ` (cost ${formatCents(Math.round(i.providerUnitCostCents * i.quantity))})` : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.providerId && (
        <section className="mt-6">
          <p className="mb-2 text-sm font-medium text-foreground">Messages</p>
          <RequestMessages requestId={id} providerId={data.providerId} viewer="provider" otherName="Customer" />
        </section>
      )}

      {data.inviteStatus === "selected" && (
        <section className="mt-6 rounded-2xl border border-border/60 bg-card p-5 text-sm">
          <p className="font-medium text-foreground">Appointment</p>
          <p className="mt-1 text-muted-foreground">Appointment pending — scheduling is coming soon. Contact the customer through Messages to agree on a time.</p>
        </section>
      )}

      {data.inviteStatus === "selected" && (
        <div className="mt-6 rounded-2xl border border-primary/40 bg-primary/5 p-5 text-sm">
          <p className="font-medium text-foreground">The driver selected your quote.</p>
          <Button asChild className="mt-3 h-11">
            <Link to="/admin/requests/$id" params={{ id }}>Open Job Workspace</Link>
          </Button>
        </div>
      )}
      {data.inviteStatus === "not_selected" && (
        <p className="mt-6 rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">The driver chose another provider.</p>
      )}
      {data.inviteStatus === "declined" && (
        <p className="mt-6 rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">You declined this request.</p>
      )}

      {!closed && !showForm && (
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button className="h-12" onClick={() => setShowForm(true)}>{current ? "Revise quote" : "Submit quote"}</Button>
          <Button
            variant="outline"
            className="h-12"
            disabled={declineMut.isPending}
            onClick={() => {
              if (window.confirm("Decline this request?")) declineMut.mutate();
            }}
          >
            {declineMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Decline
          </Button>
        </div>
      )}

      {!closed && showForm && (
        <ProviderQuoteBuilder
          requestId={id}
          vehicle={data.vehicle}
          mileage={data.mileage}
          services={data.services}
          categoryKey={data.categoryKey}
          notes={data.notes}
          laborRateCents={data.laborRateCents}
          presetLaborCents={presetLaborCents}
          revising={Boolean(current)}
          onDone={() => {
            setShowForm(false);
            refresh();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </ProviderShell>
  );
}
