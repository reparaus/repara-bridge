/**
 * Provider types, client-safe. These mirror the `provider_kind` database enum
 * (0015 + 0016) — one list, used by onboarding, the provider dashboard, the
 * customer-facing profile and the admin provider section.
 */

export const PROVIDER_KINDS = [
  { key: "independent_shop", en: "Independent repair shop", es: "Taller independiente" },
  { key: "dealership", en: "Dealership", es: "Concesionario" },
  { key: "mechanic", en: "Mechanic", es: "Mecánico" },
  { key: "mobile_mechanic", en: "Mobile mechanic", es: "Mecánico a domicilio" },
  { key: "detailer", en: "Detail shop", es: "Taller de detallado" },
  { key: "mobile_detailer", en: "Mobile detailer", es: "Detallado a domicilio" },
  { key: "tint_shop", en: "Tint shop", es: "Taller de polarizado" },
  { key: "glass_shop", en: "Glass shop", es: "Taller de cristales" },
  { key: "tire_shop", en: "Tire shop", es: "Llantera" },
  { key: "wheel_shop", en: "Wheel shop", es: "Taller de rines" },
  { key: "body_shop", en: "Body shop", es: "Hojalatería" },
  { key: "paint_shop", en: "Paint shop", es: "Taller de pintura" },
  { key: "ppf_wrap", en: "PPF / Wrap", es: "PPF / Vinilos" },
  { key: "performance_shop", en: "Performance", es: "Rendimiento" },
  { key: "audio_electronics", en: "Audio / Electronics", es: "Audio / Electrónica" },
  { key: "accessories", en: "Accessories", es: "Accesorios" },
  { key: "other", en: "Other automotive provider", es: "Otro proveedor automotriz" },
] as const;

export type ProviderKindKey = (typeof PROVIDER_KINDS)[number]["key"];

export function providerKindLabel(key: string, language = "en"): string {
  const found = PROVIDER_KINDS.find((kind) => kind.key === key);
  if (!found) return key;
  return language === "es" ? found.es : found.en;
}

export const PROVIDER_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};
