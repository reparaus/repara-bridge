import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { SectionTitle } from "@/components/garage/GarageShell";
import { LoadError, RowSkeletons } from "@/components/garage/GarageSkeletons";
import { Button } from "@/components/ui/button";
import { getVehicleIntelligence } from "@/lib/garage.functions";
import { requestServiceKeyFor } from "@/lib/service-network";
import { isServiceKey } from "@/lib/services";

type Intel = Awaited<ReturnType<typeof getVehicleIntelligence>>;
type Insight = Intel["insights"][number];
type InsightAction = Insight["actions"][number];
type InsightTone = Insight["tone"];
import { cn } from "@/lib/utils";

const TONE_DOT: Record<InsightTone, string> = {
  attention: "bg-red-500",
  recommended: "bg-amber-500",
  info: "bg-sky-500",
  good: "bg-emerald-500",
  unknown: "bg-muted-foreground/50",
};

const TONE_WORD: Record<InsightTone, string> = {
  attention: "Needs attention",
  recommended: "Recommended",
  info: "Good to know",
  good: "No action needed",
  unknown: "Missing info",
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/**
 * "What's Next" — the vehicle intelligence summary on the Garage. Everything
 * shown comes from real records, with its source; nothing is auto-submitted.
 */
export function WhatsNext({ vehicleId }: { vehicleId: string }) {
  const load = useServerFn(getVehicleIntelligence);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["vehicle-intel", vehicleId],
    queryFn: () => load({ data: { vehicleId } }),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <section className="mt-10">
        <SectionTitle>What's next</SectionTitle>
        <RowSkeletons rows={2} />
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section className="mt-10">
        <SectionTitle>What's next</SectionTitle>
        <LoadError message="Couldn't check what's next for your car." onRetry={() => void refetch()} />
      </section>
    );
  }

  return (
    <>
      {data.activeRequests.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Active service</SectionTitle>
          <div className="space-y-2">
            {data.activeRequests.map((r) => (
              <Link
                key={r.id}
                to="/garage/request/$id"
                params={{ id: r.id }}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-border"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-muted-foreground">
                    {r.quoteReady ? "Quote ready" : "Service request"}
                  </span>
                  <span className="block truncate text-sm font-semibold text-foreground">{r.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.quoteReady && r.quoteTotalCents !== null ? `From ${money(r.quoteTotalCents)}` : r.statusLabel}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                  {r.quoteReady ? "Review quote" : "View"}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <SectionTitle>What's next</SectionTitle>
        {data.insufficient ? (
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", TONE_DOT.unknown)} aria-hidden />
              <p className="text-sm font-semibold text-foreground">Not enough information yet</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              As you add mileage and service history, Repara will start building a better picture of your car.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="h-11">
                <Link to="/garage/vehicle/$id" params={{ id: vehicleId }}>Update mileage</Link>
              </Button>
              <Button asChild className="h-11">
                <Link to="/garage/ask">Ask Repara</Link>
              </Button>
            </div>
          </div>
        ) : data.insights.length === 0 ? (
          <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4">
            <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT.good)} aria-hidden />
            <div>
              <p className="text-sm font-semibold text-foreground">No action currently identified</p>
              <p className="text-xs text-muted-foreground">Based on what Repara knows so far. Ask Repara if something feels off.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {data.insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} vehicleId={vehicleId} />
            ))}
          </div>
        )}
        <Link
          to="/garage/vehicle/$id"
          params={{ id: vehicleId }}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          View service history
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    </>
  );
}

function InsightCard({ insight, vehicleId }: { insight: Insight; vehicleId: string }) {
  const [why, setWhy] = useState(false);
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT[insight.tone])} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground">{TONE_WORD[insight.tone]}</p>
          <p className="text-sm font-semibold text-foreground">{insight.title}</p>
          {why ? (
            <p className="mt-1 text-sm text-muted-foreground">{insight.reason}</p>
          ) : (
            <button
              type="button"
              onClick={() => setWhy(true)}
              className="mt-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Why am I seeing this?
            </button>
          )}
          <p className="mt-2">
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {insight.source}
            </span>
          </p>
          {insight.actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {insight.actions.map((action, i) => (
                <ActionButton key={i} action={action} vehicleId={vehicleId} primary={i === 0} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ action, vehicleId, primary }: { action: InsightAction; vehicleId: string; primary: boolean }) {
  const variant = primary ? "default" : "outline";
  if (action.kind === "request") {
    return (
      <Button asChild size="sm" variant={variant} className="h-10">
        <Link to="/garage/request/$id" params={{ id: action.requestId }}>{action.label}</Link>
      </Button>
    );
  }
  if (action.kind === "vehicle") {
    return (
      <Button asChild size="sm" variant={variant} className="h-10">
        <Link to="/garage/vehicle/$id" params={{ id: vehicleId }}>{action.label}</Link>
      </Button>
    );
  }
  if (action.kind === "ask") {
    return (
      <Button asChild size="sm" variant={variant} className="h-10">
        <Link to="/garage/ask">{action.label}</Link>
      </Button>
    );
  }
  // Opens the existing request flow prefilled; the driver reviews and submits.
  const serviceKey = action.cat ? requestServiceKeyFor(action.cat) : undefined;
  return (
    <Button asChild size="sm" variant={variant} className="h-10">
      <Link
        to="/quote"
        search={{
          v: vehicleId,
          ...(serviceKey && isServiceKey(serviceKey) ? { service: serviceKey } : {}),
          ...(action.cat ? { cat: action.cat } : {}),
          ...(action.concern ? { concern: action.concern.slice(0, 500) } : {}),
        }}
      >
        {action.label}
      </Link>
    </Button>
  );
}
