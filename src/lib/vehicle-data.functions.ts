import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Model suggestions from the NHTSA vPIC catalog, fetched server-side so a
 * provider change never touches the browser. Failure is never fatal: the caller
 * falls back to the offline list in `vehicle-data.ts` and free typing.
 */
export const vehicleModelsRemote = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        make: z.string().trim().min(1).max(60),
        year: z.string().trim().regex(/^\d{4}$/).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const make = encodeURIComponent(data.make);
    const url = data.year
      ? `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${make}/modelyear/${data.year}?format=json`
      : `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${make}?format=json`;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) return { status: "unavailable" as const, models: [] as string[] };
      const body = (await res.json()) as { Results?: { Model_Name?: string }[] };
      const models = Array.from(
        new Set(
          (body.Results ?? [])
            .map((r) => (r.Model_Name ?? "").trim())
            .filter((m) => m.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b));
      return { status: "ok" as const, models };
    } catch {
      return { status: "unavailable" as const, models: [] as string[] };
    }
  });
