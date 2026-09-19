import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { GarageShell } from "@/components/garage/GarageShell";
import { VinScanner } from "@/components/quote/VinScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addVehicle } from "@/lib/garage.functions";
import { decodeVinRemote } from "@/lib/vin.functions";

export const Route = createFileRoute("/_driver/garage/add")({
  head: () => ({
    meta: [
      { title: "Add my car — Repara" },
      {
        name: "description",
        content: "Scan or enter your VIN and Repara identifies your vehicle in seconds.",
      },
      { property: "og:title", content: "Add my car — Repara" },
      { property: "og:description", content: "Your car, understood — add it in under a minute." },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddVehicle,
});

type Decoded = {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  engineDisplacement?: number;
  cylinderCount?: number;
  engineCode?: string;
  fuelType?: string;
  isHybrid?: boolean;
  drivetrain?: string;
  bodyType?: string;
};

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

function AddVehicle() {
  const navigate = useNavigate();
  const decode = useServerFn(decodeVinRemote);
  const save = useServerFn(addVehicle);

  const [step, setStep] = useState<"vin" | "confirm" | "mileage">("vin");
  const [vin, setVin] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [manual, setManual] = useState({ year: "", make: "", model: "", trim: "" });
  const [mileage, setMileage] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);

  async function handleVin(candidate: string) {
    const clean = candidate.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
    setVin(clean);
    if (!VIN_RE.test(clean)) {
      toast.error("That VIN doesn't look complete — it should be 17 characters.");
      return;
    }
    setBusy(true);
    try {
      const result = await decode({ data: { vin: clean } });
      if (result.status === "decoded") {
        setDecoded({ ...result.vehicle, vin: clean } as Decoded);
      } else {
        setDecoded(null);
        toast.message("We couldn't identify that VIN. Add the details below and we'll save it.");
      }
      setStep("confirm");
    } finally {
      setBusy(false);
    }
  }

  async function confirmVehicle() {
    setBusy(true);
    try {
      const payload = decoded
        ? {
            vin: decoded.vin,
            year: decoded.year,
            make: decoded.make,
            model: decoded.model,
            ...(decoded.trim ? { trim: decoded.trim } : {}),
            ...(decoded.engineDisplacement ? { engineDisplacement: decoded.engineDisplacement } : {}),
            ...(decoded.cylinderCount ? { cylinderCount: decoded.cylinderCount } : {}),
            ...(decoded.engineCode ? { engineCode: decoded.engineCode } : {}),
            ...(decoded.fuelType ? { fuelType: decoded.fuelType } : {}),
            ...(decoded.isHybrid !== undefined ? { isHybrid: decoded.isHybrid } : {}),
            ...(decoded.drivetrain ? { drivetrain: decoded.drivetrain } : {}),
            ...(decoded.bodyType ? { bodyType: decoded.bodyType } : {}),
          }
        : {
            ...(vin ? { vin } : {}),
            year: Number(manual.year),
            make: manual.make.trim(),
            model: manual.model.trim(),
            ...(manual.trim.trim() ? { trim: manual.trim.trim() } : {}),
          };

      if (!decoded && (!payload.year || !payload.make || !payload.model)) {
        toast.error("Add the year, make and model so Repara can save your vehicle.");
        return;
      }

      const result = await save({ data: payload });
      setVehicleId(result.vehicleId);
      setStep("mileage");
    } catch (error) {
      toast.error((error as Error).message || "We couldn't save this vehicle.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMileage() {
    const value = Number(mileage.replace(/[^\d]/g, ""));
    if (!vehicleId) return;
    setBusy(true);
    try {
      if (value > 0) {
        const { updateMileage } = await import("@/lib/garage.functions");
        await updateMileage({ data: { vehicleId, mileage: value } });
      }
      navigate({ to: "/garage/vehicle/$id", params: { id: vehicleId } });
    } catch {
      navigate({ to: "/garage/vehicle/$id", params: { id: vehicleId } });
    } finally {
      setBusy(false);
    }
  }

  const shortName = decoded ? `${decoded.make} ${decoded.model}` : `${manual.make} ${manual.model}`.trim();

  return (
    <GarageShell>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Add my car</h1>

      {step === "vin" && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Your VIN is on the driver's door sticker, or the lower corner of the windshield.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="vin">VIN</Label>
            <Input
              id="vin"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="17 characters"
              autoCapitalize="characters"
              className="h-12 font-mono tracking-wider"
            />
          </div>
          <Button
            className="h-12 w-full text-base"
            disabled={busy}
            onClick={() => handleVin(vin)}
          >
            {busy ? "Looking it up…" : "Continue"}
          </Button>
          <Button variant="outline" className="h-12 w-full" onClick={() => setScannerOpen(true)}>
            Scan my VIN
          </Button>
          <button
            type="button"
            className="w-full text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => {
              setDecoded(null);
              setStep("confirm");
            }}
          >
            I don't have my VIN
          </button>

          {scannerOpen && (
            <VinScanner
              onClose={() => setScannerOpen(false)}
              onDetected={(scanned: string) => {
                setScannerOpen(false);
                void handleVin(scanned);
              }}
            />
          )}
        </div>
      )}

      {step === "confirm" && (
        <div className="mt-6 space-y-5">
          {decoded ? (
            <div className="rounded-2xl border border-border/70 bg-card p-5">
              <p className="text-xl font-semibold text-foreground">
                {decoded.year} {decoded.make} {decoded.model}
                {decoded.trim ? ` ${decoded.trim}` : ""}
              </p>
              {decoded.engineDisplacement && (
                <p className="mt-1 text-sm text-muted-foreground">{decoded.engineDisplacement}L</p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">VIN ••••••{decoded.vin.slice(-4)}</p>
              <p className="mt-4 text-sm text-foreground">Is this your vehicle?</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Add what you know and Repara will fill in the rest later.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    inputMode="numeric"
                    value={manual.year}
                    onChange={(e) => setManual({ ...manual, year: e.target.value })}
                    className="h-12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="make">Make</Label>
                  <Input
                    id="make"
                    value={manual.make}
                    onChange={(e) => setManual({ ...manual, make: e.target.value })}
                    className="h-12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    value={manual.model}
                    onChange={(e) => setManual({ ...manual, model: e.target.value })}
                    className="h-12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trim">Trim (optional)</Label>
                  <Input
                    id="trim"
                    value={manual.trim}
                    onChange={(e) => setManual({ ...manual, trim: e.target.value })}
                    className="h-12"
                  />
                </div>
              </div>
            </div>
          )}

          <Button className="h-12 w-full text-base" disabled={busy} onClick={confirmVehicle}>
            {busy ? "Saving…" : "Add to garage"}
          </Button>
          <button
            type="button"
            className="w-full text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => setStep("vin")}
          >
            Back
          </button>
        </div>
      )}

      {step === "mileage" && (
        <div className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="mileage">What's the current mileage?</Label>
            <Input
              id="mileage"
              inputMode="numeric"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="72,418"
              className="h-12 text-lg"
            />
          </div>
          <Button className="h-12 w-full text-base" disabled={busy} onClick={saveMileage}>
            {busy ? "Saving…" : "Continue"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {shortName ? `Your ${shortName} is almost ready.` : "Almost ready."}
          </p>
        </div>
      )}
    </GarageShell>
  );
}
