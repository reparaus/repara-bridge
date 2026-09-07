import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveJobOutcome } from "@/lib/job.functions";

/**
 * Structured repair outcome captured at closeout. Kept deliberately short so it
 * actually gets filled in, and structured so de-identified outcomes can support
 * diagnostic pattern analysis later instead of being lost in free-text notes.
 * Closing the job is always an explicit human action.
 */
export function JobCloseout({
  requestId,
  originalConcern,
  outcome,
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
    completedAt: string | null;
  } | null;
}) {
  const queryClient = useQueryClient();
  const persist = useServerFn(saveJobOutcome);

  const [confirmedCause, setConfirmedCause] = useState(outcome?.confirmedCause ?? "");
  const [repairPerformed, setRepairPerformed] = useState(outcome?.repairPerformed ?? "");
  const [resolved, setResolved] = useState<boolean | null>(outcome?.resolved ?? null);
  const [verification, setVerification] = useState(outcome?.verification ?? "");
  const [technicianNotes, setTechnicianNotes] = useState(outcome?.technicianNotes ?? "");
  const [remaining, setRemaining] = useState(outcome?.remainingRecommendations ?? "");

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

  return (
    <section className="surface-panel space-y-3 p-4">
      <h2 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Repair outcome</h2>
      {outcome?.completedAt && (
        <p className="text-xs text-muted-foreground">
          Closed {new Date(outcome.completedAt).toLocaleString()}
        </p>
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
          disabled={save.isPending || !repairPerformed.trim()}
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
