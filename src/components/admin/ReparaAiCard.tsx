import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Plus, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  analyzeRequestFn,
  askCustomerFn,
  clearAdminReviewFn,
  dismissAnalysisFn,
  listCommunicationsFn,
} from "@/lib/ai.functions";

type AiFields = {
  ai_summary?: string | null;
  ai_needs_clarification?: boolean | null;
  ai_clarification_question?: string | null;
  ai_recommended_services?: unknown;
  ai_internal_notes?: string | null;
  ai_confidence?: number | null;
  ai_ready_to_quote?: boolean | null;
  ai_analyzed_at?: string | null;
  ai_dismissed_at?: string | null;
  needs_admin_review?: boolean | null;
  last_customer_reply_at?: string | null;
};

/**
 * Repara AI card. Read-only assistance: the admin decides everything. The only
 * customer-facing action is "Send question", and it always requires an explicit
 * confirmation of the exact (editable) text.
 */
export function ReparaAiCard({
  requestId,
  request,
  onAddToQuote,
}: {
  requestId: string;
  request: AiFields;
  /** Adds an AI-suggested service straight into the quote builder as a labor line. */
  onAddToQuote?: (service: string) => void;
}) {
  const queryClient = useQueryClient();
  const analyze = useServerFn(analyzeRequestFn);
  const dismiss = useServerFn(dismissAnalysisFn);
  const ask = useServerFn(askCustomerFn);
  const listMessages = useServerFn(listCommunicationsFn);
  const clearReview = useServerFn(clearAdminReviewFn);

  const stored = request.ai_analyzed_at
    ? {
        summary: request.ai_summary ?? "",
        needs_clarification: Boolean(request.ai_needs_clarification),
        ready_to_quote: Boolean(request.ai_ready_to_quote),
        clarification_question: request.ai_clarification_question ?? "",
        recommended_services: Array.isArray(request.ai_recommended_services)
          ? (request.ai_recommended_services as { service: string; reason: string }[])
          : [],
        internal_notes: request.ai_internal_notes ?? "",
        confidence: Number(request.ai_confidence ?? 0),
        analyzedAt: request.ai_analyzed_at,
      }
    : null;

  const [analysis, setAnalysis] = useState(stored);
  const [dismissed, setDismissed] = useState(Boolean(request.ai_dismissed_at));
  const [question, setQuestion] = useState(request.ai_clarification_question ?? "");
  const [edited, setEdited] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);

  const messages = useQuery({
    queryKey: ["request-communications", requestId],
    queryFn: () => listMessages({ data: { id: requestId } }),
  });

  const run = useMutation({
    mutationFn: (force: boolean) => analyze({ data: { id: requestId, force } }),
    onSuccess: (result) => {
      setError(null);
      setDismissed(false);
      setAnalysis(result.analysis as typeof stored);
      if (!edited) setQuestion(result.analysis.clarification_question ?? "");
      void queryClient.invalidateQueries({ queryKey: ["admin-request", requestId] });
    },
    onError: (e) => setError((e as Error).message || "The analysis could not be completed."),
  });

  // First open of a never-analyzed request runs the analysis once; afterwards the
  // stored result is reused so a page visit never costs a model call.
  useEffect(() => {
    if (autoRan.current || analysis || run.isPending) return;
    autoRan.current = true;
    run.mutate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useMutation({
    mutationFn: () =>
      ask({
        data: {
          id: requestId,
          message: question.trim(),
          aiGenerated: !edited,
        },
      }),
    onSuccess: (result) => {
      if (result.ok) toast.success("Question sent to the customer.");
      else toast.error(result.error ?? "The question could not be emailed.");
      void messages.refetch();
      void queryClient.invalidateQueries({ queryKey: ["admin-request", requestId] });
    },
    onError: (e) => toast.error((e as Error).message || "The question could not be sent."),
  });

  const markReviewed = useMutation({
    mutationFn: () => clearReview({ data: { id: requestId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-request", requestId] }),
  });

  return (
    <section className="surface-panel min-w-0 space-y-4 overflow-hidden p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs tracking-[0.2em] text-muted-foreground uppercase">
          <Sparkles className="size-4 text-primary" aria-hidden /> Repara AI
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={run.isPending}
            onClick={() => run.mutate(true)}
          >
            {run.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 size-3.5" />
            )}
            {analysis ? "Re-analyze" : "Analyze"}
          </Button>
          {analysis && !dismissed && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Hide AI analysis"
              className="text-muted-foreground"
              onClick={() => {
                setDismissed(true);
                void dismiss({ data: { id: requestId } });
              }}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {request.needs_admin_review && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">
            The customer replied
            {request.last_customer_reply_at
              ? ` · ${new Date(request.last_customer_reply_at).toLocaleString()}`
              : ""}
          </p>
          <Button size="sm" variant="secondary" onClick={() => markReviewed.mutate()}>
            Mark reviewed
          </Button>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {run.isPending && !analysis && <p className="text-sm text-muted-foreground">Reviewing this request…</p>}

      {analysis && !dismissed && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                analysis.ready_to_quote
                  ? "rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-primary uppercase"
                  : "rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              }
            >
              {analysis.ready_to_quote ? "Ready to quote" : "Needs more info"}
            </span>
            {analysis.confidence > 0 && (
              <span className="text-[11px] text-muted-foreground">
                Confidence {Math.round(analysis.confidence * 100)}%
              </span>
            )}
            {analysis.analyzedAt && (
              <span className="text-[11px] text-muted-foreground">
                · {new Date(analysis.analyzedAt).toLocaleString()}
              </span>
            )}
          </div>

          <p className="text-sm leading-relaxed">{analysis.summary}</p>

          {analysis.recommended_services.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">Suggested to verify</p>
              <ul className="space-y-1.5">
                {analysis.recommended_services.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{s.service}</span>
                      {s.reason && <span className="text-muted-foreground"> — {s.reason}</span>}
                    </span>
                    {onAddToQuote && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 border-border bg-transparent"
                        onClick={() => onAddToQuote(s.service)}
                      >
                        <Plus className="mr-1 size-3.5" /> Add to quote
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.internal_notes && (
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="text-xs font-semibold text-muted-foreground">Internal notes</p>
              <p className="mt-1 text-sm leading-relaxed">{analysis.internal_notes}</p>
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground">
              Question for the customer — edit before sending
            </p>
            <Textarea
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                setEdited(true);
              }}
              rows={3}
              maxLength={1000}
              placeholder="Ask the customer for the missing detail…"
              aria-label="Question for the customer"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={send.isPending || question.trim().length < 5}
                onClick={() => setConfirmOpen(true)}
              >
                {send.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Send className="mr-2 size-4" />
                )}
                Send question
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Nothing is sent until you confirm. AI never emails, prices or quotes on its own.
              </p>
            </div>
          </div>
        </div>
      )}

      {analysis && dismissed && (
        <p className="text-sm text-muted-foreground">
          AI analysis hidden for this request. Use Re-analyze to bring it back.
        </p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this question to the customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This emails the customer a secure link to answer. This exact text will be sent:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="rounded-lg bg-muted p-3 text-sm leading-relaxed">{question.trim()}</p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => send.mutate()}>Send question</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
