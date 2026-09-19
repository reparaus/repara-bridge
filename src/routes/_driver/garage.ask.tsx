import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { GarageShell, SectionTitle } from "@/components/garage/GarageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { askReparaFn, getGarageHome } from "@/lib/garage.functions";
import { useI18n } from "@/lib/i18n";
import { requestServiceKeyFor, serviceCategoryLabel } from "@/lib/service-network";
import { isServiceKey } from "@/lib/services";

export const Route = createFileRoute("/_driver/garage/ask")({
  validateSearch: (search: Record<string, unknown>): { vehicle?: string } =>
    typeof search.vehicle === "string" ? { vehicle: search.vehicle } : {},
  head: () => ({
    meta: [
      { title: "Ask Repara — Repara" },
      {
        name: "description",
        content: "Describe what your car is doing in your own words. Repara already knows your vehicle.",
      },
      { property: "og:title", content: "Ask Repara" },
      { property: "og:description", content: "Anything going on with your car? Repara can help." },
    ],
  }),
  component: AskRepara,
});

const EXAMPLES = [
  "My brakes are squeaking.",
  "I need a windshield replaced.",
  "I want 35% tint.",
  "I need new tires.",
  "I want my car detailed.",
  "I don't know what's wrong.",
];

type Turn = { role: "driver" | "repara"; content: string };

function AskRepara() {
  const { vehicle: vehicleParam } = Route.useSearch();
  const { lang } = useI18n();
  const loadHome = useServerFn(getGarageHome);
  const ask = useServerFn(askReparaFn);

  const { data, isLoading } = useQuery({ queryKey: ["garage-home"], queryFn: () => loadHome({}) });

  const [selected, setSelected] = useState<string | null>(vehicleParam ?? null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [followUp, setFollowUp] = useState<{ question: string; options: string[] } | null>(null);
  const [suggestService, setSuggestService] = useState(false);
  /** Service categories Repara recognised in the driver's own words. */
  const [categories, setCategories] = useState<string[]>([]);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const vehicles = data?.vehicles ?? [];
  const vehicleId = selected ?? vehicles.find((v) => v.isPrimary)?.id ?? vehicles[0]?.id ?? null;

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || !vehicleId) return;
    setMessage("");
    setFollowUp(null);
    const nextTurns: Turn[] = [...turns, { role: "driver", content: clean }];
    setTurns(nextTurns);
    setBusy(true);
    setFailedMessage(null);
    try {
      const answer = await ask({
        data: { vehicleId, message: clean, turns: nextTurns.slice(-8), language: lang },
      });
      setTurns([...nextTurns, { role: "repara", content: answer.reply }]);
      setFollowUp(answer.followUp);
      setSuggestService(answer.suggestService);
      setCategories(answer.categories ?? []);
    } catch (error) {
      setFailedMessage(clean);
      toast.error((error as Error).message || "Repara couldn't answer just now.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <GarageShell>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </GarageShell>
    );
  }

  if (!vehicles.length) {
    return (
      <GarageShell>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Ask Repara</h1>
        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Add your vehicle first so Repara can answer with your car in mind.
          </p>
          <Button asChild className="mt-4 h-12 w-full sm:w-auto">
            <Link to="/garage/add">Add my car</Link>
          </Button>
        </div>
      </GarageShell>
    );
  }

  const current = vehicles.find((v) => v.id === vehicleId);

  return (
    <GarageShell>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Anything going on with your car?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {current ? `Asking about your ${current.nickname ?? current.label}.` : ""} Describe it however feels
        natural — Repara already knows the details.
      </p>

      {vehicles.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setSelected(v.id);
                setTurns([]);
                setFollowUp(null);
              }}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                v.id === vehicleId ? "border-primary bg-secondary text-foreground" : "border-border text-muted-foreground"
              }`}
            >
              {v.nickname ?? v.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {turns.map((turn, index) => (
          <div
            key={index}
            className={
              turn.role === "driver"
                ? "ml-auto max-w-[85%] rounded-2xl bg-secondary px-4 py-3 text-sm text-foreground"
                : "max-w-[92%] rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-foreground"
            }
          >
            {turn.content}
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Repara is thinking…</p>}
        {failedMessage && !busy ? (
          <div className="border border-border bg-card p-4">
            <p className="text-sm text-foreground">Repara couldn't answer just now.</p>
            <Button variant="outline" className="mt-3" onClick={() => void send(failedMessage)}>Try again</Button>
          </div>
        ) : null}
      </div>

      {followUp && (
        <div className="mt-4 rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-sm text-foreground">{followUp.question}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {followUp.options.map((option) => (
              <Button
                key={option}
                variant="outline"
                className="h-11"
                onClick={() => void send(option)}
                disabled={busy}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      )}

      {!turns.length && (
        <div className="mt-6">
          <SectionTitle>For example</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => void send(example)}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(message);
        }}
      >
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell Repara what you're noticing…"
          className="w-full rounded-2xl border border-input bg-background p-4 text-base"
        />
        <Button type="submit" className="h-12 w-full text-base" disabled={busy || !message.trim()}>
          Send
        </Button>
      </form>

      {(suggestService || categories.length > 0) && vehicleId && (
        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5">
          <p className="text-sm text-foreground">
            {categories.length
              ? "This sounds like it needs:"
              : "Want a technician to take a look?"}
          </p>

          {/* An intent, not a diagnosis — the driver confirms before anything happens. */}
          {categories.length > 0 && (
            <div className="mt-3 space-y-2">
              {categories.map((key) => {
                const serviceKey = requestServiceKeyFor(key);
                return (
                  <Button
                    key={key}
                    asChild
                    variant="outline"
                    className="h-12 w-full justify-between text-base"
                  >
                    <Link
                      to="/quote"
                      search={{
                        ...(isServiceKey(serviceKey) ? { service: serviceKey } : {}),
                        v: vehicleId,
                      }}
                    >
                      {serviceCategoryLabel(key, lang) ?? key}
                      <span className="text-xs font-normal text-muted-foreground">Request</span>
                    </Link>
                  </Button>
                );
              })}
            </div>
          )}

          <Button asChild className="mt-3 h-12 w-full">
            <Link to="/garage/service" search={{ vehicle: vehicleId }}>
              Find service
            </Link>
          </Button>
        </div>
      )}
    </GarageShell>
  );
}
