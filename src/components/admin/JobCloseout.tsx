import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  draftConcernCloseout,
  saveConcern,
  saveJobOutcome,
  type JobConcern,
} from "@/lib/job.functions";

const OUTCOME_OPTIONS: { value: NonNullable<JobConcern["outcome"]>; label: string }[] = [
  { value: "resolved", label: "Resolved" },
  { value: "not_resolved", label: "Not resolved" },
  { value: "not_yet_known", label: "Not yet known" },
  { value: "unable_to_verify", label: "Unable to verify" },
  { value: "deferred", label: "Deferred" },
  { value: "further_diagnosis", label: "Needs more diagnosis" },
  { value: "monitor", label: "Monitor" },
  { value: "inspection_only", label: "Inspection only" },
];

/**
 * Structured repair outcome captured at closeout. Kept deliberately short so it
 * actually gets filled in, and structured so de-identified outcomes can support
 * diagnostic pattern analysis later instead of being lost in free-text notes.
 * Closing the job is always an explicit human action.
 *
 * Each concern is closed out on its own — a job can resolve one complaint while
 * another is deferred, and the customer should be told exactly that.
 */
export function JobCloseout({
  requestId,
  originalConcern,
  outcome,
  concerns,
}: {
  requestId: string;
  originalConcern: string;
  outcome: {
    confirmedCause: string | null;
    repairPerformed: string | null;
    resolved: boolean | null;
    verification: string | null;
    technicianNotes: string | null;
    remainingRecommendations: string | null;
    customerSummary: string | null;
    completionMileage: number | null;
    completedAt: string | null;
  } | null;
  concerns: JobConcern[];
}) {
  const queryClient = useQueryClient();
  const persist = useServerFn(saveJobOutcome);

  const [confirmedCause, setConfirmedCause] = useState(outcome?.confirmedCause ?? "");
  const [repairPerformed, setRepairPerformed] = useState(outcome?.repairPerformed ?? "");
  const [resolved, setResolved] = useState<boolean | null>(outcome?.resolved ?? null);
  const [verification, setVerification] = useState(outcome?.verification ?? "");
  const [technicianNotes, setTechnicianNotes] = useState(outcome?.technicianNotes ?? "");
  const [remaining, setRemaining] = useState(outcome?.remainingRecommendations ?? "");
  const [customerSummary, setCustomerSummary] = useState(outcome?.customerSummary ?? "");
  const [completionMileage, setCompletionMileage] = useState(
    outcome?.completionMileage ? String(outcome.completionMileage) : "",
  );

  const save = useMutation({
    mutationFn: (close: boolean) =>
      persist({
        data: {
          id: requestId,
          originalConcern,
          confirmedCause,
          repairPerformed,
          resolved,
          verification,
          technicianNotes,
          remainingRecommendations: remaining,
          customerSummary,
          completionMileage: completionMileage.trim() ? Number(completionMileage) : null,
          close,
        },
      }),
    onSuccess: (_res, close) => {
      toast.success(close ? "Job closed." : "Outcome saved.");
      void queryClient.invalidateQueries({ queryKey: ["job-workspace", requestId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-request", requestId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save the outcome."),
  });

  /** Rolls up the per-concern work so the job summary is not retyped. */
  function prefillFromConcerns() {
    const join = (pick: (c: JobConcern) => string | null) =>
      concerns
        .map((c) => (pick(c) ? `${c.title}: ${pick(c)}` : ""))
        .filter(Boolean)
        .join("\n");
    setConfirmedCause((v) => v || join((c) => c.confirmedCause));
    setRepairPerformed((v) => v || join((c) => c.repairPerformed));
    setVerification((v) => v || join((c) => c.verification));
    if (concerns.length && concerns.every((c) => c.outcome === "resolved")) setResolved(true);
  }

  return (
    <section className="surface-panel space-y-3 p-4">
      <h2 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Repair outcome</h2>
      {outcome?.completedAt && (
        <p className="text-xs text-muted-foreground">
          Closed {new Date(outcome.completedAt).toLocaleString()}
        </p>
      )}

      {concerns.length > 0 && (
        <div className="space-y-3">
          {concerns.map((c) => (
            <ConcernCloseout key={c.id} requestId={requestId} concern={c} />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 border-border bg-transparent text-xs"
            onClick={prefillFromConcerns}
          >
            Fill the job summary from these
          </Button>
        </div>
      )}

      <div>
        <p className="text-xs text-muted-foreground">Original concern</p>
        <p className="text-sm whitespace-pre-line">{originalConcern || "—"}</p>
      </div>


      <Field label="Confirmed cause">
        <Textarea rows={2} value={confirmedCause} onChange={(e) => setConfirmedCause(e.target.value)} />
      </Field>
      <Field label="Repair performed">
        <Textarea rows={2} value={repairPerformed} onChange={(e) => setRepairPerformed(e.target.value)} />
      </Field>

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Did the repair resolve the concern?</p>
        <div className="flex gap-2">
          {[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
            { value: null, label: "Not yet known" },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setResolved(option.value)}
              className={`h-11 flex-1 rounded-lg border text-xs font-medium ${
                resolved === option.value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface text-muted-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Field label="How it was verified">
        <Textarea rows={2} value={verification} onChange={(e) => setVerification(e.target.value)} />
      </Field>
      <Field label="Remaining recommendations">
        <Textarea rows={2} value={remaining} onChange={(e) => setRemaining(e.target.value)} />
      </Field>
      <Field label="Customer completion summary">
        <Textarea
          rows={3}
          value={customerSummary}
          onChange={(e) => setCustomerSummary(e.target.value)}
          placeholder="A clear, customer-safe summary of completed work"
        />
      </Field>
      <Field label="Mileage at completion">
        <input
          value={completionMileage}
          onChange={(e) => setCompletionMileage(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          className="h-11 w-full rounded-md border border-input bg-surface px-3 text-sm"
          placeholder="Optional"
        />
      </Field>
      <Field label="Technician notes (internal)">
        <Textarea rows={2} value={technicianNotes} onChange={(e) => setTechnicianNotes(e.target.value)} />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-12 border-border bg-transparent"
          disabled={save.isPending}
          onClick={() => save.mutate(false)}
        >
          {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Save outcome
        </Button>
        <Button
          type="button"
          className="h-12"
          disabled={save.isPending || !customerSummary.trim() || (!repairPerformed.trim() && !concerns.some((c) => c.repairPerformed?.trim() && ["resolved", "not_resolved", "unable_to_verify", "monitor"].includes(c.outcome ?? "")))}
          onClick={() => save.mutate(true)}
        >
          Save &amp; close job
        </Button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * One concern's outcome: what was actually performed, how it was verified, and
 * where it landed. Repara AI can draft the wording from what is already
 * documented; the technician still saves it.
 */
function ConcernCloseout({ requestId, concern }: { requestId: string; concern: JobConcern }) {
  const persist = useServerFn(saveConcern);
  const runDraft = useServerFn(draftConcernCloseout);
  const queryClient = useQueryClient();

  const [performed, setPerformed] = useState(concern.repairPerformed ?? "");
  const [verification, setVerification] = useState(concern.verification ?? "");
  const [result, setResult] = useState<NonNullable<JobConcern["outcome"]> | "">(
    concern.outcome ?? "",
  );

  const save = useMutation({
    mutationFn: () =>
      persist({
        data: {
          id: requestId,
          concernId: concern.id,
          repairPerformed: performed,
          verification,
          outcome: (result || null) as never,
        } as never,
      }),
    onSuccess: () => {
      toast.success("Concern outcome saved.");
      void queryClient.invalidateQueries({ queryKey: ["job-workspace", requestId] });
    },
    onError: () => toast.error("Could not save this outcome."),
  });

  const draft = useMutation({
    mutationFn: () => runDraft({ data: { concernId: concern.id } }),
    onSuccess: (res) => {
      if (!performed.trim()) setPerformed(res.draft.repairPerformed);
      if (!verification.trim()) setVerification(res.draft.verification);
      if (!result) setResult(res.draft.outcome as NonNullable<JobConcern["outcome"]>);
      toast.success("Draft filled in — review it before saving.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Repara AI could not draft this."),
  });

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{concern.title}</p>
      {concern.customerReport && (
        <p className="text-xs text-muted-foreground">Customer reported: {concern.customerReport}</p>
      )}
      <Field label="What was performed">
        <Textarea rows={2} value={performed} onChange={(e) => setPerformed(e.target.value)} />
      </Field>
      <Field label="How it was verified">
        <Textarea rows={2} value={verification} onChange={(e) => setVerification(e.target.value)} />
      </Field>
      <select
        value={result}
        aria-label="Outcome"
        onChange={(e) => setResult(e.target.value as NonNullable<JobConcern["outcome"]>)}
        className="h-11 w-full rounded-md border border-input bg-surface px-3 text-sm"
      >
        <option value="">Outcome not set</option>
        {OUTCOME_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-10 text-xs"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />} Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-10 border-border bg-transparent text-xs"
          disabled={draft.isPending}
          onClick={() => draft.mutate()}
        >
          {draft.isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 size-3.5" />
          )}
          Draft with AI
        </Button>
      </div>
    </div>
  );
}
