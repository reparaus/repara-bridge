import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { setKnowledgeMatchState, syncJobKnowledge } from "@/lib/job.functions";

type Match = {
  matchId: string;
  knowledgeId: string;
  informationType: string;
  title: string;
  summary: string | null;
  conditions: string | null;
  source: string;
  sourceRecordId: string | null;
  sourceUrl: string | null;
  documentUrl: string | null;
  publishedAt: string | null;
  applicability: string;
  matchReason: string | null;
  dismissed: boolean;
  confirmedRelevant: boolean | null;
};

/**
 * Vehicle Knowledge — the technician-facing surface of Repara's repair-knowledge
 * system. Deliberately compact: a one-line status with a Review toggle, never a
 * permanent panel.
 *
 * Wording rules baked in here:
 *  - Recalls are described as "recall information that applies to this vehicle",
 *    never "open" or "unrepaired", because year/make/model applicability does
 *    not establish remedy status for this VIN.
 *  - Bulletins are "possible matches", never a confirmed diagnosis.
 *  - The internal match score is never shown.
 */
export function VehicleKnowledge({
  requestId,
  initial,
  variant = "overview",
}: {
  requestId: string;
  initial: Match[];
  variant?: "overview" | "diagnosis";
}) {
  const sync = useServerFn(syncJobKnowledge);
  const setState = useServerFn(setKnowledgeMatchState);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Cached server-side; this only reaches NHTSA when the cache is stale.
  const knowledge = useQuery({
    queryKey: ["job-knowledge", requestId],
    queryFn: () => sync({ data: { id: requestId } }),
    initialData: { knowledge: initial, synced: false },
    staleTime: 5 * 60 * 1000,
  });

  const refresh = useMutation({
    mutationFn: () => sync({ data: { id: requestId, force: true } }),
    onSuccess: (result) => queryClient.setQueryData(["job-knowledge", requestId], result),
  });

  const update = useMutation({
    mutationFn: (input: { matchId: string; action: "dismiss" | "restore" | "confirm" }) =>
      setState({ data: { ...input, requestId } }),
    onSuccess: (result) =>
      queryClient.setQueryData(["job-knowledge", requestId], {
        knowledge: result.knowledge,
        synced: false,
      }),
  });

  const matches = (knowledge.data?.knowledge ?? []) as Match[];
  const active = matches.filter((m) => !m.dismissed);
  const recalls = active.filter((m) => m.informationType === "recall");
  const bulletins = active.filter((m) => m.informationType !== "recall");

  if (!active.length) {
    if (variant === "diagnosis") return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
        <p className="text-xs text-muted-foreground">
          {knowledge.isPending
            ? "Checking vehicle knowledge…"
            : "No source-backed vehicle knowledge found for this vehicle yet."}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-xs"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          {refresh.isPending ? (
            <Loader2 className="mr-2 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-3.5" />
          )}
          Check again
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0 space-y-0.5 text-xs">
          {recalls.length > 0 && (
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
              Recall information available for this vehicle ({recalls.length})
            </p>
          )}
          {bulletins.length > 0 && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="size-3.5 shrink-0" />
              {bulletins.length} possible bulletin match{bulletins.length === 1 ? "" : "es"}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-9 bg-transparent text-xs" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Review"}
        </Button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {active.map((match) => (
            <article key={match.matchId} className="rounded-lg border border-border p-3">
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                {match.informationType === "recall"
                  ? "Recall information"
                  : "Possible manufacturer communication match"}
                {" · "}
                {match.source.toUpperCase()}
                {match.sourceRecordId ? ` · ${match.sourceRecordId}` : ""}
              </p>
              <h4 className="pt-1 text-sm font-medium">{match.title}</h4>
              {match.applicability && (
                <p className="pt-0.5 text-xs text-muted-foreground">
                  Applies to: {match.applicability}
                </p>
              )}
              {match.summary && <p className="pt-1.5 text-xs whitespace-pre-line">{match.summary}</p>}
              {match.conditions && (
                <p className="pt-1.5 text-xs whitespace-pre-line text-muted-foreground">
                  {match.conditions}
                </p>
              )}
              {match.matchReason && (
                <p className="pt-1.5 text-xs text-muted-foreground">
                  Why Repara matched it: {match.matchReason}
                </p>
              )}
              {match.informationType === "recall" && (
                <p className="pt-1.5 text-[11px] text-muted-foreground">
                  Applicability is by year, make and model. Repara cannot confirm from this source
                  whether the remedy was already performed on this VIN.
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-2.5">
                {(match.documentUrl || match.sourceUrl) && (
                  <a
                    href={match.documentUrl ?? match.sourceUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium"
                  >
                    <ExternalLink className="mr-1.5 size-3.5" />
                    View source
                  </a>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 bg-transparent text-xs"
                  disabled={update.isPending || Boolean(match.confirmedRelevant)}
                  onClick={() => update.mutate({ matchId: match.matchId, action: "confirm" })}
                >
                  {match.confirmedRelevant ? "Marked relevant" : "Relevant to this job"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ matchId: match.matchId, action: "dismiss" })}
                >
                  Not relevant
                </Button>
              </div>
            </article>
          ))}
          <p className="pt-1 text-[11px] text-muted-foreground">
            Source-backed information only. Repara does not have authorized repair procedures,
            wiring diagrams or torque specifications for this vehicle yet, so those categories stay
            unavailable rather than being guessed.
          </p>
        </div>
      )}
    </div>
  );
}
