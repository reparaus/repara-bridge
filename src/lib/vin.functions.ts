import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { normalizeDrivetrain, normalizeFuel } from "./vehicle-config";

/**
 * VIN decoding runs on the server so a provider swap (or an API key) never
 * touches the browser. V1 uses the free NHTSA vPIC service, which also returns
 * engine, fuel and drivetrain data we use for accurate quoting.
 */
export const decodeVinRemote = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ vin: z.string().trim().regex(/^[A-HJ-NPR-Z0-9]{17}$/) }).parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${data.vin}?format=json`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) return { status: "unavailable" as const };

      const body = (await res.json()) as { Results?: Record<string, string>[] };
      const r = body.Results?.[0];
      const year = Number(r?.ModelYear ?? "");
      const make = (r?.Make ?? "").trim();
      const model = (r?.Model ?? "").trim();
      const trim = (r?.Trim ?? "").trim();

      if (!year || !make || !model) return { status: "unavailable" as const };

      const displacement = Number(r?.DisplacementL ?? "");
      const cylinders = Number(r?.EngineCylinders ?? "");
      const engineCode = (r?.EngineModel ?? "").trim();
      const bodyType = (r?.BodyClass ?? "").trim();
      const { fuelType, isHybrid } = normalizeFuel(r?.FuelTypePrimary, r?.ElectrificationLevel);

      return {
        status: "decoded" as const,
        vehicle: {
          vin: data.vin,
          year,
          make: titleCase(make),
          model: titleCase(model),
          trim: trim || undefined,
          engineDisplacement:
            Number.isFinite(displacement) && displacement > 0
              ? Math.round(displacement * 10) / 10
              : undefined,
          cylinderCount: Number.isFinite(cylinders) && cylinders > 0 ? cylinders : undefined,
          engineCode: engineCode || undefined,
          fuelType,
          isHybrid,
          drivetrain: normalizeDrivetrain(r?.DriveType, bodyType),
          bodyType: bodyType || undefined,
        },
      };
    } catch {
      return { status: "error" as const };
    }
  });

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 3 && /^[a-z]+$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
