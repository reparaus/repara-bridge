import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Conversation } from "@/components/common/Conversation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getGuestRequest, guestRespondToQuote, sendGuestMessage } from "@/lib/messaging.functions";
import { formatCents } from "@/lib/money";
import { serviceCategoryLabel } from "@/lib/service-network";
import { cn } from "@/lib/utils";
import { QuoteLines } from "@/components/common/QuoteLines";

/** Secure request-specific page for customers without an account. */
export const Route = createFileRoute("/r/$token")({
  head: () => ({
    meta: [
      { title: "Your service request — Repara" },
      { name: "description", content: "Track your Repara service request, read provider messages and review quotes." },
      { property: "og:title", content: "Your service request — Repara" },
      { property: "og:description", content: "Track your request, messages and quotes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: GuestRequest,
});

const STATUS_LABEL: Record<string, string> = {
  new: "New request",
  reviewing: "Provider reviewing",
  quoted: "Quote sent",
  accepted: "Quote accepted",
  scheduled: "Appointment booked",
  in_progress: "In progress",
  completed: "Completed",
  closed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
};

function GuestRequest() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(getGuestRequest);
  const send = useServerFn(sendGuestMessage);
  const respond = useServerFn(guestRespondToQuote);
  const key = ["guest-request", token];
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => load({ data: { token } }),
    refetchInterval: 30_000,
    retry: false,
  });
  const [active, setActive] = useState<string | null>(null);

  const sendMut = useMutation({
    mutationFn: (v: { providerId: string; body: string }) => send({ data: { token, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error((e as Error).message),
  });
  const quoteMut = useMutation({
    mutationFn: (v: { quoteId: string; action: "accept" | "decline" }) => respond({ data: { token, ...v } }),
    onSuccess: (_r, v) => {
      toast.success(v.action === "accept" ? "Quote accepted. The provider will follow up to schedule." : "Quote declined.");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-5">
          <a href="/" aria-label="Repara"><Logo className="h-7 w-auto" /></a>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-6">{children}</main>
    </div>
  );

  if (isLoading) return shell(<Skeleton className="h-48 w-full rounded-2xl" />);
  if (isError || !data)
    return shell(
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <p className="text-sm text-foreground">{(error as Error)?.message ?? "This request couldn't be loaded."}</p>
        <Button variant="outline" className="mt-3" onClick={() => void refetch()}>Try again</Button>
      </div>,
    );

  const approved = data.quotes.find((q) => q.status === "accepted");
  const providerName = (id: string) => data.providers.find((p) => p.id === id)?.name ?? "Provider";
  const conversationWith = active ?? approved?.providerId ?? data.providers[0]?.id ?? null;

  return shell(
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Request #{data.requestNumber}</p>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{data.vehicleLabel || "Your vehicle"}</h1>
      <div className="mt-4 grid gap-2 rounded-2xl border border-border/60 bg-card p-5 text-sm">
        <Line label="Status" value={data.appointmentStatus === "pending" ? "Appointment pending" : STATUS_LABEL[data.status] ?? data.status} />
        <Line label="Service" value={serviceCategoryLabel(data.categoryKey, "en") ?? (data.services.join(", ") || "—")} />
        {data.mileage ? <Line label="Mileage" value={`${data.mileage.toLocaleString()} mi`} /> : null}
        <Line label="Submitted" value={new Date(data.createdAt).toLocaleString()} />
      </div>

      <h2 className="mt-8 text-sm font-semibold text-foreground">Estimated price range</h2>
      <div className="mt-2 rounded-2xl border border-border/60 bg-card p-5 text-sm">
        {data.estimate.available ? (
          <>
            <p className="text-2xl font-semibold text-foreground">
              {data.estimate.lowCents === data.estimate.highCents
                ? `About ${formatCents(data.estimate.lowCents)}`
                : `${formatCents(data.estimate.lowCents)}–${formatCents(data.estimate.highCents)}`}
            </p>
            <p className="mt-1 text-muted-foreground">
              For {data.estimate.operationName}, based on vehicle-specific labor time, provider labor rates and estimated parts pricing.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">An estimate isn't available yet for this request. Providers will send their actual prices.</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          This is an estimate, not a final quote. Actual provider pricing may be higher or lower depending on the provider, parts selected, vehicle condition, and additional findings.
        </p>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-foreground">Provider quotes</h2>
      {data.quotes.length === 0 ? (
        <p className="mt-2 rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
          {data.providers.length ? "No quotes yet. We'll email you when a provider responds." : "Repara is finding providers for this work."}
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {data.quotes.map((q) => (
            <div key={q.id} className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-foreground">{providerName(q.providerId)}</p>
                <div className="text-right">
                  <p className="text-xl font-semibold text-foreground">{formatCents(q.totalCents)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    v{q.version}{q.status !== "submitted" ? ` · ${q.status === "accepted" ? "Accepted" : "Declined"}` : ""}
                  </p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Parts</dt><dd className="text-right">{formatCents(q.partsCents)}</dd>
                <dt className="text-muted-foreground">Labor</dt><dd className="text-right">{formatCents(q.laborCents)}</dd>
                {q.feesCents > 0 && (<><dt className="text-muted-foreground">Other fees</dt><dd className="text-right">{formatCents(q.feesCents)}</dd></>)}
                {q.taxCents > 0 && (<><dt className="text-muted-foreground">Tax</dt><dd className="text-right">{formatCents(q.taxCents)}</dd></>)}
              </dl>
              <QuoteLines quoteId={q.id} lines={data.quoteLines} />
              {q.timeframe && <p className="mt-2 text-sm text-muted-foreground">Timing: {q.timeframe}</p>}
              {q.warranty && <p className="mt-1 text-sm text-muted-foreground">Warranty: {q.warranty}</p>}
              {q.notes && <p className="mt-2 whitespace-pre-line text-sm text-foreground">{q.notes}</p>}
              {q.status === "submitted" && !approved && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    className="h-11"
                    disabled={quoteMut.isPending}
                    onClick={() => {
                      if (window.confirm(`Accept ${providerName(q.providerId)}'s quote of ${formatCents(q.totalCents)}?`))
                        quoteMut.mutate({ quoteId: q.id, action: "accept" });
                    }}
                  >
                    Accept
                  </Button>
                  <Button variant="outline" className="h-11" disabled={quoteMut.isPending} onClick={() => quoteMut.mutate({ quoteId: q.id, action: "decline" })}>
                    Decline
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {approved && (
        <p className="mt-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 text-sm text-foreground">
          Appointment pending — {providerName(approved.providerId)} will follow up to set a time.
        </p>
      )}

      {data.providers.length > 0 && conversationWith && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-foreground">Messages</h2>
          {data.providers.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {data.providers.map((p) => {
                const unread = data.messages.some((m) => m.providerId === p.id && m.senderRole === "provider" && !m.readAt);
                return (
                  <button
                    key={p.id}
                    onClick={() => setActive(p.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      p.id === conversationWith ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
                    )}
                  >
                    {p.name}{unread ? " •" : ""}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-3">
            <Conversation
              messages={data.messages.filter((m) => m.providerId === conversationWith)}
              viewer="customer"
              otherName={providerName(conversationWith)}
              sending={sendMut.isPending}
              disabled={["declined", "not_selected"].includes(data.providers.find((p) => p.id === conversationWith)?.inviteStatus ?? "")}
              onSend={(body) => sendMut.mutateAsync({ providerId: conversationWith, body })}
            />
          </div>
        </>
      )}
      <p className="mt-8 text-xs text-muted-foreground">Keep this link private — anyone with it can view this request.</p>
    </>,
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}
