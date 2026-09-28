import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addConcern,
  draftConcernFindings,
  draftConcernStory,
  saveConcern,
  saveFinding,
  type JobConcern,
} from "@/lib/job.functions";

/**
 * Diagnostic Concern Cards — the technician's working surface.
 *
 * One card per concern, each carrying the customer's own words and intake
 * answers forward so nothing is retyped, and keeping the provenance layers in
 * separate fields: what the customer reported, what was tested, what was
 * observed, and only then a confirmed cause.
 *
 * Repara AI appears here as an assistant: shorthand notes can be cleaned up
 * into a documentation-quality account, but the draft is never saved until the
 * technician approves it.
 */

const STATUS_OPTIONS: { value: JobConcern["concernStatus"]; label: string }[] = [
  { value: "not_inspected", label: "Not inspected" },
  { value: "verified", label: "Verified" },
  { value: "not_verified", label: "Not verified" },
  { value: "unable_to_duplicate", label: "Could not duplicate" },
  { value: "deferred", label: "Deferred" },
];

export function JobConcerns({
  requestId,
  concerns,
  onFindingsDrafted,
}: {
  requestId: string;
  concerns: JobConcern[];
  onFindingsDrafted: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(addConcern);
  const [newTitle, setNewTitle] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["job-workspace", requestId] });
  };

  const add = useMutation({
    mutationFn: (title: string) => create({ data: { id: requestId, title } }),
    onSuccess: () => {
      setNewTitle("");
      toast.success("Concern added.");
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add this concern."),
  });

  return (
    <div className="space-y-4">
      {concerns.length === 0 && (
        <p className="surface-panel p-4 text-sm text-muted-foreground">
          No concerns yet. They are built automatically from the customer's request the first time a
          job is opened — add one below for anything you find yourself.
        </p>
      )}

      {concerns.map((concern) => (
        <ConcernCard
          key={concern.id}
          requestId={requestId}
          concern={concern}
          onChanged={refresh}
          onFindingsDrafted={onFindingsDrafted}
        />
      ))}

      <div className="surface-panel space-y-2 p-4">
        <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Found something else
        </p>
        <div className="flex gap-2">
          <Input
            value={newTitle}
            placeholder="e.g. Rear brake pads at 3mm"
            className="h-11"
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Button
            type="button"
            className="h-11 shrink-0"
            disabled={newTitle.trim().length < 2 || add.isPending}
            onClick={() => add.mutate(newTitle.trim())}
          >
            {add.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConcernCard({
  requestId,
  concern,
  onChanged,
  onFindingsDrafted,
}: {
  requestId: string;
  concern: JobConcern;
  onChanged: () => void;
  onFindingsDrafted: () => void;
}) {
  const persist = useServerFn(saveConcern);
  const runStory = useServerFn(draftConcernStory);
  const runFindings = useServerFn(draftConcernFindings);
  const persistFinding = useServerFn(saveFinding);

  const [shorthand, setShorthand] = useState(concern.shorthand ?? "");
  const [tests, setTests] = useState(concern.testsPerformed ?? "");
  const [observed, setObserved] = useState(concern.technicianObserved ?? "");
  const [cause, setCause] = useState(concern.confirmedCause ?? "");
  const [status, setStatus] = useState(concern.concernStatus);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftMeta, setDraftMeta] = useState<{
    observed: string;
    cause: string;
    tests: string;
  } | null>(null);
  const [omitted, setOmitted] = useState<string[]>([]);
  const [findingDrafts, setFindingDrafts] = useState<
    {
      title: string;
      detail: string;
      evidence: string;
      measurement: string;
      severity: string;
      confidence: string;
    }[]
  >([]);

  const save = useMutation({
    mutationFn: (extra: Record<string, unknown>) =>
      persist({
        data: {
          id: requestId,
          concernId: concern.id,
          concernStatus: status,
          testsPerformed: tests,
          technicianObserved: observed,
          confirmedCause: cause,
          shorthand,
          ...extra,
        } as never,
      }),
    onSuccess: () => {
      toast.success("Concern saved.");
      onChanged();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save this concern."),
  });

  const cleanup = useMutation({
    mutationFn: () => runStory({ data: { concernId: concern.id, shorthand } }),
    onSuccess: (res) => {
      setDraft(res.draft.story);
      setDraftMeta({
        observed: res.draft.technicianObserved,
        cause: res.draft.confirmedCause,
        tests: res.draft.testsPerformed,
      });
      setOmitted(res.draft.omitted);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Repara AI could not clean this up."),
  });

  const findings = useMutation({
    mutationFn: () => runFindings({ data: { concernId: concern.id } }),
    onSuccess: (res) => {
      setFindingDrafts(res.drafts);
      if (!res.drafts.length) toast.info("Nothing in the documented work supports a finding yet.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Repara AI could not draft findings."),
  });

  const keepFinding = useMutation({
    mutationFn: (d: (typeof findingDrafts)[number]) =>
      persistFinding({
        data: {
          id: requestId,
          concernId: concern.id,
          title: d.title,
          detail: d.detail,
          measurement: d.measurement,
          evidence: d.evidence,
          confidence: d.confidence as "confirmed",
          severity: d.severity as "recommended",
          source: "ai",
          aiDrafted: true,
        } as never,
      }),
    onSuccess: (_res, d) => {
      setFindingDrafts((all) => all.filter((x) => x.title !== d.title));
      toast.success("Finding added — confirm it in the Findings tab.");
      onFindingsDrafted();
    },
    onError: () => toast.error("Could not save this finding."),
  });

  /** Applies the approved AI account into the concern's structured fields. */
  function approveDraft() {
    if (!draft) return;
    if (draftMeta?.observed && !observed.trim()) setObserved(draftMeta.observed);
    if (draftMeta?.tests && !tests.trim()) setTests(draftMeta.tests);
    if (draftMeta?.cause && !cause.trim()) setCause(draftMeta.cause);
    save.mutate({
      story: draft,
      approveStory: true,
      technicianObserved: observed.trim() || draftMeta?.observed || "",
      testsPerformed: tests.trim() || draftMeta?.tests || "",
      confirmedCause: cause.trim() || draftMeta?.cause || "",
    });
    setDraft(null);
    setOmitted([]);
  }

  return (
    <section className="surface-panel space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{concern.title}</h3>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {concern.origin === "technician"
              ? "Found by technician"
              : "From the customer's request"}
            {concern.storyApprovedAt ? " · diagnosis approved" : ""}
          </p>
        </div>
        <select
          value={status}
          aria-label="Concern status"
          onChange={(e) => setStatus(e.target.value as JobConcern["concernStatus"])}
          className="h-10 rounded-md border border-input bg-surface px-2 text-xs"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Provenance layer 1 — never editable here. */}
      {(concern.customerReport || concern.intakeDetails.length > 0) && (
        <div className="rounded-lg border border-border bg-surface/60 p-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Customer reported (unverified)
          </p>
          {concern.customerReport && (
            <p className="mt-1 text-sm whitespace-pre-line">{concern.customerReport}</p>
          )}
          {concern.intakeDetails.length > 0 && (
            <ul className="mt-2 space-y-1">
              {concern.intakeDetails.map((d, i) => (
                <li key={i} className="text-xs">
                  <span className="text-muted-foreground">{d.question}: </span>
                  {d.answer}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {concern.story && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Diagnosis account {concern.storyApprovedAt ? "(approved)" : "(not approved)"}
          </p>
          <p className="mt-1 text-sm whitespace-pre-line">{concern.story}</p>
        </div>
      )}

      {/* Shorthand → AI cleanup → approve. */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">What did you find?</span>
        <span className="block text-xs text-muted-foreground">
          Type it however you'd say it — Repara AI organizes it for you.
        </span>
        <Textarea
          rows={3}
          value={shorthand}
          placeholder="cold start rattle ~2s, verified w/ customer present, no dtc, oil level ok"
          onChange={(e) => setShorthand(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 border-border bg-transparent"
          disabled={shorthand.trim().length < 3 || cleanup.isPending}
          onClick={() => cleanup.mutate()}
        >
          {cleanup.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          Clean up with Repara AI
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 border-border bg-transparent"
          disabled={findings.isPending}
          onClick={() => findings.mutate()}
        >
          {findings.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          Draft findings
        </Button>
      </div>

      {draft !== null && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Draft — nothing is saved until you approve it
          </p>
          <Textarea rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
          {omitted.length > 0 && (
            <p className="text-xs text-warning">
              Could not interpret: {omitted.join("; ")} — clarify it in your notes if it matters.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-10" onClick={approveDraft}>
              <Check className="mr-1.5 size-4" /> Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-10 border-border bg-transparent"
              disabled={cleanup.isPending}
              onClick={() => cleanup.mutate()}
            >
              <RefreshCw className="mr-1.5 size-4" /> Regenerate
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-10"
              onClick={() => {
                setDraft(null);
                setOmitted([]);
              }}
            >
              <X className="mr-1.5 size-4" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {findingDrafts.length > 0 && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Draft findings — keep the ones that are right
          </p>
          {findingDrafts.map((d, i) => (
            <div key={i} className="rounded-md border border-border bg-surface p-3">
              <p className="text-sm font-medium">{d.title}</p>
              <p className="text-xs text-muted-foreground">
                {d.severity} · {d.confidence}
                {d.measurement ? ` · ${d.measurement}` : ""}
              </p>
              {d.detail && <p className="mt-1 text-sm">{d.detail}</p>}
              {d.evidence && (
                <p className="mt-1 text-xs text-muted-foreground">Evidence: {d.evidence}</p>
              )}
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-9"
                  disabled={keepFinding.isPending}
                  onClick={() => keepFinding.mutate(d)}
                >
                  Keep
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={() => setFindingDrafts((all) => all.filter((_, x) => x !== i))}
                >
                  Discard
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Structured fields stay available, but out of the way — Repara AI fills
          them from the notes above once a draft is approved. */}
      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Structured details — tests, observations, confirmed cause
        </summary>
        <div className="space-y-3 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Tests performed</span>
              <Textarea rows={2} value={tests} onChange={(e) => setTests(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Technician observed</span>
              <Textarea rows={2} value={observed} onChange={(e) => setObserved(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">
              Confirmed cause — only when you have confirmed it
            </span>
            <Textarea rows={2} value={cause} onChange={(e) => setCause(e.target.value)} />
          </label>
        </div>
      </details>

      <Button
        type="button"
        variant="outline"
        className="h-11 border-border bg-transparent"
        disabled={save.isPending}
        onClick={() => save.mutate({})}
      >
        {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Save concern
      </Button>
    </section>
  );
}
