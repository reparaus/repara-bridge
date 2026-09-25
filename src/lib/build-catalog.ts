/**
 * Build modification catalog — generic modification TYPES only.
 * No brands, products, prices or fitment claims live here. Each item maps to
 * the existing service taxonomy so a build can become a real service request.
 */

export type BuildItem = { key: string; label: string; service: string; hints?: string[] };
export type BuildCategory = { key: string; label: string; items: BuildItem[] };

export const BUILD_CATEGORIES: BuildCategory[] = [
  {
    key: "exterior",
    label: "Exterior",
    items: [
      { key: "paint", label: "Paint", service: "paint", hints: ["paint", "respray", "color"] },
      { key: "wrap", label: "Wrap", service: "wraps", hints: ["wrap", "vinyl"] },
      { key: "ppf", label: "PPF", service: "ppf", hints: ["ppf", "paint protection film", "clear bra"] },
      { key: "window_tint", label: "Window Tint", service: "window_tint", hints: ["tint", "tinted"] },
      { key: "spoiler", label: "Spoiler / Wing", service: "accessories", hints: ["spoiler", "wing"] },
      { key: "body_kit", label: "Body Kit", service: "body_repair", hints: ["body kit", "widebody", "aggressive"] },
      { key: "front_lip", label: "Front Lip", service: "accessories", hints: ["lip", "splitter"] },
      { key: "rear_diffuser", label: "Rear Diffuser", service: "accessories", hints: ["diffuser"] },
      { key: "grille", label: "Grille", service: "accessories", hints: ["grille", "grill"] },
      { key: "lighting", label: "Lighting", service: "lighting", hints: ["lights", "headlights", "led"] },
      { key: "bumper", label: "Bumpers", service: "bumper", hints: ["bumper"] },
      { key: "exterior_other", label: "Other exterior", service: "accessories" },
    ],
  },
  {
    key: "wheels_tires",
    label: "Wheels & Tires",
    items: [
      { key: "wheels", label: "Wheels", service: "wheels", hints: ["wheels", "rims"] },
      { key: "tires", label: "Tires", service: "tires", hints: ["tires", "tyres"] },
      { key: "wheel_tire_package", label: "Wheel / Tire Package", service: "wheels" },
      { key: "tire_repair", label: "Tire Repair", service: "tire_repair", hints: ["flat", "puncture"] },
      { key: "tpms", label: "TPMS", service: "tpms", hints: ["tpms"] },
    ],
  },
  {
    key: "suspension",
    label: "Suspension",
    items: [
      { key: "lower_front", label: "Lower front ride height", service: "suspension_upgrade", hints: ["lower", "lowered", "stance"] },
      { key: "lower_rear", label: "Lower rear ride height", service: "suspension_upgrade", hints: ["lower", "lowered", "stance"] },
      { key: "springs", label: "Springs", service: "suspension_upgrade", hints: ["springs"] },
      { key: "coilovers", label: "Coilovers", service: "suspension_upgrade", hints: ["coilovers", "coilover"] },
      { key: "air_suspension", label: "Air Suspension", service: "suspension_upgrade", hints: ["air suspension", "bags"] },
      { key: "sway_bars", label: "Sway Bars", service: "suspension_upgrade", hints: ["sway bar", "sway bars"] },
      { key: "alignment", label: "Alignment", service: "alignment", hints: ["alignment"] },
      { key: "suspension_other", label: "Other suspension", service: "suspension" },
    ],
  },
  {
    key: "performance",
    label: "Performance",
    items: [
      { key: "intake", label: "Intake", service: "intake", hints: ["intake"] },
      { key: "exhaust", label: "Exhaust", service: "exhaust", hints: ["exhaust", "louder", "loud"] },
      { key: "intercooler", label: "Intercooler", service: "performance", hints: ["intercooler"] },
      { key: "forced_induction", label: "Turbo / Supercharger", service: "performance", hints: ["turbo", "supercharger"] },
      { key: "engine_mods", label: "Engine Mods", service: "performance" },
      { key: "tuning", label: "Tuning", service: "performance", hints: ["tune", "tuning", "track"] },
      { key: "perf_cooling", label: "Cooling", service: "cooling", hints: ["radiator", "oil cooler"] },
      { key: "performance_other", label: "Other performance", service: "performance" },
    ],
  },
  {
    key: "brakes",
    label: "Brakes",
    items: [
      { key: "pads", label: "Pads", service: "brakes", hints: ["pads"] },
      { key: "rotors", label: "Rotors", service: "brakes", hints: ["rotors"] },
      { key: "calipers", label: "Calipers", service: "brakes", hints: ["calipers"] },
      { key: "brake_kit", label: "Brake Kit", service: "brakes", hints: ["big brake", "brake kit", "track"] },
      { key: "brake_lines_fluid", label: "Brake Lines / Fluid", service: "brakes" },
    ],
  },
  {
    key: "interior",
    label: "Interior",
    items: [
      { key: "seats", label: "Seats", service: "accessories", hints: ["seats", "bucket"] },
      { key: "steering_wheel", label: "Steering Wheel", service: "accessories" },
      { key: "audio", label: "Audio", service: "audio", hints: ["audio", "speakers", "subwoofer", "stereo"] },
      { key: "electronics", label: "Electronics", service: "electronics", hints: ["dashcam", "carplay"] },
      { key: "interior_accessories", label: "Accessories", service: "accessories" },
    ],
  },
  {
    key: "protection",
    label: "Protection / Appearance",
    items: [
      { key: "ceramic_coating", label: "Ceramic Coating", service: "ceramic_coating", hints: ["ceramic", "coating"] },
      { key: "paint_correction", label: "Paint Correction", service: "paint_correction", hints: ["correction", "swirls"] },
      { key: "detailing", label: "Detailing", service: "detailing", hints: ["detail", "detailed", "clean"] },
    ],
  },
];

const ITEM_INDEX = new Map(
  BUILD_CATEGORIES.flatMap((c) => c.items.map((i) => [i.key, { ...i, category: c.key, categoryLabel: c.label }] as const)),
);

export function buildItem(key: string) {
  return ITEM_INDEX.get(key) ?? null;
}

export function isBuildItem(category: string, key: string) {
  return ITEM_INDEX.get(key)?.category === category;
}

export const PRESETS = [
  { key: "stock", label: "Stock" },
  { key: "daily", label: "Daily" },
  { key: "show", label: "Show" },
  { key: "track", label: "Track" },
  { key: "custom", label: "Custom" },
] as const;
export type Preset = (typeof PRESETS)[number]["key"];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Keyword suggestions from the driver's own words. Whole-word matching, no AI
 * invention: it only proposes generic modification types from this catalog.
 */
export function suggestBuildItems(text: string): string[] {
  const t = ` ${norm(text).replace(/[^a-z0-9$ ]+/g, " ")} `;
  const hits: string[] = [];
  for (const [key, item] of ITEM_INDEX) {
    if (item.hints?.some((h) => new RegExp(`\\b${norm(h).replace(/ /g, "\\s+")}\\b`).test(t))) hits.push(key);
  }
  return hits;
}

/** Build modifications → distinct service requirements (drives provider routing). */
export function serviceRequirements(itemKeys: string[]): string[] {
  const set = new Set<string>();
  for (const key of itemKeys) {
    const item = ITEM_INDEX.get(key);
    if (!item) continue;
    set.add(item.service);
    if (["coilovers", "lower_front", "lower_rear", "springs", "air_suspension"].includes(key)) set.add("alignment");
  }
  return [...set];
}

export const MOD_STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  requested: "Quote requested",
  quoted: "Quoted",
  approved: "Approved",
  installed: "Installed",
  verified: "Verified",
  removed: "Removed",
};
