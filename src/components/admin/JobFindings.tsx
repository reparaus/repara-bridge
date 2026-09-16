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
          concernId: concernId || null,
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

  /** Confirms an AI-drafted finding — the human gate before it counts as fact. */
  const confirmFinding = useMutation({
    mutationFn: (finding: JobFinding) =>
      persistFinding({
        data: {
          id: requestId,
          findingId: finding.id,
          concernId: finding.concernId,
          title: finding.title,
          detail: finding.detail ?? "",
          measurement: finding.measurement ?? "",
          severity: finding.severity,
          source: finding.source,
          approve: true,
        },
      }),
    onSuccess: () => {
      toast.success("Finding confirmed.");
      void refresh();
    },
    onError: () => toast.error("Could not confirm this finding."),
  });

  const createRecommendation = useMutation({
    mutationFn: () =>
      persistRecommendation({
        data: {
          id: requestId,
          findingId: converting?.id ?? null,
          concernId: converting?.concernId ?? null,
          title: recTitle.trim(),
          customerDescription: recDescription.trim(),
          internalNotes: recInternal.trim(),
          priority: recPriority as "recommended",
          status: "draft",
        },
      }),
    onSuccess: () => {
      setConverting(null);
      setRecInternal("");
      toast.success("Recommendation created as a draft.");
      void refresh();
    },
    onError: () => toast.error("Could not create this recommendation."),
  });

  /** Repara AI drafts recommendation wording from a confirmed finding. */
  const draftRecs = useMutation({
    mutationFn: (finding: JobFinding) =>
      runRecommendationDrafts({
        data: { id: requestId, findingIds: [finding.id], concernId: finding.concernId },
      }),
    onSuccess: (res) => {
      setRecDrafts(res.drafts);
      if (!res.drafts.length) toast.info("Nothing to recommend from that finding.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Repara AI could not draft this."),
  });

  const keepRecDraft = useMutation({
    mutationFn: (d: (typeof recDrafts)[number]) =>
      persistRecommendation({
        data: {
          id: requestId,
          title: d.title,
          customerDescription: d.customerDescription,
          internalNotes: d.internalNotes,
          priority: d.priority as "recommended",
          status: "draft",
          aiDrafted: true,
        },
      }),
    onSuccess: (_res, d) => {
      setRecDrafts((all) => all.filter((x) => x.title !== d.title));
      toast.success("Saved as a draft — approve it when the wording is right.");
      void refresh();
    },
    onError: () => toast.error("Could not save this recommendation."),
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
    setRecInternal(finding.evidence ?? "");
    setRecPriority(finding.severity === "informational" ? "monitor" : finding.severity);
  }

  const concernTitle = (id: string | null) =>
    concerns.find((c) => c.id === id)?.title ?? "";

  return (
    <section className="space-y-4">
      {/* Inspection sheet entry: condition first, then one plain-language note. */}
      <div className="surface-panel space-y-3 p-4">
        <h2 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Add a finding</h2>

        <div className="-mx-1 flex flex-wrap gap-2 px-1">
          {CONDITIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCondition(c.value)}
              className={`h-11 rounded-lg border px-3 text-xs font-medium ${
                condition === c.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface text-muted-foreground"
              }`}
            >
              <span aria-hidden className="mr-1.5">
                {c.dot}
              </span>
              {c.label}
            </button>
          ))}
        </div>

        <Textarea
          rows={3}
          value={note}
          placeholder="What did you find? e.g. rear pads 3mm, light lip on both rotors"
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={system}
            aria-label="Vehicle system"
            onChange={(e) => setSystem(e.target.value)}
            className="h-12 rounded-md border border-input bg-surface px-3 text-sm"
          >
            <option value="">System (optional)</option>
            {SYSTEMS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Input
            value={measurement}
            placeholder="Measurement (2 mm, 310 CCA…)"
            className="h-12"
            onChange={(e) => setMeasurement(e.target.value)}
          />
        </div>

        {concerns.length > 0 && (
          <select
            value={concernId}
            aria-label="Related concern"
            onChange={(e) => setConcernId(e.target.value)}
            className="h-12 w-full rounded-md border border-input bg-surface px-3 text-sm"
          >
            <option value="">Not tied to a specific concern</option>
            {concerns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}

        {/* Red is not a safety claim on its own — safety is opted into. */}
        {condition === "needs_attention" && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={safety}
              className="size-4"
              onChange={(e) => setSafety(e.target.checked)}
            />
            This affects safe operation of the vehicle
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-12 flex-1 sm:flex-none"
            disabled={addFinding.isPending || note.trim().length < 3}
            onClick={() => addFinding.mutate()}
          >
            {addFinding.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Save finding
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 border-border bg-transparent text-xs"
            disabled={cleanup.isPending || note.trim().length < 3}
            onClick={() => cleanup.mutate()}
          >
            {cleanup.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            Clean up with Repara AI
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Repara AI only tidies what you wrote. It never adds a measurement, cause or safety claim
          you did not record.
        </p>
      </div>

      {grouped.map(([groupName, groupFindings]) => (
        <div key={groupName} className="surface-panel space-y-3 p-4">
          <h3 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">{groupName}</h3>
          <ul className="space-y-3">
            {groupFindings.map((finding) => (
              <li key={finding.id} className="space-y-2 border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${PRIORITY_STYLE[finding.severity] ?? ""}`}
                    >
                      {finding.severity}
                    </span>
                    {finding.aiDrafted && !finding.approvedAt && (
                      <span className="text-[10px] text-warning">AI-drafted — confirm it</span>
                    )}
                    {finding.approvedAt && (
                      <span className="text-[10px] text-muted-foreground">Confirmed</span>
                    )}
                    {finding.confidence === "suspected" && (
                      <span className="text-[10px] text-muted-foreground">suspected</span>
                    )}
                    {concernTitle(finding.concernId) && (
                      <span className="text-[10px] text-muted-foreground">
                        {concernTitle(finding.concernId)}
                      </span>
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
                  {finding.evidence && (
                    <p className="text-xs text-muted-foreground">Evidence: {finding.evidence}</p>
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
              <div className="flex flex-wrap gap-2">
                {finding.aiDrafted && !finding.approvedAt && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 text-xs"
                    disabled={confirmFinding.isPending}
                    onClick={() => confirmFinding.mutate(finding)}
                  >
                    <Check className="mr-1.5 size-3.5" /> Confirm
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 border-border bg-transparent text-xs"
                  onClick={() => startConvert(finding)}
                >
                  Make recommendation <ArrowRight className="ml-1.5 size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 border-border bg-transparent text-xs"
                  disabled={draftRecs.isPending}
                  onClick={() => draftRecs.mutate(finding)}
                >
                  {draftRecs.isPending ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 size-3.5" />
                  )}
                  Draft with AI
                </Button>
              </div>
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
          {/* Internal wording stays internal — it never reaches the customer. */}
          <Textarea
            rows={2}
            value={recInternal}
            placeholder="Internal notes (technical wording, parts, cautions) — customer never sees this"
            onChange={(e) => setRecInternal(e.target.value)}
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

      {recDrafts.length > 0 && (
        <div className="surface-panel space-y-3 p-4">
          <h3 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
            AI-drafted recommendations — keep what fits
          </h3>
          {recDrafts.map((d, i) => (
            <div key={i} className="space-y-1 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{d.title}</p>
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                {d.priority}
              </p>
              {d.customerDescription && <p className="text-sm">{d.customerDescription}</p>}
              {d.internalNotes && (
                <p className="text-xs text-muted-foreground">Internal: {d.internalNotes}</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className="h-10 text-xs"
                  disabled={keepRecDraft.isPending}
                  onClick={() => keepRecDraft.mutate(d)}
                >
                  Keep as draft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-10 text-xs"
                  onClick={() => setRecDrafts((all) => all.filter((_, x) => x !== i))}
                >
                  Discard
                </Button>
              </div>
            </div>
          ))}
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
