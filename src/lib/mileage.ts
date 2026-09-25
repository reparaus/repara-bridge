/**
 * Mileage provenance — client-safe labels for Repara Mileage Intelligence.
 *
 * Every reading carries where it came from. Estimated mileage is always shown
 * with "~" and an "Estimated" label so it is never mistaken for an odometer
 * reading. Connected-vehicle sources (Smartcar or any future connector) are
 * one optional source among many, never a requirement.
 */

export type MileageTone = "verified" | "connected" | "owner" | "estimated" | "unknown";

export function mileageTone(source: string | null | undefined, confidence: string | null | undefined): MileageTone {
  if (confidence === "estimated" || source === "estimated") return "estimated";
  if (source === "connected_vehicle") return "connected";
  if (confidence === "verified" || source === "repara_shop" || source === "provider_service") return "verified";
  if (source === "imported_provider") return "verified";
  if (source || confidence) return "owner";
  return "unknown";
}

const LABELS: Record<string, { en: string; es: string }> = {
  repara_shop: { en: "Verified at Repara service", es: "Verificado en servicio Repara" },
  provider_service: { en: "Recorded at provider service", es: "Registrado en servicio del proveedor" },
  imported_provider: { en: "From shop record", es: "De registro del taller" },
  connected_vehicle: { en: "Connected vehicle", es: "Vehículo conectado" },
  estimated: { en: "Estimated", es: "Estimado" },
  service_record: { en: "Owner reported · service record", es: "Reportado por el dueño · registro" },
  intake: { en: "Owner reported · service request", es: "Reportado por el dueño · solicitud" },
  owner: { en: "Owner reported", es: "Reportado por el dueño" },
};

/** Short source line, e.g. "Verified at Repara service". */
export function mileageSourceLabel(
  source: string | null | undefined,
  confidence?: string | null,
  lang: string = "en",
): string | null {
  if (!source && !confidence) return null;
  const key = confidence === "estimated" ? "estimated" : (source ?? "owner");
  const entry = LABELS[key] ?? LABELS.owner;
  return lang === "es" ? entry.es : entry.en;
}

/** Compact status used next to the number in Garage: "Verified", "Estimated"… */
export function mileageBadge(tone: MileageTone, lang: string = "en"): string | null {
  const es = lang === "es";
  switch (tone) {
    case "verified":
      return es ? "Verificado" : "Verified";
    case "connected":
      return es ? "Conectado" : "Connected";
    case "owner":
      return es ? "Reportado" : "Owner reported";
    case "estimated":
      return es ? "Estimado" : "Estimated";
    default:
      return null;
  }
}

/** "54,210 mi" or "~55,700 mi" for estimates. */
export function formatMileage(mileage: number | null | undefined, confidence?: string | null): string | null {
  if (mileage == null) return null;
  const n = Number(mileage).toLocaleString("en-US");
  return confidence === "estimated" ? `~${n} mi` : `${n} mi`;
}
