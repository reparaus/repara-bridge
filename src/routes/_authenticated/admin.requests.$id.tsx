import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Copy, Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CopyValue } from "@/components/admin/CopyValue";
import { Field } from "@/components/common/Field";
import { LoadingState } from "@/components/common/LoadingState";
import { formatCurrency, PriceSummary } from "@/components/common/PriceSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getRequestDetail,
  markRequestViewed,
  resendRequestEmails,
  saveQuote,
  updateRequestStatus,
} from "@/lib/admin.functions";
import { answerLabel, serviceLabel, statusLabel, WORKFLOW_STATUSES } from "@/lib/services";
import { DRIVETRAIN_LABELS, type Drivetrain } from "@/lib/vehicle-config";
import { track } from "@/lib/analytics";


export const Route = createFileRoute("/_authenticated/admin/requests/$id")({
  head: () => ({
    meta: [
      { title: "Service Request — Repara Admin" },
      { name: "description", content: "Review a customer request and build a quote." },
      { property: "og:title", content: "Service Request — Repara Admin" },
      { property: "og:description", content: "Review a customer request and build a quote." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequestDetail,
});

type Line = { itemType: "labor" | "part" | "fee" | "discount"; description: string; quantity: string; unitPrice: string };

const EMPTY_LINE: Line = { itemType: "labor", description: "", quantity: "1", unitPrice: "0" };

function RequestDetail() {
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getRequestDetail);
  const persistQuote = useServerFn(saveQuote);
  const setStatus = useServerFn(updateRequestStatus);
  const markViewed = useServerFn(markRequestViewed);
  const resendEmails = useServerFn(resendRequestEmails);

  const query = useQuery({
    queryKey: ["admin-request", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  // Opening a request clears it from the "new requests" badge.
  useEffect(() => {
    void markViewed({ data: { id } }).catch(() => undefined);
  }, [id, markViewed]);


  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [tax, setTax] = useState("0");
  const [publicToken, setPublicToken] = useState<string | null>(null);

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
    const items = (existing.quote_items ?? []) as Array<{
      item_type: Line["itemType"];
      description: string;
      quantity: number;
      unit_price: number;
    }>;
    if (items.length)
      setLines(
        items.map((i) => ({
          itemType: i.item_type,
          description: i.description,
          quantity: String(i.quantity),
          unitPrice: String(i.unit_price),
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
      toast.success(send ? "Quote sent — copy the customer link." : "Draft saved.");
      void query.refetch();
    },
    onError: () => toast.error("We couldn't save this quote."),
  });

  const statusMutation = useMutation({
    mutationFn: (status: (typeof WORKFLOW_STATUSES)[number] | string) =>
      setStatus({ data: { id, status: status as "new" } }),
    onSuccess: () => {
      toast.success("Status updated.");
      void query.refetch();
    },
    onError: () => toast.error("Could not update the status."),
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

  if (query.isPending) return <LoadingState label="Loading request" />;
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-5">
          <Link
            to="/admin"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <StatusBadge status={request.status} />
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-5 sm:py-8 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-6">
          <div>
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
              Request #{request.request_number}
            </p>
            <h1 className="mt-1 font-display text-xl font-extrabold sm:text-2xl">
              {serviceLabel(request.service_category)}
            </h1>
          </div>

          <Panel title="Customer">
            <Row label="Name" value={`${customer.first_name ?? ""} ${customer.last_name ?? ""}`} />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground">Phone</span>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="text-sm font-medium underline-offset-4 hover:underline">
                    {customer.phone}
                  </a>
                )}
                <CopyValue value={customer.phone ?? ""} label="phone number" />
              </div>
            </div>

            <Row label="Email" value={customer.email ?? "—"} />
            <Row label="Preferred contact" value={customer.preferred_contact_method ?? "—"} />

            <Row label="City" value={request.city || "—"} />
            <Row label="ZIP" value={request.zip_code ?? "—"} />
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

          <Panel title="Vehicle">
            <Row label="Year" value={String(vehicle.year ?? "—")} />
            <Row label="Make" value={vehicle.make ?? "—"} />
            <Row label="Model" value={vehicle.model ?? "—"} />
            <Row label="Trim" value={vehicle.trim ?? "—"} />
            <Row
              label="Engine"
              value={
                [
                  vehicle.engine_displacement ? `${Number(vehicle.engine_displacement).toFixed(1)}L` : "",
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
              value={vehicle.drivetrain && vehicle.drivetrain !== "unknown" ? DRIVETRAIN_LABELS[vehicle.drivetrain as Drivetrain] : "—"}
            />
            <Row label="Fuel" value={vehicle.fuel_type ?? "—"} />
            <Row label="Body" value={vehicle.body_type ?? "—"} />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground">VIN</span>
              <CopyValue value={vehicle.vin ?? ""} label="VIN" mono />
            </div>

            <Row
              label="Mileage at request"
              value={
                request.mileage
                  ? `${Number(request.mileage).toLocaleString()} mi`
                  : vehicle.mileage
                    ? `${Number(vehicle.mileage).toLocaleString()} mi`
                    : "—"
              }
            />
          </Panel>

          <Panel title="Service request">
            {requestedServices.length > 0 ? (
              <ul className="space-y-2">
                {requestedServices.map((s) => (
                  <li key={s.key}>
                    <span className="text-sm font-medium">{s.label || serviceLabel(s.key)}</span>
                    {s.detail && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{s.detail}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Row label="Category" value={serviceLabel(request.service_category)} />
            )}
            {request.details?.description && (
              <p className="pt-2 text-sm whitespace-pre-line">{request.details.description}</p>
            )}
            {request.notes && <p className="pt-2 text-sm whitespace-pre-line">{request.notes}</p>}

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

          <Panel title="Timeline">
            <Row label="Submitted" value={new Date(request.created_at).toLocaleString()} />
            <Row
              label="Quote created"
              value={detail.quotes[0] ? new Date(detail.quotes[0].created_at).toLocaleString() : "—"}
            />
            <Row
              label="Quote sent"
              value={detail.quotes[0]?.sent_at ? new Date(detail.quotes[0].sent_at).toLocaleString() : "—"}
            />
            <Row
              label="Accepted"
              value={
                detail.quotes[0]?.accepted_at
                  ? new Date(detail.quotes[0].accepted_at).toLocaleString()
                  : "—"
              }
            />
          </Panel>

          <div className="surface-panel space-y-3 p-4">
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Status</p>
            <select
              value={request.status}
              disabled={statusMutation.isPending}
              onChange={(e) => statusMutation.mutate(e.target.value as "new")}
              className="h-12 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground"
              aria-label="Request status"
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
            <p className="text-xs text-muted-foreground">
              {statusMutation.isPending ? "Saving…" : "Changes save automatically."}
            </p>
          </div>

          <Panel title="Status history">
            <ol className="space-y-2">
              <li className="flex items-baseline justify-between gap-3">
                <span className="text-sm">Submitted</span>
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
              {(detail.statusEvents ?? []).length === 0 && (
                <li className="text-xs text-muted-foreground">
                  No status changes yet — updates appear here.
                </li>
              )}
            </ol>
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
                className="border-border bg-transparent"
                disabled={emailMutation.isPending}
                onClick={() => emailMutation.mutate("both")}
              >
                {emailMutation.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 size-4" />
                )}
                {request.email_last_error ? "RETRY EMAILS" : "RESEND CONFIRMATION EMAIL"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={emailMutation.isPending}
                onClick={() => emailMutation.mutate("customer")}
              >
                Customer only
              </Button>
            </div>
          </Panel>

        </div>


        {/* QUOTE BUILDER */}
        <div className="space-y-5">
          <h2 className="font-display text-lg font-bold">Quote builder</h2>

          <div className="surface-panel space-y-3 p-4">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <select
                  value={line.itemType}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((l, x) =>
                        x === i ? { ...l, itemType: e.target.value as Line["itemType"] } : l,
                      ),
                    )
                  }
                  className="col-span-3 h-11 rounded-md border border-input bg-surface px-2 text-xs"
                >
                  <option value="labor">Labor</option>
                  <option value="part">Part</option>
                  <option value="fee">Fee</option>
                  <option value="discount">Discount</option>
                </select>
                <Input
                  value={line.description}
                  placeholder="Description"
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, x) => (x === i ? { ...l, description: e.target.value } : l)))
                  }
                  className="col-span-4 h-11"
                />
                <Input
                  value={line.quantity}
                  inputMode="decimal"
                  aria-label="Quantity"
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, x) => (x === i ? { ...l, quantity: e.target.value } : l)))
                  }
                  className="col-span-2 h-11"
                />
                <Input
                  value={line.unitPrice}
                  inputMode="decimal"
                  aria-label="Unit price"
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, x) => (x === i ? { ...l, unitPrice: e.target.value } : l)))
                  }
                  className="col-span-2 h-11"
                />
                <button
                  type="button"
                  aria-label="Remove line"
                  className="col-span-1 text-muted-foreground hover:text-destructive"
                  onClick={() => setLines((ls) => ls.filter((_, x) => x !== i))}
                >
                  <Trash2 className="size-4" />
                </button>
                <p className="col-span-12 -mt-1 text-right text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(numeric[i]?.total ?? 0)}
                </p>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="border-border bg-transparent"
              onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}
            >
              <Plus className="mr-2 size-4" /> Add line item
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tax" optional htmlFor="tax" hint="Enter a flat tax amount if applicable.">
              <Input id="tax" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} className="h-11" />
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
              className="border-border bg-transparent"
              disabled={save.isPending}
              onClick={() => save.mutate(false)}
            >
              SAVE DRAFT
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate(true)}>
              {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} SEND QUOTE
            </Button>
            {quoteUrl && detail.quotes[0]?.status !== "draft" && (
              <Button
                variant="outline"
                className="border-border bg-transparent"
                onClick={() => {
                  void navigator.clipboard.writeText(quoteUrl);
                  toast.success("Customer link copied.");
                }}
              >
                <Copy className="mr-2 size-4" /> COPY CUSTOMER LINK
              </Button>
            )}
          </div>
          {quoteUrl && detail.quotes[0]?.status !== "draft" && (
            <p className="text-xs break-all text-muted-foreground">{quoteUrl}</p>
          )}
          {/* SMS/email delivery (Twilio, email provider) plugs in here later. */}
        </div>
      </main>
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

