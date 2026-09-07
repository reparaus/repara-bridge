import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteFinding,
  deleteRecommendation,
  draftFindingRecommendations,
  saveFinding,
  saveRecommendation,
  type JobConcern,
  type JobFinding,
  type JobRecommendation,
} from "@/lib/job.functions";

/**
 * Findings and recommendations for one job.
 *
 * A finding is a fact discovered on the vehicle. It converts into a
 * recommendation (customer-facing wording), which then converts into quote
 * lines — no retyping at any step. AI-drafted recommendations stay "draft"
 * until a human approves them.
 */

const SEVERITIES: JobFinding["severity"][] = ["urgent", "recommended", "monitor", "informational"];

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "border-destructive/40 bg-destructive/10 text-destructive",
  recommended: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  monitor: "border-border bg-muted/50 text-muted-foreground",
  informational: "border-border bg-muted/50 text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft — needs approval",
  approved: "Approved",
  quoted: "On quote",
  customer_approved: "Customer approved",
  customer_declined: "Customer declined",
  deferred: "Deferred",
};

export function JobFindings({
  requestId,
  findings,
  recommendations,
  concerns,
  onAddToQuote,
}: {
  requestId: string;
  findings: JobFinding[];
  recommendations: JobRecommendation[];
  concerns: JobConcern[];
  onAddToQuote: (recommendation: JobRecommendation) => void;
}) {
  const queryClient = useQueryClient();
  const persistFinding = useServerFn(saveFinding);
  const removeFinding = useServerFn(deleteFinding);
  const persistRecommendation = useServerFn(saveRecommendation);
  const removeRecommendation = useServerFn(deleteRecommendation);
  const runRecommendationDrafts = useServerFn(draftFindingRecommendations);

  const [title, setTitle] = useState("");
  const [measurement, setMeasurement] = useState("");
  const [severity, setSeverity] = useState<JobFinding["severity"]>("recommended");
  const [detail, setDetail] = useState("");
  const [concernId, setConcernId] = useState("");
  const [converting, setConverting] = useState<JobFinding | null>(null);
  const [recTitle, setRecTitle] = useState("");
  const [recDescription, setRecDescription] = useState("");
  const [recInternal, setRecInternal] = useState("");
  const [recPriority, setRecPriority] = useState("recommended");
  const [recDrafts, setRecDrafts] = useState<
    { title: string; customerDescription: string; internalNotes: string; priority: string }[]
  >([]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["job-workspace", requestId] });

  const addFinding = useMutation({
    mutationFn: () =>
      persistFinding({
        data: {
          id: requestId,
          title: title.trim(),
          measurement: measurement.trim(),
          detail: detail.trim(),
          severity,
          source: "technician",
        },
      }),
    onSuccess: () => {
      setTitle("");
      setMeasurement("");
      setDetail("");
      toast.success("Finding saved.");
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save this finding."),
  });

  const createRecommendation = useMutation({
    mutationFn: () =>
      persistRecommendation({
        data: {
          id: requestId,
          findingId: converting?.id ?? null,
          title: recTitle.trim(),
          customerDescription: recDescription.trim(),
          priority: recPriority as "recommended",
          status: "draft",
        },
      }),
    onSuccess: () => {
      setConverting(null);
      toast.success("Recommendation created as a draft.");
      void refresh();
    },
    onError: () => toast.error("Could not create this recommendation."),
  });

  const approve = useMutation({
    mutationFn: (rec: JobRecommendation) =>
      persistRecommendation({
        data: {
          id: requestId,
          recommendationId: rec.id,
          title: rec.title,
          customerDescription: rec.customerDescription ?? "",
          internalNotes: rec.internalNotes ?? "",
          priority: rec.priority as "recommended",
          status: "approved",
        },
      }),
    onSuccess: () => {
      toast.success("Approved — ready for the quote.");
      void refresh();
    },
    onError: () => toast.error("Could not approve this recommendation."),
  });

  const delFinding = useMutation({
    mutationFn: (findingId: string) => removeFinding({ data: { findingId } }),
    onSuccess: () => void refresh(),
  });
  const delRecommendation = useMutation({
    mutationFn: (recommendationId: string) => removeRecommendation({ data: { recommendationId } }),
    onSuccess: () => void refresh(),
  });

  function startConvert(finding: JobFinding) {
    setConverting(finding);
    setRecTitle(finding.title);
    setRecDescription(finding.detail ?? "");
    setRecPriority(finding.severity === "informational" ? "monitor" : finding.severity);
  }

  return (
    <section className="space-y-4">
      <div className="surface-panel space-y-3 p-4">
        <h2 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Add a finding</h2>
        <Input
          value={title}
          placeholder="Front brake pads measured 2 mm"
          className="h-12"
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={measurement}
            placeholder="Measurement (2 mm, 310 CCA…)"
            className="h-12"
            onChange={(e) => setMeasurement(e.target.value)}
          />
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as JobFinding["severity"])}
            aria-label="Severity"
            className="h-12 rounded-md border border-input bg-surface px-3 text-sm"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <Textarea
          rows={2}
          value={detail}
          placeholder="Detail (optional)"
          onChange={(e) => setDetail(e.target.value)}
        />
        <Button
          type="button"
          className="h-12 w-full sm:w-auto"
          disabled={addFinding.isPending || title.trim().length < 2}
          onClick={() => addFinding.mutate()}
        >
          {addFinding.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Plus className="mr-2 size-4" />
          )}
          Save finding
        </Button>
      </div>

      <div className="surface-panel space-y-3 p-4">
        <h3 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Findings</h3>
        {findings.length === 0 && (
          <p className="text-xs text-muted-foreground">No findings recorded yet.</p>
        )}
        <ul className="space-y-3">
          {findings.map((finding) => (
            <li key={finding.id} className="space-y-2 border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${PRIORITY_STYLE[finding.severity] ?? ""}`}
                    >
                      {finding.severity}
                    </span>
                    {finding.source === "ai" && (
                      <span className="text-[10px] text-muted-foreground">AI-drafted, you saved it</span>
                    )}
                    {finding.status === "converted" && (
                      <span className="text-[10px] text-muted-foreground">→ recommended</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium break-words">{finding.title}</p>
                  {finding.measurement && <p className="text-xs">{finding.measurement}</p>}
                  {finding.detail && (
                    <p className="text-xs whitespace-pre-line text-muted-foreground">{finding.detail}</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Remove finding"
                  className="p-2 text-muted-foreground hover:text-destructive"
                  onClick={() => delFinding.mutate(finding.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 border-border bg-transparent text-xs"
                onClick={() => startConvert(finding)}
              >
                Make recommendation <ArrowRight className="ml-1.5 size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      {converting && (
        <div className="surface-panel space-y-3 p-4">
          <h3 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
            New recommendation
          </h3>
          <Input
            value={recTitle}
            className="h-12"
            placeholder="Recommended work"
            onChange={(e) => setRecTitle(e.target.value)}
          />
          <Textarea
            rows={3}
            value={recDescription}
            placeholder="Plain-language explanation the customer will read"
            onChange={(e) => setRecDescription(e.target.value)}
          />
          <select
            value={recPriority}
            onChange={(e) => setRecPriority(e.target.value)}
            aria-label="Priority"
            className="h-12 w-full rounded-md border border-input bg-surface px-3 text-sm"
          >
            <option value="urgent">Urgent</option>
            <option value="recommended">Recommended</option>
            <option value="monitor">Monitor</option>
          </select>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-12"
              disabled={createRecommendation.isPending || recTitle.trim().length < 2}
              onClick={() => createRecommendation.mutate()}
            >
              {createRecommendation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create recommendation
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              onClick={() => setConverting(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="surface-panel space-y-3 p-4">
        <h3 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Recommendations
        </h3>
        {recommendations.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nothing recommended yet. Convert a finding above.
          </p>
        )}
        <ul className="space-y-3">
          {recommendations.map((rec) => (
            <li key={rec.id} className="space-y-2 border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${PRIORITY_STYLE[rec.priority] ?? ""}`}
                    >
                      {rec.priority}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {STATUS_LABEL[rec.status] ?? rec.status}
                      {rec.aiDrafted ? " · AI-drafted" : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium break-words">{rec.title}</p>
                  {rec.customerDescription && (
                    <p className="text-xs whitespace-pre-line text-muted-foreground">
                      {rec.customerDescription}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Remove recommendation"
                  className="p-2 text-muted-foreground hover:text-destructive"
                  onClick={() => delRecommendation.mutate(rec.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {rec.status === "draft" && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 text-xs"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate(rec)}
                  >
                    <Check className="mr-1.5 size-3.5" /> Approve
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 border-border bg-transparent text-xs"
                  onClick={() => onAddToQuote(rec)}
                >
                  Add to quote
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
