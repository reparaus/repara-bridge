import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, ChevronDown, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { askJobCopilot, listJobCopilot, saveFinding, saveRecommendation } from "@/lib/job.functions";

/**
 * Repara AI technician copilot for ONE job.
 *
 * The job context (vehicle, concern, intake, DTCs, findings, recommendations,
 * conversation) is assembled server-side, so the technician never re-types the
 * vehicle. Nothing here changes job state or reaches a customer: AI output is
 * clearly labelled and only becomes a finding/recommendation when the
 * technician saves it.
 */

type QuickAction = {
  action:
    | "diagnose"
    | "next_test"
    | "explain_dtc"
    | "find_procedure"
    | "specs"
    | "reset_relearn"
    | "summarize_job"
    | "draft_finding"
    | "draft_recommendation";
  label: string;
  prompt: string;
  needsInput?: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { action: "diagnose", label: "Diagnose concern", prompt: "Evaluate this concern and give likely causes, why each fits, a test order, and what is still missing." },
  { action: "next_test", label: "Test next?", prompt: "Based on everything already documented, what is the most logical next diagnostic step and what would each result rule in or out?" },
  { action: "explain_dtc", label: "Explain DTC", prompt: "Explain this DTC on this vehicle in the context of what is already documented:", needsInput: "P0301" },
  { action: "find_procedure", label: "Find procedure", prompt: "Outline the general procedure for this on this vehicle:", needsInput: "e.g. water pump replacement" },
  { action: "specs", label: "Fluid / specs", prompt: "What is being asked for, the typical range for this type of vehicle, and what must be verified:", needsInput: "e.g. oil capacity" },
  { action: "reset_relearn", label: "Reset / relearn", prompt: "Describe the reset or relearn normally required here:", needsInput: "e.g. TPMS relearn" },
  { action: "summarize_job", label: "Summarize job", prompt: "Summarize this job for a technician taking it over: concern, work done, what is confirmed, what is open." },
  { action: "draft_finding", label: "Draft finding", prompt: "Turn this into one concise factual technician finding:", needsInput: "what you found" },
  { action: "draft_recommendation", label: "Draft recommendation", prompt: "Draft a plain-language customer explanation for this recommended work:", needsInput: "what you recommend" },
];

const VERIFICATION_LABEL: Record<string, { label: string; className: string }> = {
  job_data: {
    label: "Based on this job's documented information",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  reasoning: {
    label: "AI reasoning — not a confirmed diagnosis",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  unverified: {
    label: "Unverified — confirm against authorized service data",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

export function JobCopilot({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const ask = useServerFn(askJobCopilot);
  const fetchLog = useServerFn(listJobCopilot);
  const persistFinding = useServerFn(saveFinding);
  const persistRecommendation = useServerFn(saveRecommendation);

  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<QuickAction | null>(null);
  const [pendingInput, setPendingInput] = useState("");
  /**
   * Answers from this session, kept in the browser as well. Saving the
   * transcript can fail (that was the disappearing-answer bug); the technician
   * should still see what they just asked for.
   */
  const [local, setLocal] = useState<
    { id: string; role: "technician" | "assistant"; content: string; payload: AssistantPayload }[]
  >([]);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  const log = useQuery({
    queryKey: ["job-copilot", requestId],
    queryFn: () => fetchLog({ data: { id: requestId } }),
  });

  const turn = useMutation({
    mutationFn: (input: { action: QuickAction["action"] | "ask"; question: string }) =>
      ask({ data: { id: requestId, action: input.action, question: input.question } }),
    onSuccess: (res, input) => {
      setQuestion("");
      setPending(null);
      setPendingInput("");
      const stamp = Date.now();
      setLocal((all) => [
        ...all,
        { id: `q-${stamp}`, role: "technician", content: input.question, payload: {} },
        {
          id: `a-${stamp}`,
          role: "assistant",
          content: res.answer.answer,
          payload: res.answer as AssistantPayload,
        },
      ]);
      setSaveWarning(
        res.persisted
          ? null
          : "This answer could not be saved to the job history — copy anything you need to keep.",
      );
      void log.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Repara AI could not answer."),
  });

  function runQuickAction(quick: QuickAction) {
    if (quick.needsInput && !pendingInput.trim()) {
      setPending(quick);
      return;
    }
    turn.mutate({
      action: quick.action,
      question: [quick.prompt, pendingInput.trim()].filter(Boolean).join(" "),
    });
  }

  const saveAsFinding = useMutation({
    mutationFn: (payload: { title: string; detail: string }) =>
      persistFinding({
        data: {
          id: requestId,
          title: payload.title.slice(0, 200),
          detail: payload.detail,
          source: "ai",
          severity: "recommended",
        },
      }),
    onSuccess: () => {
      toast.success("Saved as a finding.");
      void queryClient.invalidateQueries({ queryKey: ["job-workspace", requestId] });
    },
    onError: () => toast.error("Could not save this finding."),
  });

  const saveAsRecommendation = useMutation({
    mutationFn: (payload: { title: string; description: string; priority: string }) =>
      persistRecommendation({
        data: {
          id: requestId,
          title: payload.title.slice(0, 200),
          customerDescription: payload.description,
          priority: payload.priority as "recommended",
          aiDrafted: true,
          status: "draft",
        },
      }),
    onSuccess: () => {
      toast.success("Draft recommendation created — approve it before sending.");
      void queryClient.invalidateQueries({ queryKey: ["job-workspace", requestId] });
    },
    onError: () => toast.error("Could not save this recommendation."),
  });

  const messages = log.data?.messages ?? [];

  return (
    <section className="surface-panel space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-primary" />
        <h2 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Repara AI copilot
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Knows this vehicle, the customer concern, intake answers, DTCs and your findings. It never
        confirms a diagnosis and never messages the customer.
      </p>

      {/* Quick actions — each one runs a real workflow against the job context. */}
      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        {QUICK_ACTIONS.map((quick) => (
          <Button
            key={quick.action}
            type="button"
            variant="outline"
            size="sm"
            disabled={turn.isPending}
            className="h-10 border-border bg-transparent text-xs"
            onClick={() => runQuickAction(quick)}
          >
            <Sparkles className="mr-1.5 size-3.5" />
            {quick.label}
          </Button>
        ))}
      </div>

      {pending && (
        <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-medium">{pending.label}</p>
          <Input
            autoFocus
            value={pendingInput}
            placeholder={pending.needsInput}
            className="h-12"
            onChange={(e) => setPendingInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pendingInput.trim()) runQuickAction(pending);
            }}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-10"
              disabled={!pendingInput.trim() || turn.isPending}
              onClick={() => runQuickAction(pending)}
            >
              Ask
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-10"
              onClick={() => {
                setPending(null);
                setPendingInput("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {messages.length === 0 && !turn.isPending && (
          <p className="text-xs text-muted-foreground">
            No copilot activity on this job yet. Pick a quick action or ask a question.
          </p>
        )}
        {messages.map((message) =>
          message.role === "technician" ? (
            <div key={message.id} className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">You</p>
              <p className="mt-1 text-sm whitespace-pre-line">{message.content}</p>
            </div>
          ) : (
            <AssistantMessage
              key={message.id}
              content={message.content}
              payload={message.payload}
              busy={saveAsFinding.isPending || saveAsRecommendation.isPending}
              onSaveFinding={(title, detail) => saveAsFinding.mutate({ title, detail })}
              onSaveRecommendation={(title, description, priority) =>
                saveAsRecommendation.mutate({ title, description, priority })
              }
            />
          ),
        )}
        {turn.isPending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Repara AI is working through the job…
          </p>
        )}
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          rows={2}
          value={question}
          placeholder="Ask about this job — symptoms, tests, codes, next steps…"
          className="min-h-12"
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button
          type="button"
          className="h-12 shrink-0"
          disabled={turn.isPending || question.trim().length < 2}
          onClick={() => turn.mutate({ action: "ask", question: question.trim() })}
        >
          {turn.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          <span className="sr-only">Ask Repara AI</span>
        </Button>
      </div>
    </section>
  );
}

type AssistantPayload = {
  answer?: string;
  likelyCauses?: { cause: string; why: string; test: string }[];
  nextSteps?: string[];
  missingInfo?: string[];
  verification?: string;
  caveats?: string;
  suggestedFinding?: { title: string; detail: string } | null;
  suggestedRecommendation?: {
    title: string;
    customerDescription: string;
    priority: string;
  } | null;
};

function AssistantMessage({
  content,
  payload,
  busy,
  onSaveFinding,
  onSaveRecommendation,
}: {
  content: string;
  payload: AssistantPayload;
  busy: boolean;
  onSaveFinding: (title: string, detail: string) => void;
  onSaveRecommendation: (title: string, description: string, priority: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const verification = VERIFICATION_LABEL[payload.verification ?? "reasoning"]!;
  const causes = payload.likelyCauses ?? [];
  const steps = payload.nextSteps ?? [];
  const missing = payload.missingInfo ?? [];

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${verification.className}`}>
          {verification.label}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-sm whitespace-pre-line">{content}</p>

          {causes.length > 0 && (
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Likely causes (unconfirmed)
              </p>
              <ul className="mt-1 space-y-2">
                {causes.map((c) => (
                  <li key={c.cause}>
                    <p className="text-sm font-medium">{c.cause}</p>
                    {c.why && <p className="text-xs text-muted-foreground">{c.why}</p>}
                    {c.test && <p className="text-xs">Test: {c.test}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {steps.length > 0 && (
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Next steps</p>
              <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm">
                {steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {missing.length > 0 && (
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Still missing
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {payload.caveats && (
            <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {payload.caveats}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              className="h-10 border-border bg-transparent text-xs"
              onClick={() =>
                onSaveFinding(
                  payload.suggestedFinding?.title || content.slice(0, 120),
                  payload.suggestedFinding?.detail || content,
                )
              }
            >
              Create finding
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              className="h-10 border-border bg-transparent text-xs"
              onClick={() =>
                onSaveRecommendation(
                  payload.suggestedRecommendation?.title || content.slice(0, 120),
                  payload.suggestedRecommendation?.customerDescription || content,
                  payload.suggestedRecommendation?.priority || "recommended",
                )
              }
            >
              Create recommendation
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
