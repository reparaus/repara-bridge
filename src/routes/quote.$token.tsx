import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Phone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { formatCurrency, PriceSummary } from "@/components/common/PriceSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { track } from "@/lib/analytics";
import { serviceLabel } from "@/lib/services";
import { getPublicQuote, respondToQuote } from "@/lib/quote.functions";

export const Route = createFileRoute("/quote/$token")({
  head: () => ({
    meta: [
      { title: "Your Quote — Repara" },
      { name: "description", content: "Review your personalized Repara service quote." },
      { property: "og:title", content: "Your Quote — Repara" },
      { property: "og:description", content: "Review and approve your Repara service quote." },
      { name: "robots", content: "noindex" },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicQuote,
});

function PublicQuote() {
  const { token } = Route.useParams();
  const fetchQuote = useServerFn(getPublicQuote);
  const respond = useServerFn(respondToQuote);
  const [pendingDecision, setPendingDecision] = useState<"accepted" | "declined" | null>(null);

  const query = useQuery({
    queryKey: ["public-quote", token],
    queryFn: () => fetchQuote({ data: { token } }),
    retry: 1,
  });

  useEffect(() => {
    if (query.data?.found) track("public_quote_viewed");
  }, [query.data?.found]);

  const mutation = useMutation({
    mutationFn: (decision: "accepted" | "declined") => respond({ data: { token, decision } }),
    onSuccess: (_res, decision) => {
      track(decision === "accepted" ? "quote_accepted" : "quote_declined");
      toast.success(decision === "accepted" ? "Quote accepted." : "Quote declined.");
      void query.refetch();
    },
    onError: () => toast.error("We couldn't update this quote. Please contact Repara."),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          <Logo />
          <span className="text-xs tracking-[0.2em] text-muted-foreground uppercase">Your Quote</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8 pb-20">
        {query.isPending && <LoadingState label="Loading your quote" />}

        {query.isError && (
          <EmptyState
            icon={<ShieldAlert className="size-5" />}
            title="We couldn't load this quote"
            description="Please check your link or contact Repara and we'll resend it."
          />
        )}

        {query.data && !query.data.found && (
          <EmptyState
            icon={<ShieldAlert className="size-5" />}
            title="Quote not found"
            description="This link may have expired or been replaced by an updated quote. Contact Repara and we'll send you a new one."
            action={
              <Button asChild variant="outline" className="mt-2 rounded-full border-border bg-transparent">
                <Link to="/">Return home</Link>
              </Button>
            }
          />
        )}

        {query.data?.found && (
          <div className="space-y-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl font-extrabold">
                  Hi {query.data.request.firstName || "there"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Request #{query.data.request.requestNumber}
                </p>
              </div>
              <StatusBadge status={query.data.expired ? "expired" : query.data.quote.status} />
            </div>

            <section className="surface-panel space-y-4 p-5">
              <Row label="Vehicle" value={query.data.request.vehicle || "—"} />
              <Row label="Service" value={serviceLabel(query.data.request.category)} />
              {query.data.quote.expirationDate && (
                <Row label="Valid through" value={query.data.quote.expirationDate} />
              )}
            </section>

            {query.data.items.length > 0 && (
              <section className="surface-panel divide-y divide-border p-0">
                {query.data.items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 p-4">
                    <div>
                      <p className="text-sm font-medium">{item.description}</p>
                      <p className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">
                        {item.type} · {item.quantity} × {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <span className="text-sm tabular-nums">{formatCurrency(item.lineTotal)}</span>
                  </div>
                ))}
              </section>
            )}

            <PriceSummary
              parts={query.data.quote.partsSubtotal}
              labor={query.data.quote.laborSubtotal}
              fees={query.data.quote.feesTotal}
              discounts={query.data.quote.discountTotal}
              tax={query.data.quote.taxTotal}
              total={query.data.quote.estimatedTotal}
            />

            {query.data.quote.customerNotes && (
              <section className="surface-panel p-5">
                <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
                  Notes from your technician
                </p>
                <p className="mt-2 text-sm whitespace-pre-line">{query.data.quote.customerNotes}</p>
              </section>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">
              Final pricing may change if additional issues are discovered or the requested service
              changes. Any additional work must be approved before being performed.
            </p>

            {query.data.quote.status === "accepted" && (
              <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                <Check className="size-4" /> You accepted this quote. We'll be in touch to schedule.
              </div>
            )}
            {query.data.quote.status === "declined" && (
              <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
                You declined this quote. Contact us any time if anything changes.
              </div>
            )}
            {query.data.expired && query.data.quote.status === "sent" && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                This quote has expired. Contact Repara for an updated estimate.
              </div>
            )}

            {query.data.quote.status === "sent" && !query.data.expired && (
              <div className="space-y-3">
                <Button
                  size="lg"
                  className="h-13 w-full rounded-full text-sm tracking-[0.12em]"
                  disabled={mutation.isPending}
                  onClick={() => setPendingDecision("accepted")}
                >
                  {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  ACCEPT QUOTE
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-13 w-full rounded-full border-border bg-transparent text-sm tracking-[0.12em]"
                  disabled={mutation.isPending}
                  onClick={() => setPendingDecision("declined")}
                >
                  DECLINE
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() =>
                toast("Reply to the text or email that sent you this quote and we'll pick it up.")
              }
            >
              <Phone className="mr-2 size-4" /> CONTACT REPARA
            </Button>
          </div>
        )}
      </main>

      <AlertDialog open={pendingDecision !== null} onOpenChange={() => setPendingDecision(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDecision === "accepted" ? "Accept this quote?" : "Decline this quote?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDecision === "accepted"
                ? "We'll follow up to confirm scheduling. No payment is collected now."
                : "You can contact us any time if you change your mind."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDecision) mutation.mutate(pendingDecision);
                setPendingDecision(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs tracking-[0.16em] text-muted-foreground uppercase">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}
