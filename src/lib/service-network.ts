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
  // Repair & maintenance
  { key: "general_mechanic", group: "repair", en: "General repair", es: "Reparación general", hints: ["mechanic", "mecanico", "repair", "reparar", "reparacion", "fix my car", "arreglar"] },
  { key: "mobile_mechanic", group: "repair", en: "Mobile mechanic", es: "Mecánico a domicilio", hints: ["mobile mechanic", "come to me", "at my house", "a domicilio"] },
  { key: "diagnostics", group: "repair", en: "Diagnostics", es: "Diagnóstico", hints: ["diagnostic", "diagnose", "don't know what", "not sure what", "no se que", "diagnostico", "scan"] },
  { key: "check_engine", group: "repair", en: "Check engine light", es: "Luz de check engine", hints: ["check engine", "engine light", "cel", "obd", "code p", "luz del motor", "check engine light"] },
  { key: "warning_lights", group: "repair", en: "Warning lights", es: "Luces de advertencia", hints: ["warning light", "dash light", "light on", "light came on", "abs light", "airbag light", "traction light", "luz de advertencia", "testigo"] },
  { key: "maintenance", group: "repair", en: "Maintenance", es: "Mantenimiento", hints: ["maintenance", "service", "tune up", "tune-up", "spark plug", "wiper", "filter", "mantenimiento", "servicio", "afinacion", "bujia"] },
  { key: "preventive_maintenance", group: "repair", en: "Preventive maintenance", es: "Mantenimiento preventivo", hints: ["preventive", "scheduled service", "mileage service", "30k", "60k", "90k", "inspection", "preventivo"] },
  { key: "oil_service", group: "repair", en: "Oil service", es: "Cambio de aceite", hints: ["oil change", "oil service", "change my oil", "oil", "aceite", "cambio de aceite"] },
  { key: "brakes", group: "repair", en: "Brakes", es: "Frenos", hints: ["brake", "brakes", "squeak", "squeal", "rotor", "pads", "brake pad", "freno", "frenos", "balata", "rechina"] },
  { key: "suspension", group: "repair", en: "Suspension", es: "Suspensión", hints: ["suspension", "shock", "strut", "bumpy", "bouncy", "control arm", "sway bar", "amortiguador", "suspension"] },
  { key: "steering", group: "repair", en: "Steering", es: "Dirección", hints: ["steering", "power steering", "steering wheel", "tie rod", "hard to turn", "direccion", "volante"] },
  { key: "cooling", group: "repair", en: "Cooling system", es: "Sistema de enfriamiento", hints: ["coolant", "radiator", "water pump", "thermostat", "antifreeze", "anticongelante", "radiador", "bomba de agua"] },
  { key: "overheating", group: "repair", en: "Overheating", es: "Sobrecalentamiento", hints: ["overheat", "overheating", "running hot", "temperature gauge", "steam", "sobrecalienta", "calienta"] },
  { key: "ac", group: "repair", en: "A/C & heating", es: "Aire acondicionado y calefacción", hints: ["ac", "a/c", "air conditioning", "air conditioner", "not cold", "isn't getting cold", "blowing warm", "heater", "heat", "hvac", "aire", "no enfria", "calefaccion", "clima"] },
  { key: "engine", group: "repair", en: "Engine", es: "Motor", hints: ["engine", "misfire", "rough idle", "stall", "stalls", "knock", "motor", "falla"] },
  { key: "transmission", group: "repair", en: "Transmission", es: "Transmisión", hints: ["transmission", "shifting", "slipping", "gear", "clutch", "transmision", "cambios", "embrague", "clutch"] },
  { key: "drivetrain", group: "repair", en: "Drivetrain", es: "Tren motriz", hints: ["drivetrain", "differential", "axle", "cv joint", "cv axle", "driveshaft", "transfer case", "4x4", "awd", "diferencial", "flecha"] },
  { key: "electrical", group: "repair", en: "Electrical", es: "Eléctrico", hints: ["electrical", "fuse", "wiring", "power window", "window won't", "lock", "short", "electrico", "corto"] },
  { key: "battery", group: "repair", en: "Battery", es: "Batería", hints: ["battery", "dead battery", "bateria", "acumulador"] },
  { key: "starting_charging", group: "repair", en: "Starting & charging", es: "Arranque y carga", hints: ["won't start", "wont start", "no start", "doesn't start", "clicking", "jump", "alternator", "starter", "slow crank", "no arranca", "marcha", "alternador"] },
  { key: "noise_vibration", group: "repair", en: "Noise / vibration", es: "Ruido / vibración", hints: ["noise", "vibration", "vibrate", "vibrates", "shake", "shakes", "shaking", "wobble", "grinding", "clunk", "rattle", "hum", "whine", "ruido", "vibra", "tiembla", "truena"] },
  { key: "leaks", group: "repair", en: "Leaks", es: "Fugas", hints: ["leak", "leaking", "drip", "dripping", "puddle", "fuga", "gotea", "tira aceite"] },
  { key: "drivability", group: "repair", en: "Performance issue", es: "Problema de rendimiento", hints: ["hesitat", "no power", "loss of power", "sluggish", "poor mileage", "bad gas mileage", "jerks", "surge", "pierde fuerza", "jalonea"] },
  // Tires & wheels
  { key: "tires", group: "tires", en: "Tires", es: "Llantas", hints: ["tire", "tires", "tyre", "new tires", "llanta", "llantas", "neumatico"] },
  { key: "tire_repair", group: "tires", en: "Tire repair", es: "Reparación de llantas", hints: ["flat", "flat tire", "puncture", "nail in", "patch", "plug", "ponchada", "ponchadura", "parche"] },
  { key: "mounting_balancing", group: "tires", en: "Wheel install & balancing", es: "Montaje y balanceo", hints: ["mount", "mounting", "balance", "balancing", "install wheels", "balanceo", "montaje"] },
  { key: "alignment", group: "tires", en: "Alignment", es: "Alineación", hints: ["alignment", "pulls to", "pulling", "crooked steering", "alineacion", "se jala", "se va de lado"] },
  { key: "wheels", group: "tires", en: "Wheels", es: "Rines", hints: ["wheel", "rim", "rims", "curb rash", "rines", "rin"] },
  { key: "tpms", group: "tires", en: "TPMS", es: "Sensor de presión (TPMS)", hints: ["tpms", "tire pressure", "pressure sensor", "tire light", "presion de llanta", "sensor de presion"] },
  // Glass & tint
  { key: "windshield_replacement", group: "glass", en: "Windshield & auto glass", es: "Parabrisas y cristales", hints: ["windshield", "windscreen", "auto glass", "back glass", "side window", "parabrisas", "medallon", "replace glass"] },
  { key: "glass_repair", group: "glass", en: "Glass chip / crack repair", es: "Reparación de cristales", hints: ["chip", "rock chip", "crack", "cracked glass", "glass repair", "cristal", "grieta", "estrellado"] },
  { key: "window_tint", group: "glass", en: "Window tint", es: "Polarizado", hints: ["tint", "tinted", "tinting", "window tint", "35%", "20%", "ceramic tint", "polarizado", "polarizar"] },
  { key: "windshield_tint", group: "glass", en: "Windshield tint", es: "Polarizado de parabrisas", hints: ["windshield tint", "tint the windshield", "tint my windshield", "visor strip", "sun strip", "polarizado de parabrisas"] },
  // Detail & appearance
  { key: "detailing", group: "detail", en: "Detail", es: "Detallado", hints: ["detail", "detailing", "wash", "clean my car", "interior clean", "shampoo", "lavado", "detallado", "lavar"] },
  { key: "mobile_detailing", group: "detail", en: "Mobile detail", es: "Detallado a domicilio", hints: ["mobile detail", "detail at home", "come detail", "detallado a domicilio"] },
  { key: "paint_correction", group: "detail", en: "Paint correction", es: "Corrección de pintura", hints: ["paint correction", "swirl", "swirls", "polish", "buff", "pulido", "pulir"] },
  { key: "ceramic_coating", group: "detail", en: "Ceramic coating", es: "Recubrimiento cerámico", hints: ["ceramic", "coating", "ceramic coat", "ceramico"] },
  { key: "ppf", group: "detail", en: "PPF / paint protection", es: "PPF / protección de pintura", hints: ["ppf", "clear bra", "paint protection", "protection film", "xpel", "pelicula protectora"] },
  { key: "wraps", group: "detail", en: "Wrap", es: "Vinil / wrap", hints: ["wrap", "wrapped", "vinyl", "color change", "chrome delete", "vinil", "vinilo"] },
  // Body & paint
  { key: "body_repair", group: "body", en: "Collision & body repair", es: "Hojalatería y colisión", hints: ["body", "body work", "collision", "accident", "fender", "quarter panel", "door panel", "body panel", "hojalateria", "choque", "salpicadera"] },
  { key: "bumper", group: "body", en: "Bumper", es: "Defensa", hints: ["bumper", "bumper cover", "defensa", "fascia"] },
  { key: "dent_repair", group: "body", en: "Dent repair", es: "Reparación de golpes", hints: ["dent", "ding", "pdr", "hail", "golpe", "abolladura", "granizo"] },
  { key: "paint", group: "body", en: "Paint", es: "Pintura", hints: ["paint", "repaint", "scratch", "scratches", "clear coat", "peeling", "pintura", "pintar", "rayon"] },
  // Performance & accessories
  { key: "exhaust", group: "performance", en: "Exhaust", es: "Escape", hints: ["exhaust", "muffler", "catalytic", "loud exhaust", "downpipe", "escape", "mofle"] },
  { key: "intake", group: "performance", en: "Intake", es: "Admisión", hints: ["intake", "cold air intake", "air intake", "admision"] },
  { key: "suspension_upgrade", group: "performance", en: "Suspension upgrades", es: "Mejoras de suspensión", hints: ["lower", "lowering", "coilover", "coilovers", "lift kit", "leveling kit", "lowering springs", "bajar", "levantar"] },
  { key: "performance", group: "performance", en: "Performance modifications", es: "Modificaciones de rendimiento", hints: ["performance", "tune", "tuning", "turbo", "supercharger", "horsepower", "remap", "rendimiento"] },
  { key: "lighting", group: "performance", en: "Lighting", es: "Iluminación", hints: ["headlight", "headlights", "tail light", "fog light", "led", "hid", "bulb", "faro", "faros", "foco", "calavera"] },
  { key: "audio", group: "performance", en: "Audio", es: "Audio", hints: ["audio", "stereo", "speaker", "speakers", "subwoofer", "amp", "radio", "bocina", "bocinas", "estereo"] },
  { key: "electronics", group: "performance", en: "Electronics", es: "Electrónica", hints: ["dash cam", "backup camera", "camera", "carplay", "android auto", "remote start", "electronics", "pantalla", "camara"] },
  { key: "accessories", group: "performance", en: "Accessories", es: "Accesorios", hints: ["accessory", "accessories", "roof rack", "tow hitch", "hitch", "running boards", "bed cover", "accesorios"] },
  { key: "aftermarket_install", group: "performance", en: "Aftermarket installation", es: "Instalación de accesorios", hints: ["aftermarket", "install parts", "installation", "instalar", "instalacion"] },
  // Roadside / other
  { key: "towing", group: "other", en: "Towing", es: "Grúa", hints: ["tow", "towing", "tow truck", "grua"] },
  { key: "roadside", group: "other", en: "Roadside assistance", es: "Asistencia en carretera", hints: ["roadside", "jump start", "stranded", "locked out", "lockout", "out of gas", "carretera", "me quede tirado"] },
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

/** Lower-case, accent-free text so "calefacción" and "calefaccion" match. */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HINT_PATTERNS = new Map<string, RegExp>();
/**
 * Whole-word match (with common suffixes: tire→tires, detail→detailed), so a
 * short hint like "ac" never matches inside "replace".
 */
function hintPattern(hint: string): RegExp {
  let pattern = HINT_PATTERNS.get(hint);
  if (!pattern) {
    pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizeText(hint))}(s|es|ed|d|ing|ning)?(?=$|[^a-z0-9])`);
    HINT_PATTERNS.set(hint, pattern);
  }
  return pattern;
}

/**
 * Cheap deterministic intent detection from plain driver wording. Used as a
 * fallback and as a sanity check on AI output — never as a diagnosis. Longer,
 * more specific phrases score higher; "other" is only returned by callers when
 * nothing matched.
 */
export function detectServiceCategories(text: string, limit = 3): string[] {
  const haystack = normalizeText(text);
  const hits: { key: string; score: number }[] = [];
  for (const category of SERVICE_CATEGORIES) {
    let score = 0;
    for (const hint of category.hints) {
      if (hintPattern(hint).test(haystack)) score += hint.length + (hint.includes(" ") ? 4 : 0);
    }
    const label = normalizeText(category.en);
    if (label.length > 3 && haystack.includes(label)) score += label.length;
    if (score) hits.push({ key: category.key, score });
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((h) => h.key);
}

/** Best single category for a request, or "other" only when nothing maps. */
export function bestServiceCategory(text: string): string {
  return detectServiceCategories(text, 1)[0] ?? "other";
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

/**
 * Bridge to the EXISTING service-request form. The intake flow keeps its own
 * (deliberately smaller) service list, so anything outside it starts as "other"
 * and the driver's own words carry the detail.
 */
const REQUEST_SERVICE_KEY: Record<string, string> = {
  oil_service: "oil_filter",
  brakes: "brakes",
  maintenance: "maintenance",
  preventive_maintenance: "maintenance",
  battery: "battery",
  starting_charging: "battery",
  diagnostics: "diagnostics",
  check_engine: "diagnostics",
  warning_lights: "diagnostics",
  noise_vibration: "diagnostics",
  leaks: "diagnostics",
  overheating: "diagnostics",
  drivability: "diagnostics",
  cooling: "diagnostics",
  electrical: "diagnostics",
  engine: "diagnostics",
  transmission: "diagnostics",
  drivetrain: "diagnostics",
  steering: "diagnostics",
  suspension: "diagnostics",
  ac: "diagnostics",
};

export function requestServiceKeyFor(categoryKey: string | null | undefined): string {
  return (categoryKey && REQUEST_SERVICE_KEY[categoryKey]) || "other";
}
