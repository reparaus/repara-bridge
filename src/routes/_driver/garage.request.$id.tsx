import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { GarageShell, SectionTitle } from "@/components/garage/GarageShell";
import { CardSkeletons, LoadError, RefreshingDot } from "@/components/garage/GarageSkeletons";
import { ProviderMatch } from "@/components/garage/ProviderMatch";
import { RequestMessages } from "@/components/common/RequestMessages";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { formatCents } from "@/lib/money";
import { getMyRequest, respondToQuote } from "@/lib/provider-quotes.functions";
import { QuoteLines } from "@/components/common/QuoteLines";
import { serviceCategoryLabel } from "@/lib/service-network";

export const Route = createFileRoute("/_driver/garage/request/$id")({
  head: () => ({
    meta: [
      { title: "Your request — Repara" },
      { name: "description", content: "Track your service request, compare actual provider quotes and approve one." },
      { property: "og:title", content: "Your request — Repara" },
      { property: "og:description", content: "Track your request and compare real quotes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestTracking,
});

const EVENT_LABEL: Record<string, string> = {
  providers_invited: "Sent to providers",
  quote_submitted: "Quote received",
  quote_revised: "Quote updated",
  quote_declined: "You declined a quote",
  quote_approved: "You approved a quote",
  appointment_pending: "Appointment pending — the provider will follow up to schedule",
  provider_declined: "A provider declined",
  modifications_installed: "Work completed — modifications installed",
  modifications_verified: "Verified in your service history",
};

function RequestTracking() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getMyRequest);
  const respond = useServerFn(respondToQuote);
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["my-request", id],
    queryFn: () => load({ data: { requestId: id } }),
  });

  const mut = useMutation({
    mutationFn: (v: { quoteId: string; action: "accept" | "decline" }) => respond({ data: v }),
    onSuccess: async (_r, v) => {
      toast.success(v.action === "accept" ? "Quote approved. The provider will contact you." : "Quote declined.");
      await queryClient.invalidateQueries({ queryKey: ["my-request", id] });
      if (data?.buildId) await queryClient.invalidateQueries({ queryKey: ["build", data.buildId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isError && !data) {
    return (
      <GarageShell>
        <LoadError message="Couldn't load your request right now." onRetry={() => void refetch()} />
      </GarageShell>
    );
  }
  if (isLoading || !data) {
    return (
      <GarageShell>
        <CardSkeletons rows={3} />
      </GarageShell>
    );
  }

  const providerName = (pid: string) => data.providers.find((p) => p.id === pid)?.name ?? "Provider";
  const current = data.quotes.filter((q) => ["submitted", "accepted", "declined"].includes(q.status));
  const approved = data.quotes.find((q) => q.status === "accepted");
  const waiting = data.invites.filter((i) => i.status === "invited" || i.status === "viewed").length;

  return (
    <GarageShell>
      <Link to="/garage/vehicle/$id" params={{ id: data.vehicleId }} className="text-sm text-muted-foreground hover:text-foreground">
        ← {data.vehicleLabel || "My car"}
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Request #{data.requestNumber}</h1>
        <RefreshingDot active={isFetching && !isLoading} />
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {data.categoryKey ? `${serviceCategoryLabel(data.categoryKey, "en")} · ` : ""}
        Submitted {new Date(data.createdAt).toLocaleDateString()}
      </p>
      {data.buildId && (
        <Link to="/garage/build/$buildId" params={{ buildId: data.buildId }} className="mt-2 inline-block text-sm text-primary">
          View build →
        </Link>
      )}

      <section className="mt-6">
        <SectionTitle>Repara estimate</SectionTitle>
        <p className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Price estimate unavailable. Actual pricing comes from providers below.
        </p>
      </section>

      {!approved && !["completed", "cancelled"].includes(data.status) && (
        <section className="mt-8">
          <SectionTitle>{data.invites.length ? "Add more providers" : "Potential providers"}</SectionTitle>
          <ProviderMatch requestId={data.id} />
        </section>
      )}

      <section className="mt-8">
        <SectionTitle>Actual provider quotes</SectionTitle>
        {current.length === 0 ? (
          <p className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
            {data.invites.length === 0
              ? "Repara is reviewing your request and finding providers for this work."
              : "No quotes yet. You'll be notified when a provider responds."}
          </p>
        ) : (
          <div className="space-y-3">
            {current.map((q) => {
              const provider = data.providers.find((p) => p.id === q.providerId);
              const earlier = data.quotes.filter((o) => o.providerId === q.providerId && o.version < q.version);
              return (
                <div key={q.id} className="rounded-2xl border border-border/60 bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-foreground">{providerName(q.providerId)}</p>
                      <p className="text-xs text-muted-foreground">
                        {[provider?.area, provider?.mobile ? "Comes to you" : null, provider?.inShop ? "In-shop" : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-semibold text-foreground">{formatCents(q.totalCents)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Actual quote · v{q.version}
                        {q.status !== "submitted" ? ` · ${q.status === "accepted" ? "Approved" : "Declined"}` : ""}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Parts</dt><dd className="text-right">{formatCents(q.partsCents)}</dd>
                    <dt className="text-muted-foreground">Labor</dt><dd className="text-right">{formatCents(q.laborCents)}</dd>
                    {q.feesCents > 0 && (<><dt className="text-muted-foreground">Other fees</dt><dd className="text-right">{formatCents(q.feesCents)}</dd></>)}
                    {q.taxCents > 0 && (<><dt className="text-muted-foreground">Tax</dt><dd className="text-right">{formatCents(q.taxCents)}</dd></>)}
                  </dl>
                  <QuoteLines quoteId={q.id} lines={data.quoteLines} />
                  {q.timeframe && <p className="mt-2 text-sm text-muted-foreground">Timing: {q.timeframe}</p>}
                  {q.warranty && <p className="mt-1 text-sm text-muted-foreground">Warranty: {q.warranty}</p>}
                  {q.notes && <p className="mt-2 whitespace-pre-line text-sm text-foreground">{q.notes}</p>}
                  {earlier.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Earlier: {earlier.map((e) => `v${e.version} ${formatCents(e.totalCents)}`).join(" · ")}
                    </p>
                  )}
                  {q.status === "submitted" && !approved && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button
                        className="h-11"
                        disabled={mut.isPending}
                        onClick={() => {
                          if (window.confirm(`Approve ${providerName(q.providerId)}'s quote of ${formatCents(q.totalCents)}?`))
                            mut.mutate({ quoteId: q.id, action: "accept" });
                        }}
                      >
                        {mut.isPending && mut.variables?.quoteId === q.id && mut.variables.action === "accept" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Approve
                      </Button>
                      <Button variant="outline" className="h-11" disabled={mut.isPending} onClick={() => mut.mutate({ quoteId: q.id, action: "decline" })}>
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {waiting > 0 && current.length > 0 && !approved && (
          <p className="mt-2 text-xs text-muted-foreground">Waiting on {waiting} more provider{waiting > 1 ? "s" : ""}.</p>
        )}
      </section>

      <ConversationSection
        requestId={data.id}
        providers={data.providers.filter((p) => data.invites.some((i) => i.providerId === p.id && !["declined", "not_selected"].includes(i.status)))}
        preferred={approved?.providerId ?? null}
      />

      {data.events.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Timeline</SectionTitle>
          <ol className="space-y-2 border-l border-border/60 pl-4">
            {data.events.map((e, i) => (
              <li key={i} className="text-sm">
                <span className="text-foreground">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                {e.providerId && e.actor === "provider" ? <span className="text-muted-foreground"> · {providerName(e.providerId)}</span> : null}
                <span className="block text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </GarageShell>
  );
}

function ConversationSection({
  requestId,
  providers,
  preferred,
}: {
  requestId: string;
  providers: { id: string; name: string }[];
  preferred: string | null;
}) {
  const [active, setActive] = useState<string | null>(null);
  const current = active ?? preferred ?? providers[0]?.id ?? null;
  if (!current) return null;
  const name = providers.find((p) => p.id === current)?.name ?? "Provider";
  return (
    <section className="mt-8">
      <SectionTitle>Messages</SectionTitle>
      {providers.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${p.id === current ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <RequestMessages requestId={requestId} providerId={current} viewer="customer" otherName={name} />
    </section>
  );
}
