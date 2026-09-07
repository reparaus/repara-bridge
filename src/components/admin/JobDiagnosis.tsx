import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addDiagnosticEntry,
  deleteDiagnosticEntry,
  type JobDiagnostic,
} from "@/lib/job.functions";

/**
 * Fast diagnostic documentation. Built for a technician standing next to the
 * vehicle on a phone: one type, one line, save. Everything recorded here feeds
 * Repara AI's job context, findings and closeout.
 */

const ENTRY_TYPES: { value: JobDiagnostic["entryType"]; label: string }[] = [
  { value: "dtc", label: "DTC" },
  { value: "symptom_verified", label: "Symptom verified" },
  { value: "inspection", label: "Inspection" },
  { value: "test", label: "Test" },
  { value: "note", label: "Note" },
  { value: "repair", label: "Repair" },
  { value: "verification", label: "Verified after repair" },
];

const TYPE_LABEL = Object.fromEntries(ENTRY_TYPES.map((t) => [t.value, t.label]));

export function JobDiagnosis({
  requestId,
  entries,
}: {
  requestId: string;
  entries: JobDiagnostic[];
}) {
  const queryClient = useQueryClient();
  const add = useServerFn(addDiagnosticEntry);
  const remove = useServerFn(deleteDiagnosticEntry);

  const [entryType, setEntryType] = useState<JobDiagnostic["entryType"]>("note");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [result, setResult] = useState("");
  const [detail, setDetail] = useState("");
  const [expanded, setExpanded] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["job-workspace", requestId] });

  const save = useMutation({
    mutationFn: () =>
      add({
        data: {
          id: requestId,
          entryType,
          code: entryType === "dtc" ? code.trim().toUpperCase() : "",
          title: title.trim(),
          result: result.trim(),
          detail: detail.trim(),
        },
      }),
    onSuccess: () => {
      setCode("");
      setTitle("");
      setResult("");
      setDetail("");
      setExpanded(false);
      toast.success("Recorded.");
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save this entry."),
  });

  const del = useMutation({
    mutationFn: (entryId: string) => remove({ data: { entryId } }),
    onSuccess: () => void refresh(),
    onError: () => toast.error("Could not remove this entry."),
  });

  const dtcs = entries.filter((e) => e.entryType === "dtc");

  return (
    <section className="space-y-4">
      <div className="surface-panel space-y-3 p-4">
        <h2 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Record diagnostic activity
        </h2>

        <div className="-mx-1 flex flex-wrap gap-2 px-1">
          {ENTRY_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setEntryType(type.value)}
              className={`h-10 rounded-lg border px-3 text-xs font-medium ${
                entryType === type.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface text-muted-foreground"
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {entryType === "dtc" && (
          <Input
            value={code}
            placeholder="Code (P0301)"
            className="h-12 font-mono uppercase"
            onChange={(e) => setCode(e.target.value)}
          />
        )}

        <Input
          value={title}
          placeholder={
            entryType === "dtc"
              ? "What the code relates to"
              : entryType === "test"
                ? "Test performed"
                : "What you did or observed"
          }
          className="h-12"
          onChange={(e) => setTitle(e.target.value)}
        />

        {expanded && (
          <>
            <Input
              value={result}
              placeholder="Result / measurement"
              className="h-12"
              onChange={(e) => setResult(e.target.value)}
            />
            <Textarea
              rows={3}
              value={detail}
              placeholder="Extra detail (optional)"
              onChange={(e) => setDetail(e.target.value)}
            />
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-12 flex-1 sm:flex-none"
            disabled={save.isPending || title.trim().length < 2}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Record
          </Button>
          {!expanded && (
            <Button
              type="button"
              variant="ghost"
              className="h-12 text-xs text-muted-foreground"
              onClick={() => setExpanded(true)}
            >
              Add result / detail
            </Button>
          )}
        </div>
      </div>

      {dtcs.length > 0 && (
        <div className="surface-panel space-y-2 p-4">
          <h3 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Codes on this job
          </h3>
          <div className="flex flex-wrap gap-2">
            {dtcs.map((d) => (
              <span
                key={d.id}
                className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs"
              >
                {d.code || d.title}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="surface-panel space-y-3 p-4">
        <h3 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Diagnostic log
        </h3>
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nothing recorded yet. Everything you record here is included in Repara AI's job context.
          </p>
        )}
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {TYPE_LABEL[entry.entryType] ?? entry.entryType}
                  {entry.code ? ` · ${entry.code}` : ""}
                </p>
                <p className="text-sm font-medium break-words">{entry.title}</p>
                {entry.result && <p className="text-xs">Result: {entry.result}</p>}
                {entry.detail && (
                  <p className="text-xs whitespace-pre-line text-muted-foreground">{entry.detail}</p>
                )}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                aria-label="Remove entry"
                className="p-2 text-muted-foreground hover:text-destructive"
                onClick={() => del.mutate(entry.id)}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
