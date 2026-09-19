/**
 * Repara service taxonomy (client-safe).
 *
 * The same classification drives the consumer Service area, Ask Repara intent
 * detection, provider profiles and future provider matching. Keys mirror
 * public.service_categories exactly (see migration 0015), so the UI, the AI and
 * the database never drift apart.
 */

export type ServiceGroupKey =
  | "repair"
  | "detail"
  | "glass"
  | "tires"
  | "body"
  | "performance"
  | "other";

export type ServiceCategory = {
  key: string;
  group: ServiceGroupKey;
  en: string;
  es: string;
  /** Plain words a driver is likely to use. Used for local intent matching. */
  hints: string[];
};

export const SERVICE_GROUPS: { key: ServiceGroupKey; en: string; es: string }[] = [
  { key: "repair", en: "Repair & maintenance", es: "Reparación y mantenimiento" },
  { key: "detail", en: "Detail & appearance", es: "Detallado y apariencia" },
  { key: "glass", en: "Glass & tint", es: "Cristales y polarizado" },
  { key: "tires", en: "Tires & wheels", es: "Llantas y rines" },
  { key: "body", en: "Body & paint", es: "Hojalatería y pintura" },
  { key: "performance", en: "Performance & accessories", es: "Rendimiento y accesorios" },
  { key: "other", en: "Other", es: "Otros" },
];

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { key: "general_mechanic", group: "repair", en: "General mechanic", es: "Mecánico general", hints: ["mechanic", "mecanico", "repair", "reparar"] },
  { key: "mobile_mechanic", group: "repair", en: "Mobile mechanic", es: "Mecánico a domicilio", hints: ["mobile mechanic", "come to me", "a domicilio"] },
  { key: "diagnostics", group: "repair", en: "Diagnostics", es: "Diagnóstico", hints: ["check engine", "warning light", "codigo", "luz", "don't know", "no se que"] },
  { key: "brakes", group: "repair", en: "Brakes", es: "Frenos", hints: ["brake", "brakes", "squeak", "rotor", "freno", "frenos", "rechina"] },
  { key: "electrical", group: "repair", en: "Electrical", es: "Eléctrico", hints: ["battery", "electrical", "window won't", "alternator", "bateria", "electrico"] },
  { key: "ac", group: "repair", en: "Air conditioning", es: "Aire acondicionado", hints: ["ac", "a/c", "air conditioning", "heater", "aire", "no enfria"] },
  { key: "maintenance", group: "repair", en: "Maintenance", es: "Mantenimiento", hints: ["oil change", "service", "tune up", "aceite", "servicio", "mantenimiento"] },
  { key: "suspension", group: "repair", en: "Suspension", es: "Suspensión", hints: ["suspension", "shocks", "struts", "bumpy", "amortiguador"] },
  { key: "engine", group: "repair", en: "Engine", es: "Motor", hints: ["engine", "misfire", "overheat", "motor", "sobrecalienta"] },
  { key: "transmission", group: "repair", en: "Transmission", es: "Transmisión", hints: ["transmission", "shifting", "slipping", "transmision", "cambios"] },
  { key: "mobile_detailing", group: "detail", en: "Mobile detailing", es: "Detallado a domicilio", hints: ["mobile detail", "detail at home", "detallado a domicilio"] },
  { key: "detailing", group: "detail", en: "Detailing", es: "Detallado", hints: ["detail", "detailing", "wash", "interior clean", "lavado", "detallado"] },
  { key: "paint_correction", group: "detail", en: "Paint correction", es: "Corrección de pintura", hints: ["paint correction", "swirl", "polish", "pulido"] },
  { key: "ceramic_coating", group: "detail", en: "Ceramic coating", es: "Recubrimiento cerámico", hints: ["ceramic", "coating", "ceramico"] },
  { key: "ppf", group: "detail", en: "Paint protection film", es: "Película protectora", hints: ["ppf", "clear bra", "paint protection"] },
  { key: "wraps", group: "detail", en: "Wraps", es: "Vinilos", hints: ["wrap", "vinyl", "vinilo"] },
  { key: "windshield_replacement", group: "glass", en: "Windshield replacement", es: "Cambio de parabrisas", hints: ["windshield", "windscreen", "parabrisas", "replace glass"] },
  { key: "glass_repair", group: "glass", en: "Glass repair", es: "Reparación de cristales", hints: ["chip", "crack", "glass repair", "cristal", "grieta"] },
  { key: "window_tint", group: "glass", en: "Window tint", es: "Polarizado", hints: ["tint", "35%", "ceramic tint", "polarizado"] },
  { key: "tires", group: "tires", en: "Tires", es: "Llantas", hints: ["tire", "tires", "flat", "llanta", "llantas", "ponchada"] },
  { key: "mounting_balancing", group: "tires", en: "Mounting & balancing", es: "Montaje y balanceo", hints: ["mount", "balance", "balanceo"] },
  { key: "alignment", group: "tires", en: "Alignment", es: "Alineación", hints: ["alignment", "pulls to", "alineacion", "se jala"] },
  { key: "wheels", group: "tires", en: "Wheels", es: "Rines", hints: ["wheel", "rim", "rines", "rin"] },
  { key: "dent_repair", group: "body", en: "Dent repair", es: "Reparación de golpes", hints: ["dent", "ding", "pdr", "golpe", "abolladura"] },
  { key: "body_repair", group: "body", en: "Body repair", es: "Hojalatería", hints: ["body", "collision", "bumper", "hojalateria", "choque"] },
  { key: "paint", group: "body", en: "Paint", es: "Pintura", hints: ["paint", "repaint", "pintura", "pintar"] },
  { key: "exhaust", group: "performance", en: "Exhaust", es: "Escape", hints: ["exhaust", "muffler", "loud", "escape", "mofle"] },
  { key: "performance", group: "performance", en: "Performance", es: "Rendimiento", hints: ["performance", "tune", "intake", "turbo"] },
  { key: "audio", group: "performance", en: "Audio", es: "Audio", hints: ["audio", "stereo", "speakers", "bocinas"] },
  { key: "electronics", group: "performance", en: "Electronics", es: "Electrónica", hints: ["dash cam", "camera", "electronics", "pantalla"] },
  { key: "accessories", group: "performance", en: "Accessories", es: "Accesorios", hints: ["accessory", "accessories", "rack", "accesorios"] },
  { key: "towing", group: "other", en: "Towing", es: "Grúa", hints: ["tow", "towing", "grua"] },
  { key: "roadside", group: "other", en: "Roadside assistance", es: "Asistencia en carretera", hints: ["roadside", "jump start", "stranded", "carretera"] },
  { key: "other", group: "other", en: "Other automotive service", es: "Otro servicio automotriz", hints: [] },
];

const BY_KEY = new Map(SERVICE_CATEGORIES.map((c) => [c.key, c]));

export function serviceCategory(key: string | null | undefined): ServiceCategory | null {
  return key ? (BY_KEY.get(key) ?? null) : null;
}

export function serviceCategoryLabel(key: string | null | undefined, language: string): string | null {
  const category = serviceCategory(key);
  if (!category) return null;
  return language === "es" ? category.es : category.en;
}

export function serviceGroupLabel(group: ServiceGroupKey, language: string): string {
  const entry = SERVICE_GROUPS.find((g) => g.key === group);
  if (!entry) return group;
  return language === "es" ? entry.es : entry.en;
}

/**
 * Cheap deterministic intent detection from plain driver wording. Used as a
 * fallback and as a sanity check on AI output — never as a diagnosis.
 */
export function detectServiceCategories(text: string, limit = 3): string[] {
  const haystack = ` ${text.toLowerCase()} `;
  const hits: { key: string; score: number }[] = [];
  for (const category of SERVICE_CATEGORIES) {
    let score = 0;
    for (const hint of category.hints) {
      if (haystack.includes(` ${hint}`) || haystack.includes(hint)) score += hint.length;
    }
    if (score) hits.push({ key: category.key, score });
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((h) => h.key);
}

export function groupedCategories(language: string) {
  return SERVICE_GROUPS.map((group) => ({
    key: group.key,
    label: language === "es" ? group.es : group.en,
    categories: SERVICE_CATEGORIES.filter((c) => c.group === group.key && c.key !== "other").map((c) => ({
      key: c.key,
      label: language === "es" ? c.es : c.en,
    })),
  }));
}
