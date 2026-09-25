import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardSkeletons, LoadError } from "@/components/garage/GarageSkeletons";
import { ProviderShell } from "@/components/provider/ProviderShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildItem } from "@/lib/build-catalog";
import { formatCents, parseDollars } from "@/lib/money";
import { declineProviderInvite, getProviderBrief, submitProviderQuote } from "@/lib/provider-quotes.functions";
import { serviceCategoryLabel } from "@/lib/service-network";

export const Route = createFileRoute("/_driver/provider/project/$id")({
  head: () => ({
    meta: [
      { title: "Project request — Repara Provider" },
      { name: "description", content: "Review a driver's project and send your actual quote." },
      { property: "og:title", content: "Project request — Repara Provider" },
      { property: "og:description", content: "Review the project and send real pricing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectRequest,
});

const EMPTY = { parts: "", labor: "", fees: "", tax: "", notes: "", timeframe: "", warranty: "" };

function ProjectRequest() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getProviderBrief);
  const submit = useServerFn(submitProviderQuote);
  const decline = useServerFn(declineProviderInvite);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["provider-brief", id], queryFn: () => load({ data: { requestId: id } }) });
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);

  const amounts = {
    parts: parseDollars(form.parts),
    labor: parseDollars(form.labor),
    fees: parseDollars(form.fees),
    tax: parseDollars(form.tax),
  };
  const valid = Object.values(amounts).every((v) => v !== null);
  const total = valid ? Object.values(amounts).reduce((a, b) => a! + b!, 0)! : 0;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["provider-brief", id] });
    void queryClient.invalidateQueries({ queryKey: ["provider-invites"] });
  };

  const submitMut = useMutation({
    mutationFn: () =>
      submit({
        data: {
          requestId: id,
          partsCents: amounts.parts!,
          laborCents: amounts.labor!,
          feesCents: amounts.fees!,
          taxCents: amounts.tax!,
          notes: form.notes,
          timeframe: form.timeframe,
          warranty: form.warranty,
        },
      }),
    onSuccess: () => {
      toast.success("Quote sent to the driver.");
      setForm(EMPTY);
      setShowForm(false);
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const declineMut = useMutation({
    mutationFn: () => decline({ data: { requestId: id, reason: "" } }),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  if (isError && !data) {
    return (
      <ProviderShell>
        <LoadError message="Couldn't load this request right now." onRetry={() => void refetch()} />
      </ProviderShell>
    );
  }
  if (isLoading || !data) {
    return (
      <ProviderShell>
        <CardSkeletons rows={3} />
      </ProviderShell>
    );
  }

  const closed = ["declined", "selected", "not_selected"].includes(data.inviteStatus);
  const current = data.quotes.find((q) => q.status === "submitted" || q.status === "accepted");

  return (
    <ProviderShell>
      <Link to="/provider/requests" className="text-sm text-muted-foreground hover:text-foreground">← Requests</Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">New project request</p>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{data.vehicleLabel || "Vehicle"}</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        #{data.requestNumber} · {new Date(data.createdAt).toLocaleDateString()}
        {data.zip ? ` · Area ${data.zip}` : ""}
        {data.mileage ? ` · ${data.mileage.toLocaleString()} mi` : ""}
      </p>

      <section className="mt-6 space-y-3 rounded-2xl border border-border/60 bg-card p-5">
        {data.categoryKey && <p className="text-sm font-medium text-foreground">{serviceCategoryLabel(data.categoryKey, "en")}</p>}
        {data.build && (
          <div>
            <p className="text-xs text-muted-foreground">Build: {data.build.name}</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-foreground">
              {data.build.modifications.map((m, i) => (
                <li key={i}>
                  {buildItem(m.item)?.label ?? m.item}
                  {m.detail ? ` (${m.detail})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.services.length > 0 && <p className="text-sm text-muted-foreground">Services: {data.services.join(", ")}</p>}
        {data.notes && <p className="whitespace-pre-line text-sm text-foreground">{data.notes}</p>}
        <p className="text-xs text-muted-foreground">Repara estimate: unavailable</p>
        <p className="text-xs text-muted-foreground">Customer contact details are shared if the driver selects your quote.</p>
      </section>

      {data.quotes.length > 0 && (
        <section className="mt-6">
          <p className="mb-2 text-sm font-medium text-foreground">Your quotes</p>
          <div className="space-y-2">
            {data.quotes.map((q) => (
              <div key={q.id} className="flex items-center justify-between rounded-2xl border border-border/60 bg-card p-4 text-sm">
                <span>
                  Version {q.version} · {formatCents(q.totalCents)}
                </span>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {q.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.inviteStatus === "selected" && (
        <div className="mt-6 rounded-2xl border border-primary/40 bg-primary/5 p-5 text-sm">
          <p className="font-medium text-foreground">The driver selected your quote.</p>
          <Button asChild className="mt-3 h-11">
            <Link to="/admin/requests/$id" params={{ id }}>Open Job Workspace</Link>
          </Button>
        </div>
      )}
      {data.inviteStatus === "not_selected" && (
        <p className="mt-6 rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">The driver chose another provider.</p>
      )}
      {data.inviteStatus === "declined" && (
        <p className="mt-6 rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">You declined this request.</p>
      )}

      {!closed && !showForm && (
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button className="h-12" onClick={() => setShowForm(true)}>{current ? "Revise quote" : "Submit quote"}</Button>
          <Button
            variant="outline"
            className="h-12"
            disabled={declineMut.isPending}
            onClick={() => {
              if (window.confirm("Decline this request?")) declineMut.mutate();
            }}
          >
            {declineMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Decline
          </Button>
        </div>
      )}

      {!closed && showForm && (
        <form
          className="mt-6 space-y-4 rounded-2xl border border-border/60 bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid || total <= 0) return toast.error("Enter valid amounts.");
            submitMut.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            {(["parts", "labor", "fees", "tax"] as const).map((k) => (
              <div key={k}>
                <Label htmlFor={k} className="capitalize">{k === "fees" ? "Other fees" : k}</Label>
                <Input
                  id={k}
                  inputMode="decimal"
                  placeholder="$0"
                  className="mt-1 h-11"
                  value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  aria-invalid={amounts[k] === null}
                />
              </div>
            ))}
          </div>
          <p className="text-base font-semibold text-foreground">Total {valid ? formatCents(total) : "—"}</p>
          <div>
            <Label htmlFor="timeframe">Estimated completion time</Label>
            <Input id="timeframe" className="mt-1 h-11" maxLength={200} value={form.timeframe} onChange={(e) => setForm((f) => ({ ...f, timeframe: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="warranty">Warranty</Label>
            <Input id="warranty" className="mt-1 h-11" maxLength={500} value={form.warranty} onChange={(e) => setForm((f) => ({ ...f, warranty: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="notes">Notes for the driver</Label>
            <Textarea id="notes" rows={3} maxLength={2000} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="submit" className="h-12" disabled={submitMut.isPending}>
              {submitMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                </>
              ) : current ? (
                "Send revised quote"
              ) : (
                "Send quote"
              )}
            </Button>
            <Button type="button" variant="ghost" className="h-12" onClick={() => setShowForm(false)} disabled={submitMut.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </ProviderShell>
  );
}
