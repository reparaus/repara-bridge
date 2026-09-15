import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bot, Check, Copy, Eye, Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CopyValue } from "@/components/admin/CopyValue";
import { ConversationPanel } from "@/components/admin/ConversationPanel";
import { ReparaAiCard } from "@/components/admin/ReparaAiCard";
import { JobCopilot } from "@/components/admin/JobCopilot";
import { JobDiagnosis } from "@/components/admin/JobDiagnosis";
import { JobFindings } from "@/components/admin/JobFindings";
import { JobConcerns } from "@/components/admin/JobConcerns";
import { JobCloseout } from "@/components/admin/JobCloseout";
import { QuotePreview } from "@/components/admin/QuotePreview";
import { VehicleKnowledge } from "@/components/admin/VehicleKnowledge";

import { Field } from "@/components/common/Field";
import { LoadingState } from "@/components/common/LoadingState";
import { formatCurrency, PriceSummary } from "@/components/common/PriceSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getRequestDetail,
  markRequestViewed,
  resendRequestEmails,
  saveQuote,
  updateRequestStatus,
} from "@/lib/admin.functions";
import { getJobWorkspace, setRequestAssignment, type JobRecommendation } from "@/lib/job.functions";
import { answerLabel, serviceLabel, statusLabel, WORKFLOW_STATUSES } from "@/lib/services";
import { DRIVETRAIN_LABELS, type Drivetrain } from "@/lib/vehicle-config";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/admin/requests/$id")({
  head: () => ({
    meta: [
      { title: "Job Workspace — Repara Admin" },
      {
        name: "description",
        content: "Follow one repair end to end: concern, diagnosis, findings, quote and outcome.",
      },
      { property: "og:title", content: "Job Workspace — Repara Admin" },
      {
        property: "og:description",
        content: "Follow one repair end to end: concern, diagnosis, findings, quote and outcome.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JobWorkspace,
});

/**
 * One editable quote line. The parts fields are supplier-agnostic on purpose so a
 * future parts-catalog integration can fill them in without a UI rewrite.
 * `internalUnitCost` is admin-only and never shown to the customer.
 */
type Line = {
  itemType: "labor" | "part" | "fee" | "discount";
  description: string;
  quantity: string;
  unitPrice: string;
  groupLabel: string;
  partBrand: string;
  partNumber: string;
  supplier: string;
  internalUnitCost: string;
  recommendationId: string | null;
};

const EMPTY_LINE: Line = {
  itemType: "labor",
  description: "",
  quantity: "1",
  unitPrice: "0",
  groupLabel: "",
  partBrand: "",
  partNumber: "",
  supplier: "",
  internalUnitCost: "",
  recommendationId: null,
};

type TabKey = "overview" | "ai" | "diagnosis" | "findings" | "quote" | "messages" | "history";

function JobWorkspace() {
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getRequestDetail);
  const fetchJob = useServerFn(getJobWorkspace);
  const persistQuote = useServerFn(saveQuote);
  const setStatus = useServerFn(updateRequestStatus);
  const markViewed = useServerFn(markRequestViewed);
  const resendEmails = useServerFn(resendRequestEmails);

  const query = useQuery({
    queryKey: ["admin-request", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  // Job data (diagnostics, findings, recommendations, activity, outcome).
  const job = useQuery({
    queryKey: ["job-workspace", id],
    queryFn: () => fetchJob({ data: { id } }),
  });

  // Opening a request clears it from the "new requests" badge.
  useEffect(() => {
    void markViewed({ data: { id } }).catch(() => undefined);
  }, [id, markViewed]);

  const [tab, setTab] = useState<TabKey>("overview");
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [tax, setTax] = useState("0");
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState<number | null>(null);

  const detail = query.data?.found ? query.data : null;

  useEffect(() => {
    const existing = detail?.quotes?.[0];
    if (!existing) return;
    setQuoteId(existing.id);
    setPublicToken(existing.public_token);
    setCustomerNotes(existing.customer_notes ?? "");
    setInternalNotes(existing.internal_notes ?? "");
    setExpirationDate(existing.expiration_date ?? "");
    setTax(String(existing.tax_total ?? 0));
    const items = (existing.quote_items ?? []) as Array<Record<string, any>>;
    if (items.length)
      setLines(
        items.map((i) => ({
          itemType: i['item_type'] as Line["itemType"],
          description: String(i['description'] ?? ""),
          quantity: String(i['quantity'] ?? 0),
          unitPrice: String(i['unit_price'] ?? 0),
          groupLabel: String(i['group_label'] ?? ""),
          partBrand: String(i['part_brand'] ?? ""),
          partNumber: String(i['part_number'] ?? ""),
          supplier: String(i['supplier'] ?? ""),
          internalUnitCost:
            i['internal_unit_cost'] === null || i['internal_unit_cost'] === undefined
              ? ""
              : String(i['internal_unit_cost']),
          recommendationId: i['recommendation_id'] ? String(i['recommendation_id']) : null,
        })),
      );
  }, [detail?.quotes]);

  const numeric = lines.map((l) => ({
    ...l,
    total: (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
  }));
  const sum = (t: string) =>
    numeric.filter((l) => l.itemType === t).reduce((s, l) => s + l.total, 0);
  const parts = sum("part");
  const labor = sum("labor");
  const fees = sum("fee");
  const discounts = Math.abs(sum("discount"));
  const taxValue = Number(tax) || 0;
  const total = parts + labor + fees + taxValue - discounts;
  // Margin view is admin-only: internal cost never reaches the customer quote.
  const internalCost = numeric.reduce(
    (s, l) => s + (Number(l.internalUnitCost) || 0) * (Number(l.quantity) || 0),
    0,
  );
  const margin = total - taxValue - internalCost;

  const save = useMutation({
    mutationFn: (send: boolean) =>
      persistQuote({
        data: {
          serviceRequestId: id,
          quoteId,
          items: numeric
            .filter((l) => l.description.trim())
            .map((l) => ({
              itemType: l.itemType,
              description: l.description,
              quantity: Number(l.quantity) || 0,
              unitPrice: Number(l.unitPrice) || 0,
              groupLabel: l.groupLabel,
              partBrand: l.partBrand,
              partNumber: l.partNumber,
              supplier: l.supplier,
              recommendationId: l.recommendationId,
              ...(l.internalUnitCost.trim()
                ? { internalUnitCost: Number(l.internalUnitCost) || 0 }
                : {}),
            })),
          customerNotes,
          internalNotes,
          expirationDate,
          taxTotal: taxValue,
          send,
        },
      }),
    onSuccess: (res, send) => {
      setQuoteId(res.quoteId);
      setPublicToken(res.publicToken);
      if (send) track("admin_quote_sent");
      if (!send) toast.success("Draft saved.");
      else if (res.delivery && !res.delivery.ok)
        toast.error(res.delivery.error ?? "The quote was saved but not delivered.");
      else toast.success("Quote sent to the customer.");
      void query.refetch();
      void job.refetch();
    },
    onError: () => toast.error("We couldn't save this quote."),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => setStatus({ data: { id, status: status as "new" } }),
    onSuccess: () => {
      toast.success("Job stage updated.");
      void query.refetch();
    },
    onError: () => toast.error("Could not update the stage."),
  });

  const emailMutation = useMutation({
    mutationFn: (target: "both" | "customer" | "admin") => resendEmails({ data: { id, target } }),
    onSuccess: (res) => {
      if (res.ok) toast.success("Confirmation email re-sent.");
      else toast.error(res.lastError || res.error || "The email could not be sent.");
      void query.refetch();
    },
    onError: () => toast.error("The email could not be sent."),
  });

  if (query.isPending) return <LoadingState label="Loading job" />;
  if (query.isError || !detail)
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <p className="text-sm text-muted-foreground">This request could not be found.</p>
        <Button asChild variant="outline" className="mt-4 border-border bg-transparent">
          <Link to="/admin">Back to dashboard</Link>
        </Button>
      </div>
    );

  const request = detail.request as Record<string, any>;
  const customer = request.customers ?? {};
  const vehicle = request.vehicles ?? {};
  const vehicleTitle =
    [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") || "Vehicle";
  const mileage = request.mileage || vehicle.mileage;
  const concern = String(request.details?.description ?? request.notes ?? "");

  // AI-assisted intake: the summary is stored alongside the answers, and the
  // customer's original wording stays untouched in `notes`.
  const intake = (() => {
    type Followup = {
      questionId: string;
      question: string;
      answer: string;
      category: string;
      skipped?: boolean;
      concern?: string;
      otherText?: string;
    };
    const all: Followup[] = Array.isArray(request.intake_followups)
      ? (request.intake_followups as Followup[])
      : [];
    const summary = all.find((f) => f.category === "intake_summary")?.answer ?? "";
    const followups = all.filter((f) => f.category !== "intake_summary");
    const groups: { concern: string; items: Followup[] }[] = [];
    for (const f of followups) {
      const key = f.concern || "general";
      const group = groups.find((g) => g.concern === key);
      if (group) group.items.push(f);
      else groups.push({ concern: key, items: [f] });
    }
    return { summary, followups, groups };
  })();

  // Multi-service requests store the full selection; older rows have one category.
  const requestedServices: { key: string; label: string; detail: string }[] = Array.isArray(
    request.services,
  )
    ? (request.services as { key: string; label?: string; answers?: Record<string, unknown> }[]).map(
        (s) => ({
          key: s.key,
          label: s.label ?? serviceLabel(s.key),
          detail: Object.entries(s.answers ?? {})
            .flatMap(([qid, v]) =>
              Array.isArray(v)
                ? v.map((x) => answerLabel(s.key, qid, String(x)))
                : String(v ?? "").trim()
                  ? [answerLabel(s.key, qid, String(v).trim())]
                  : [],
            )
            .join(" · "),
        }),
      )
    : [];

  const quoteUrl = publicToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/quote/${publicToken}`
    : null;
  const quoteRow = detail.quotes[0] as Record<string, any> | undefined;

  /** Turns an approved recommendation into quote lines without retyping. */
  function addRecommendationToQuote(rec: JobRecommendation) {
    // Adding the same recommendation twice is the easiest way to double-bill a
    // customer, so the same source item can only ever appear once.
    if (lines.some((l) => l.recommendationId === rec.id)) {
      setTab("quote");
      toast.info("That recommendation is already on this quote.");
      return;
    }
    setLines((current) => {
      const cleaned = current.filter((l) => l.description.trim() || l.recommendationId);
      return [
        ...cleaned,
        {
          ...EMPTY_LINE,
          itemType: "labor",
          description: rec.title,
          groupLabel: rec.title.slice(0, 60),
          recommendationId: rec.id,
        },
      ];
    });
    setTab("quote");
    toast.success("Added to the quote — set labor and parts pricing.");
  }

  const findings = job.data?.findings ?? [];
  const recommendations = job.data?.recommendations ?? [];
  const diagnostics = job.data?.diagnostics ?? [];
  const activity = job.data?.activity ?? [];
  const concerns = job.data?.concerns ?? [];
  const knowledge = job.data?.knowledge ?? [];
  // Intake completed in another language is normalized to English for the
  // technician; the customer's own words stay one tap away.
  const originalLanguage =
    job.data?.preferredLanguage && job.data.preferredLanguage !== "en"
      ? job.data.preferredLanguage
      : null;
  const openRecommendations = recommendations.filter((r) => r.status === "draft").length;

  /**
   * Next best action — one sentence telling the technician where the job
   * actually stands, derived from what is already documented.
   */
  const nextBestAction = (() => {
    if (!concerns.length) return "Review the request, then start the diagnosis.";
    const uninspected = concerns.filter((c) => c.concernStatus === "not_inspected");
    if (uninspected.length)
      return `Inspect and verify: ${uninspected.map((c) => c.title).join(", ")}.`;
    const unapproved = concerns.filter((c) => c.story && !c.storyApprovedAt);
    if (unapproved.length) return "Approve the diagnosis account so findings can be drafted.";
    const draftFindings = findings.filter((f) => f.aiDrafted && !f.approvedAt);
    if (draftFindings.length) return `Confirm ${draftFindings.length} drafted finding(s).`;
    if (openRecommendations) return `Approve ${openRecommendations} drafted recommendation(s).`;
    const approvedUnquoted = recommendations.filter(
      (r) => r.status === "approved" && !lines.some((l) => l.recommendationId === r.id),
    );
    if (approvedUnquoted.length)
      return `Add ${approvedUnquoted.length} approved recommendation(s) to the quote.`;
    const openRepair = concerns.filter((c) => !c.outcome);
    if (openRepair.length) return "Record what was performed and verified, then close the job out.";
    return "Everything documented — send the quote or close the job out.";
  })();

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-5">
          <div className="flex h-14 items-center justify-between gap-3">
            <Link
              to="/admin"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate font-display text-sm font-bold">{vehicleTitle}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                #{request.request_number}
                {mileage ? ` · ${Number(mileage).toLocaleString()} mi` : ""}
              </p>
            </div>
            <StatusBadge status={request.status} />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <select
              value={request.status}
              disabled={statusMutation.isPending}
              onChange={(e) => statusMutation.mutate(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-surface px-2 text-xs text-foreground"
              aria-label="Job stage"
            >
              {WORKFLOW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
              {!WORKFLOW_STATUSES.includes(request.status) && (
                <option value={request.status}>{statusLabel(request.status)}</option>
              )}
            </select>
            {statusMutation.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <div className="sticky top-[102px] z-10 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-6xl overflow-x-auto px-2 sm:px-5">
            <TabsList className="h-12 w-max gap-1 bg-transparent p-0">
              {(
                [
                  ["overview", "Overview"],
                  ["ai", "Repara AI"],
                  ["diagnosis", "Diagnosis"],
                  ["findings", `Findings${openRecommendations ? ` (${openRecommendations})` : ""}`],
                  ["quote", "Quote"],
                  ["messages", "Messages"],
                  ["history", "History"],
                ] as [TabKey, string][]
              ).map(([key, label]) => (
                <TabsTrigger key={key} value={key} className="h-10 px-3 text-xs">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-5">
          {/* ------------------------------------------------------- OVERVIEW */}
          <TabsContent value="overview" className="mt-0 grid gap-5 lg:grid-cols-2">
            <div className="min-w-0 space-y-5">
              {/* Live job snapshot: what a technician needs before starting. */}
              <Panel title="What do I need to know before I start?">
                <p className="text-sm">{nextBestAction}</p>
                {concerns.length > 0 && (
                  <ul className="space-y-2 pt-2">
                    {concerns.map((c) => {
                      const related = findings.filter((f) => f.concernId === c.id);
                      const title = c.normalizedTitle || c.title;
                      const report = c.normalizedCustomerReport || c.customerReport;
                      const translated =
                        Boolean(c.normalizedCustomerReport) &&
                        c.normalizedCustomerReport !== c.customerReport;
                      return (
                        <li key={c.id} className="rounded-lg border border-border p-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-display text-sm font-bold tracking-wide uppercase">
                              {title}
                            </span>
                            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                              {c.concernStatus.replace(/_/g, " ")}
                            </span>
                          </div>
                          {report && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Customer reported: {report}
                            </p>
                          )}
                          {translated && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                                View original{originalLanguage === "es" ? " (Spanish)" : ""}
                              </summary>
                              <p className="pt-1 text-xs text-muted-foreground">{c.customerReport}</p>
                            </details>
                          )}
                          {c.mergedReports.length > 0 && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Includes {c.mergedReports.length} duplicate report
                              {c.mergedReports.length === 1 ? "" : "s"} of the same problem.
                            </p>
                          )}
                          {c.confirmedCause && (
                            <p className="mt-1 text-xs">Confirmed cause: {c.confirmedCause}</p>
                          )}
                          {related.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {related.length} finding(s) recorded
                            </p>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-9 bg-transparent text-xs"
                            onClick={() => setTab("diagnosis")}
                          >
                            Go to Diagnosis
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="pt-3">
                  <p className="pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Vehicle knowledge
                  </p>
                  <VehicleKnowledge requestId={id} initial={knowledge} />
                </div>
              </Panel>
              {/* Assignment is a one-line control until it needs attention. */}
              <details className="rounded-lg border border-border px-3 py-2">
                <summary className="cursor-pointer text-xs">
                  Technician:{" "}
                  <span className="font-medium">
                    {String(request.assigned_technician || "") || "Unassigned"}
                  </span>
                </summary>
                <div className="pt-3">
                  <AssignmentControl
                    requestId={id}
                    initialStatus={String(request.assignment_status ?? "unassigned")}
                    initialProvider={String(request.assigned_provider ?? "")}
                    initialTechnician={String(request.assigned_technician ?? "")}
                    onSaved={() => void query.refetch()}
                  />
                </div>
              </details>
              <Panel title="Customer concern">
                <p className="text-sm whitespace-pre-line">{concern || "No description provided."}</p>
                {intake.summary && (
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground">
                      Repara intake summary (customer-reported, not a diagnosis)
                    </p>
                    <p className="pt-1 text-sm whitespace-pre-line">{intake.summary}</p>
                  </div>
                )}
                {requestedServices.length > 0 ? (
                  <ul className="space-y-2 pt-2">
                    {requestedServices.map((s) => (
                      <li key={s.key}>
                        <span className="text-sm font-medium">{s.label}</span>
                        {s.detail && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{s.detail}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Row label="Category" value={serviceLabel(request.service_category)} />
                )}
                {detail.photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 pt-3">
                    {detail.photos.map((p) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                        <img
                          src={p.url}
                          alt="Customer upload"
                          loading="lazy"
                          className="aspect-square w-full rounded-lg object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </Panel>

              <ReparaAiCard requestId={id} request={request as never} />

              {/* Intake stays out of the way until the technician wants it. */}
              {intake.followups.length > 0 && (
                <details className="rounded-lg border border-border px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium">
                    Customer intake — view all {intake.followups.length} answers
                  </summary>
                  <div className="space-y-3 pt-3">
                    {intake.groups.map((group) => (
                      <div key={group.concern}>
                        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                          {group.concern.replace(/_/g, " ")}
                        </p>
                        <ul className="mt-1 space-y-1.5">
                          {group.items.map((f) => {
                            const original = [f.answer, f.otherText].filter(Boolean).join(" — ");
                            const english = normalizedIntake.get(f.question.trim());
                            return (
                              <li key={f.questionId}>
                                <span className="block text-xs text-muted-foreground">
                                  {english?.question || f.question}
                                </span>
                                <span className="text-sm">
                                  {f.skipped ? "Not answered" : english?.answer || original}
                                </span>
                                {!f.skipped && english && english.answer !== original && (
                                  <details className="pt-0.5">
                                    <summary className="cursor-pointer text-[11px] text-muted-foreground">
                                      View original{originalLanguage === "es" ? " (Spanish)" : ""}
                                    </summary>
                                    <p className="text-xs text-muted-foreground">{original}</p>
                                  </details>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="min-w-0 space-y-5">
              <Panel title="Vehicle">
                <Row label="Vehicle" value={vehicleTitle} />
                <Row
                  label="Engine"
                  value={
                    [
                      vehicle.engine_displacement
                        ? `${Number(vehicle.engine_displacement).toFixed(1)}L`
                        : "",
                      vehicle.cylinder_count ? `${vehicle.cylinder_count}-Cyl` : "",
                      vehicle.is_hybrid ? "Hybrid" : "",
                      vehicle.engine_code ? `(${vehicle.engine_code})` : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || "—"
                  }
                />
                <Row
                  label="Drivetrain"
                  value={
                    vehicle.drivetrain && vehicle.drivetrain !== "unknown"
                      ? DRIVETRAIN_LABELS[vehicle.drivetrain as Drivetrain]
                      : "—"
                  }
                />
                <Row label="Fuel" value={vehicle.fuel_type ?? "—"} />
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-xs text-muted-foreground">VIN</span>
                  <CopyValue value={vehicle.vin ?? ""} label="VIN" mono />
                </div>
                <Row
                  label="Mileage"
                  value={mileage ? `${Number(mileage).toLocaleString()} mi` : "—"}
                />
              </Panel>

              <Panel title="Customer">
                <Row
                  label="Name"
                  value={`${customer.first_name ?? ""} ${customer.last_name ?? ""}`}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-xs text-muted-foreground">Phone</span>
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                    {customer.phone && (
                      <a
                        href={`tel:${customer.phone}`}
                        className="text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {customer.phone}
                      </a>
                    )}
                    <CopyValue value={customer.phone ?? ""} label="phone number" />
                  </div>
                </div>
                <Row label="Email" value={customer.email ?? "—"} />
                <Row label="Preferred contact" value={customer.preferred_contact_method ?? "—"} />
                <Row
                  label="Location"
                  value={[request.city, request.zip_code].filter(Boolean).join(", ") || "—"}
                />
                <Row
                  label="Service area"
                  value={
                    request.service_area_status === "eligible"
                      ? "In service area"
                      : request.service_area_status === "outside_area"
                        ? "Outside service area"
                        : "Unknown"
                  }
                />
                <Row label="Submitted" value={new Date(request.created_at).toLocaleString()} />
              </Panel>

              <Panel title="Confirmation emails">
                <Row
                  label="Customer"
                  value={
                    request.customer_email_sent_at
                      ? `Sent ${new Date(request.customer_email_sent_at).toLocaleString()}`
                      : "Not sent"
                  }
                />
                <Row
                  label="Repara admin"
                  value={
                    request.admin_email_sent_at
                      ? `Sent ${new Date(request.admin_email_sent_at).toLocaleString()}`
                      : "Not sent"
                  }
                />
                {request.email_last_error && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    Last email failure: {request.email_last_error}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 border-border bg-transparent"
                    disabled={emailMutation.isPending}
                    onClick={() => emailMutation.mutate("both")}
                  >
                    {emailMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Mail className="mr-2 size-4" />
                    )}
                    {request.email_last_error ? "RETRY EMAILS" : "RESEND CONFIRMATION"}
                  </Button>
                </div>
              </Panel>
            </div>
          </TabsContent>

          {/* ------------------------------------------------------ REPARA AI */}
          <TabsContent value="ai" className="mt-0">
            <div className="mx-auto max-w-3xl">
              <JobCopilot requestId={id} />
            </div>
          </TabsContent>

          {/* ------------------------------------------------------ DIAGNOSIS */}
          <TabsContent value="diagnosis" className="mt-0">
            <div className="mx-auto max-w-3xl space-y-5">
              {job.isPending ? (
                <LoadingState label="Loading diagnosis" />
              ) : (
                <>
                  <JobConcerns
                    requestId={id}
                    concerns={concerns}
                    onFindingsDrafted={() => setTab("findings")}
                  />
                  <JobDiagnosis requestId={id} entries={diagnostics} />
                </>
              )}
            </div>
          </TabsContent>

          {/* ------------------------------------------------------- FINDINGS */}
          <TabsContent value="findings" className="mt-0">
            <div className="mx-auto max-w-3xl space-y-5">
              {job.isPending ? (
                <LoadingState label="Loading findings" />
              ) : (
                <JobFindings
                  requestId={id}
                  findings={findings}
                  recommendations={recommendations}
                  concerns={concerns}
                  onAddToQuote={addRecommendationToQuote}
                />
              )}
              <JobCloseout
                requestId={id}
                originalConcern={concern}
                outcome={job.data?.outcome ?? null}
                concerns={concerns}
              />
            </div>
          </TabsContent>

          {/* ---------------------------------------------------------- QUOTE */}
          <TabsContent value="quote" className="mt-0">
            <div className="mx-auto max-w-3xl space-y-5">
              {recommendations.filter((r) => r.status === "approved").length > 0 && (
                <div className="surface-panel space-y-2 p-4">
                  <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
                    Approved recommendations
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recommendations
                      .filter((r) => r.status === "approved")
                      .map((rec) => {
                        // Already-quoted items stay visible but can't be added twice.
                        const onQuote = lines.some((l) => l.recommendationId === rec.id);
                        return (
                          <Button
                            key={rec.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={onQuote}
                            className="h-10 border-border bg-transparent text-xs"
                            onClick={() => addRecommendationToQuote(rec)}
                          >
                            {onQuote ? (
                              <Check className="mr-1.5 size-3.5" />
                            ) : (
                              <Plus className="mr-1.5 size-3.5" />
                            )}
                            {rec.title}
                            {onQuote ? " · on quote" : ""}
                          </Button>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="surface-panel space-y-4 p-4">
                {lines.map((line, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={line.itemType}
                        aria-label="Line type"
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((l, x) =>
                              x === i ? { ...l, itemType: e.target.value as Line["itemType"] } : l,
                            ),
                          )
                        }
                        className="h-11 flex-1 rounded-md border border-input bg-surface px-2 text-xs"
                      >
                        <option value="labor">Labor</option>
                        <option value="part">Part</option>
                        <option value="fee">Fee</option>
                        <option value="discount">Discount</option>
                      </select>
                      <p className="text-sm font-medium tabular-nums">
                        {formatCurrency(numeric[i]?.total ?? 0)}
                      </p>
                      <button
                        type="button"
                        aria-label="Remove line"
                        className="p-2 text-muted-foreground hover:text-destructive"
                        onClick={() => setLines((ls) => ls.filter((_, x) => x !== i))}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <Input
                      value={line.description}
                      placeholder="Description"
                      className="h-11"
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((l, x) => (x === i ? { ...l, description: e.target.value } : l)),
                        )
                      }
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        value={line.quantity}
                        inputMode="decimal"
                        aria-label="Quantity"
                        placeholder="Qty"
                        className="h-11"
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((l, x) => (x === i ? { ...l, quantity: e.target.value } : l)),
                          )
                        }
                      />
                      <Input
                        value={line.unitPrice}
                        inputMode="decimal"
                        aria-label="Customer price"
                        placeholder="Price"
                        className="h-11"
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((l, x) => (x === i ? { ...l, unitPrice: e.target.value } : l)),
                          )
                        }
                      />
                      <Input
                        value={line.internalUnitCost}
                        inputMode="decimal"
                        aria-label="Internal unit cost"
                        placeholder="Cost"
                        className="h-11"
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((l, x) =>
                              x === i ? { ...l, internalUnitCost: e.target.value } : l,
                            ),
                          )
                        }
                      />
                    </div>

                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-4"
                      onClick={() => setPartsOpen(partsOpen === i ? null : i)}
                    >
                      {partsOpen === i ? "Hide service & part details" : "Service & part details"}
                    </button>
                    {partsOpen === i && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          value={line.groupLabel}
                          placeholder="Service card (e.g. Front brakes)"
                          className="h-11"
                          onChange={(e) =>
                            setLines((ls) =>
                              ls.map((l, x) => (x === i ? { ...l, groupLabel: e.target.value } : l)),
                            )
                          }
                        />
                        <Input
                          value={line.partBrand}
                          placeholder="Part brand"
                          className="h-11"
                          onChange={(e) =>
                            setLines((ls) =>
                              ls.map((l, x) => (x === i ? { ...l, partBrand: e.target.value } : l)),
                            )
                          }
                        />
                        <Input
                          value={line.partNumber}
                          placeholder="Part number"
                          className="h-11"
                          onChange={(e) =>
                            setLines((ls) =>
                              ls.map((l, x) => (x === i ? { ...l, partNumber: e.target.value } : l)),
                            )
                          }
                        />
                        <Input
                          value={line.supplier}
                          placeholder="Supplier"
                          className="h-11"
                          onChange={(e) =>
                            setLines((ls) =>
                              ls.map((l, x) => (x === i ? { ...l, supplier: e.target.value } : l)),
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 border-border bg-transparent"
                  onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}
                >
                  <Plus className="mr-2 size-4" /> Add line item
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tax" optional htmlFor="tax" hint="Enter a flat tax amount if applicable.">
                  <Input
                    id="tax"
                    inputMode="decimal"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    className="h-11"
                  />
                </Field>
                <Field label="Expiration date" optional htmlFor="exp">
                  <Input
                    id="exp"
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="h-11"
                  />
                </Field>
              </div>

              <PriceSummary
                parts={parts}
                labor={labor}
                fees={fees}
                discounts={discounts}
                tax={taxValue}
                total={total}
              />
              <p className="text-xs text-muted-foreground">
                Internal only — part cost {formatCurrency(internalCost)} · estimated margin{" "}
                {formatCurrency(margin)}
              </p>

              <Field label="Customer-facing notes" optional htmlFor="cnotes">
                <Textarea
                  id="cnotes"
                  rows={3}
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                />
              </Field>
              <Field label="Technician notes (internal)" optional htmlFor="inotes">
                <Textarea
                  id="inotes"
                  rows={3}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                />
              </Field>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="h-12 border-border bg-transparent"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="mr-2 size-4" /> PREVIEW QUOTE
                </Button>
                <Button
                  variant="outline"
                  className="h-12 border-border bg-transparent"
                  disabled={save.isPending}
                  onClick={() => save.mutate(false)}
                >
                  SAVE DRAFT
                </Button>
                <Button className="h-12" disabled={save.isPending} onClick={() => save.mutate(true)}>
                  {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} SEND QUOTE
                </Button>
                {quoteUrl && quoteRow?.status !== "draft" && (
                  <Button
                    variant="outline"
                    className="h-12 border-border bg-transparent"
                    onClick={() => {
                      void navigator.clipboard.writeText(quoteUrl);
                      toast.success("Customer link copied.");
                    }}
                  >
                    <Copy className="mr-2 size-4" /> COPY LINK
                  </Button>
                )}
              </div>

              <Panel title="Approval status">
                <Row label="Quote status" value={quoteRow ? statusLabel(String(quoteRow.status)) : "Not created"} />
                <Row
                  label="Sent"
                  value={quoteRow?.sent_at ? new Date(quoteRow.sent_at).toLocaleString() : "—"}
                />
                <Row
                  label="Customer approved"
                  value={
                    quoteRow?.accepted_at ? new Date(quoteRow.accepted_at).toLocaleString() : "—"
                  }
                />
                {quoteUrl && quoteRow?.status !== "draft" && (
                  <p className="text-xs break-all text-muted-foreground">{quoteUrl}</p>
                )}
              </Panel>
            </div>
          </TabsContent>

          {/* ------------------------------------------------------- MESSAGES */}
          <TabsContent value="messages" className="mt-0">
            <div className="mx-auto max-w-3xl">
              <ConversationPanel requestId={id} />
            </div>
          </TabsContent>

          {/* -------------------------------------------------------- HISTORY */}
          <TabsContent value="history" className="mt-0">
            <div className="mx-auto max-w-3xl space-y-5">
              <Panel title="Job activity">
                <ol className="space-y-2">
                  <li className="flex items-baseline justify-between gap-3">
                    <span className="text-sm">Request submitted</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(request.created_at).toLocaleString()}
                    </span>
                  </li>
                  {(detail.statusEvents ?? []).map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">
                        {e.fromStatus ? `${statusLabel(e.fromStatus)} → ` : ""}
                        {statusLabel(e.toStatus)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                  {activity.map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">{e.summary}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              </Panel>
            </div>
          </TabsContent>
        </main>
      </Tabs>

      {/* Sticky mobile entry point into the copilot — a technician's most used action. */}
      {tab !== "ai" && (
        <button
          type="button"
          onClick={() => setTab("ai")}
          className="fixed right-4 bottom-5 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg lg:hidden"
        >
          <Bot className="size-5" /> Repara AI
        </button>
      )}

      <QuotePreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        requestNumber={String(request.request_number ?? "")}
        vehicle={vehicleTitle}
        lines={numeric
          .filter((l) => l.description.trim())
          .map((l) => ({
            itemType: l.itemType,
            description: l.description,
            quantity: Number(l.quantity) || 0,
            unitPrice: Number(l.unitPrice) || 0,
            total: l.total,
            groupLabel: l.groupLabel,
            partBrand: l.partBrand,
            partNumber: l.partNumber,
          }))}
        parts={parts}
        labor={labor}
        fees={fees}
        discounts={discounts}
        tax={taxValue}
        total={total}
        customerNotes={customerNotes}
        expirationDate={expirationDate}
        internalCost={internalCost}
        margin={margin}
      />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-panel min-w-0 space-y-3 overflow-hidden p-5">
      <h2 className="text-xs tracking-[0.2em] text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-sm font-medium">{value}</span>
    </div>
  );
}

/**
 * Lightweight assignment: Repara does the work itself, or a participating
 * provider does. No matching, bidding or dispatch — just a recorded decision so
 * the platform is ready for other providers later.
 */
function AssignmentControl({
  requestId,
  initialStatus,
  initialProvider,
  initialTechnician,
  onSaved,
}: {
  requestId: string;
  initialStatus: string;
  initialProvider: string;
  initialTechnician: string;
  onSaved: () => void;
}) {
  const persist = useServerFn(setRequestAssignment);
  const [status, setStatusValue] = useState(initialStatus);
  const [provider, setProvider] = useState(initialProvider);
  const [technician, setTechnician] = useState(initialTechnician);

  const save = useMutation({
    mutationFn: () =>
      persist({
        data: {
          id: requestId,
          assignmentStatus: status as "unassigned",
          provider,
          technician,
        },
      }),
    onSuccess: () => {
      toast.success("Assignment updated.");
      onSaved();
    },
    onError: () => toast.error("Could not update the assignment."),
  });

  return (
    <div className="space-y-2">
      <select
        value={status}
        aria-label="Assignment"
        onChange={(e) => setStatusValue(e.target.value)}
        className="h-11 w-full rounded-md border border-input bg-surface px-3 text-sm"
      >
        <option value="unassigned">Not decided yet</option>
        <option value="self">Repara is doing it</option>
        <option value="assigned">A participating provider is doing it</option>
        <option value="declined">Declined</option>
      </select>
      {status === "assigned" && (
        <Input
          value={provider}
          placeholder="Provider or shop name"
          className="h-11"
          onChange={(e) => setProvider(e.target.value)}
        />
      )}
      <Input
        value={technician}
        placeholder="Technician (optional)"
        className="h-11"
        onChange={(e) => setTechnician(e.target.value)}
      />
      <Button
        type="button"
        size="sm"
        className="h-10 text-xs"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />} Save
      </Button>
    </div>
  );
}
