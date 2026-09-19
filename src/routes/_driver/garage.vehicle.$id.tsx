import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { GarageShell, SectionTitle, StatusDot } from "@/components/garage/GarageShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addServiceRecord, getVehicle, updateMileage } from "@/lib/garage.functions";

export const Route = createFileRoute("/_driver/garage/vehicle/$id")({
  head: () => ({
    meta: [
      { title: "My vehicle — Repara" },
      {
        name: "description",
        content: "Vehicle status, upcoming maintenance, recall information and full service history.",
      },
      { property: "og:title", content: "My vehicle — Repara" },
      { property: "og:description", content: "Everything Repara knows about your car." },
    ],
  }),
  component: VehicleProfile,
});

const HISTORY_SOURCE_LABEL: Record<string, string> = {
  repara_verified: "Repara verified",
  imported: "Imported record",
  connected_vehicle: "Connected vehicle",
  document: "From your document",
  owner_provided: "Added by you",
};

const MAINTENANCE_LABEL: Record<string, string> = {
  up_to_date: "Up to date",
  coming_up: "Coming up",
  due: "Due",
  overdue: "Overdue",
  unknown: "History unknown",
};

function VehicleProfile() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getVehicle);
  const saveMileage = useServerFn(updateMileage);
  const saveRecord = useServerFn(addServiceRecord);

  const { data, isLoading } = useQuery({
    queryKey: ["garage-vehicle", id],
    queryFn: () => load({ data: { vehicleId: id } }),
  });

  const [mileageOpen, setMileageOpen] = useState(false);
  const [mileage, setMileage] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [record, setRecord] = useState({ date: "", provider: "", items: "", mileage: "" });
  const [recallOpen, setRecallOpen] = useState(false);

  const mileageMutation = useMutation({
    mutationFn: async () => {
      const value = Number(mileage.replace(/[^\d]/g, ""));
      if (!value) throw new Error("Enter the mileage on your odometer.");
      return saveMileage({ data: { vehicleId: id, mileage: value } });
    },
    onSuccess: async () => {
      setMileageOpen(false);
      setMileage("");
      await queryClient.invalidateQueries({ queryKey: ["garage-vehicle", id] });
      await queryClient.invalidateQueries({ queryKey: ["garage-home"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const recordMutation = useMutation({
    mutationFn: async () => {
      const items = record.items
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (!record.date || !items.length) throw new Error("Add the date and what was done.");
      const mileageValue = Number(record.mileage.replace(/[^\d]/g, ""));
      return saveRecord({
        data: {
          vehicleId: id,
          serviceDate: record.date,
          items,
          ...(record.provider.trim() ? { providerName: record.provider.trim() } : {}),
          ...(mileageValue ? { mileage: mileageValue } : {}),
        },
      });
    },
    onSuccess: async () => {
      setRecordOpen(false);
      setRecord({ date: "", provider: "", items: "", mileage: "" });
      await queryClient.invalidateQueries({ queryKey: ["garage-vehicle", id] });
      toast.success("Service record added.");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  if (isLoading || !data) {
    return (
      <GarageShell>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-40 w-full rounded-2xl" />
      </GarageShell>
    );
  }

  const { vehicle } = data;

  return (
    <GarageShell>
      <div>
        <VehicleVisual
          size="hero"
          year={vehicle.year}
          make={vehicle.make}
          model={vehicle.model}
          trim={vehicle.trim}
        />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          {vehicle.nickname ?? vehicle.label}
        </h1>
        {(vehicle.trim || vehicle.engine) && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[vehicle.trim, vehicle.engine].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mt-0.5 text-sm text-muted-foreground">
          {vehicle.currentMileage ? `${vehicle.currentMileage.toLocaleString()} miles` : "Mileage not added yet"}
          {vehicle.vinMasked ? ` · VIN ${vehicle.vinMasked}` : ""}
        </p>
        <Button variant="outline" className="mt-3 h-11" onClick={() => setMileageOpen(true)}>
          Update mileage
        </Button>
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------- overview */}
        <TabsContent value="overview" className="mt-6 space-y-8">
          <div>
            <SectionTitle>Vehicle status</SectionTitle>
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card p-5">
              <StatusDot tone={data.status.tone} />
              <span className="text-base text-foreground">{data.status.label}</span>
            </div>
          </div>

          <div>
            <SectionTitle>Coming up</SectionTitle>
            <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm">
              {data.nextService ? (
                <p className="text-foreground">
                  {data.nextService.label}
                  <span className="text-muted-foreground"> · {data.nextService.detail}</span>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Maintenance information isn't available for this vehicle yet.
                </p>
              )}
            </div>
          </div>

          <div>
            <SectionTitle>Recent</SectionTitle>
            <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm">
              {data.history.length ? (
                <div className="space-y-1">
                  <p className="text-foreground">{data.history[0].items.join(" · ") || "Service performed"}</p>
                  <p className="text-muted-foreground">
                    {data.history[0].date}
                    {data.history[0].mileage ? ` · ${data.history[0].mileage.toLocaleString()} mi` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No connected service history yet. Repara will start building your vehicle's record as
                  services are added.
                </p>
              )}
            </div>
          </div>

          {data.recalls.length > 0 && (
            <div>
              <SectionTitle>Vehicle knowledge</SectionTitle>
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
                <p className="text-sm text-foreground">⚠ Recall information available</p>
                <Button variant="outline" className="mt-3 h-11" onClick={() => setRecallOpen(true)}>
                  Review
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild variant="secondary" className="h-12">
              <Link to="/garage/ask" search={{ vehicle: id }}>
                Ask Repara
              </Link>
            </Button>
            <Button asChild className="h-12">
              <Link to="/garage/service" search={{ vehicle: id }}>
                Find service
              </Link>
            </Button>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------- maintenance */}
        <TabsContent value="maintenance" className="mt-6">
          {data.maintenance.length ? (
            <div className="space-y-3">
              {data.maintenance.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-card p-4"
                >
                  <span className="text-sm text-foreground">{item.label}</span>
                  <span className="text-sm text-muted-foreground">
                    {MAINTENANCE_LABEL[item.status] ?? item.status}
                    {item.dueMileage ? ` · ≈${item.dueMileage.toLocaleString()} mi` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
              Maintenance information isn't available for this vehicle yet. Repara only shows maintenance
              backed by a real source, never estimates presented as manufacturer requirements.
            </div>
          )}
        </TabsContent>

        {/* -------------------------------------------------------- history */}
        <TabsContent value="history" className="mt-6 space-y-6">
          <div className="flex justify-end">
            <Button variant="outline" className="h-11" onClick={() => setRecordOpen(true)}>
              Add service record
            </Button>
          </div>

          {data.timeline.length === 0 && (
            <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
              No connected service history yet. Repara will start building your vehicle's record as services
              are added.
            </div>
          )}

          <div className="space-y-3">
            {data.history.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-border/70 bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  {entry.date}
                  {entry.mileage ? ` · ${entry.mileage.toLocaleString()} mi` : ""}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  {(entry.items.length ? entry.items : [entry.summary ?? "Service performed"]).map(
                    (item, index) => (
                      <li key={index}>{item}</li>
                    ),
                  )}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  {entry.providerName ? `Performed by ${entry.providerName} · ` : ""}
                  {HISTORY_SOURCE_LABEL[entry.source] ?? entry.source}
                </p>
              </div>
            ))}
          </div>

          {data.timeline.length > 0 && (
            <div>
              <SectionTitle>Timeline</SectionTitle>
              <ol className="space-y-3">
                {data.timeline.map((event, index) => (
                  <li key={index} className="rounded-xl border border-border/60 bg-card/60 p-4 text-sm">
                    <p className="text-muted-foreground">
                      {event.date}
                      {event.mileage ? ` · ${event.mileage.toLocaleString()} mi` : ""}
                    </p>
                    <p className="mt-1 text-foreground">{event.title}</p>
                    {event.detail && <p className="text-xs text-muted-foreground">{event.detail}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </TabsContent>

        {/* ----------------------------------------------------------- info */}
        <TabsContent value="info" className="mt-6">
          <dl className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card px-5">
            {[
              ["Year", vehicle.year ? String(vehicle.year) : "—"],
              ["Make", vehicle.make ?? "—"],
              ["Model", vehicle.model ?? "—"],
              ["Trim", vehicle.trim ?? "—"],
              ["Engine", vehicle.engine ?? "—"],
              ["Drivetrain", vehicle.drivetrain ?? "—"],
              ["Body", vehicle.bodyType ?? "—"],
              ["Fuel", vehicle.fuelType ?? "—"],
              ["VIN", vehicle.vinMasked ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------- dialogs */}
      <Dialog open={mileageOpen} onOpenChange={setMileageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update mileage</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-mileage">Current mileage</Label>
            <Input
              id="new-mileage"
              inputMode="numeric"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              className="h-12 text-lg"
            />
          </div>
          <Button
            className="h-12 w-full"
            disabled={mileageMutation.isPending}
            onClick={() => mileageMutation.mutate()}
          >
            Save
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a service record</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Records you add are saved as your own entry — Repara won't present them as verified.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="record-date">Date</Label>
              <Input
                id="record-date"
                type="date"
                value={record.date}
                onChange={(e) => setRecord({ ...record, date: e.target.value })}
                className="h-12"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="record-mileage">Mileage (optional)</Label>
              <Input
                id="record-mileage"
                inputMode="numeric"
                value={record.mileage}
                onChange={(e) => setRecord({ ...record, mileage: e.target.value })}
                className="h-12"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="record-provider">Who did the work? (optional)</Label>
              <Input
                id="record-provider"
                value={record.provider}
                onChange={(e) => setRecord({ ...record, provider: e.target.value })}
                className="h-12"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="record-items">What was done? One per line</Label>
              <textarea
                id="record-items"
                rows={4}
                value={record.items}
                onChange={(e) => setRecord({ ...record, items: e.target.value })}
                className="w-full rounded-md border border-input bg-background p-3 text-sm"
                placeholder={"Engine oil & filter\nTire rotation"}
              />
            </div>
          </div>
          <Button
            className="h-12 w-full"
            disabled={recordMutation.isPending}
            onClick={() => recordMutation.mutate()}
          >
            Save record
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={recallOpen} onOpenChange={setRecallOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recall information</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            These manufacturer recalls apply to your vehicle's year, make and model. That doesn't tell us
            whether the work was already done on your specific vehicle — a dealer can confirm using your VIN.
          </p>
          <div className="space-y-3">
            {data.recalls.map((recall) => (
              <div key={recall.id} className="rounded-xl border border-border/70 p-4 text-sm">
                <p className="font-medium text-foreground">{recall.title}</p>
                {recall.summary && <p className="mt-1 text-muted-foreground">{recall.summary}</p>}
                <a
                  href={recall.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs underline underline-offset-4"
                >
                  Source: NHTSA
                </a>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </GarageShell>
  );
}
