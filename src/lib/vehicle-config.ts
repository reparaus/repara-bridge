/**
 * Structured vehicle configuration (engine + drivetrain).
 *
 * Everything here is presentation/logic only: it decides what we already know
 * from a VIN decode and, when something is missing, which *short* fallback
 * question to ask the customer. The customer should never need automotive
 * knowledge — every fallback offers a "Not sure" answer.
 */

export type Drivetrain = "fwd" | "rwd" | "awd" | "4wd" | "unknown";
export type ConfigSource = "vin" | "customer";

export interface VehicleConfig {
  trim?: string;
  engineDisplacement?: number;
  engineCode?: string;
  cylinderCount?: number;
  fuelType?: string;
  isHybrid?: boolean;
  drivetrain: Drivetrain;
  bodyType?: string;
  engineSource?: ConfigSource;
  drivetrainSource?: ConfigSource;
}

export const EMPTY_VEHICLE_CONFIG: VehicleConfig = { drivetrain: "unknown" };

export const DRIVETRAIN_LABELS: Record<Drivetrain, string> = {
  fwd: "FWD",
  rwd: "RWD",
  awd: "AWD",
  "4wd": "4WD / 4x4",
  unknown: "Not sure",
};

/** Normalizes the many strings NHTSA returns for DriveType. */
export function normalizeDrivetrain(raw?: string | null, bodyType?: string | null): Drivetrain {
  const v = (raw ?? "").toLowerCase();
  if (!v) return "unknown";
  if (v.includes("4wd") || v.includes("4x4") || v.includes("four wheel") || v.includes("4-wheel"))
    return "4wd";
  if (v.includes("awd") || v.includes("all wheel") || v.includes("all-wheel")) return "awd";
  if (v.includes("front")) return "fwd";
  if (v.includes("rear")) return "rwd";
  // A bare "4x2" / "2WD" only tells us it is two-wheel drive. Body-on-frame
  // trucks and SUVs are rear-wheel drive; unibody cars are front-wheel drive.
  if (v.includes("4x2") || v.includes("2wd") || v.includes("two wheel")) {
    const body = (bodyType ?? "").toLowerCase();
    if (!body) return "unknown";
    // Unibody crossovers (RAV4, Highlander) are front-wheel drive in 2WD form.
    return /pickup|truck|cab|chassis/.test(body) ? "rwd" : "fwd";
  }
  return "unknown";
}

export function normalizeFuel(raw?: string | null, electrification?: string | null) {
  const fuel = (raw ?? "").trim();
  const elec = (electrification ?? "").toLowerCase();
  const isHybrid =
    elec.includes("hybrid") || elec.includes("hev") || elec.includes("phev") || /hybrid/i.test(fuel);
  const isElectric = elec.includes("bev") || /electric/i.test(fuel);
  let fuelType: string | undefined;
  if (isElectric && !isHybrid) fuelType = "electric";
  else if (/diesel/i.test(fuel)) fuelType = "diesel";
  else if (isHybrid) fuelType = "hybrid";
  else if (fuel) fuelType = "gasoline";
  return { fuelType, isHybrid: isHybrid || undefined };
}

/* ------------------------------ engine catalog ----------------------------- */

export interface EngineOption {
  id: string;
  label: string;
  displacement?: number;
  cylinders?: number;
  isHybrid?: boolean;
}

type CatalogEntry = { from?: number; to?: number; engines: EngineOption[] };

const e = (
  id: string,
  label: string,
  displacement?: number,
  cylinders?: number,
  isHybrid?: boolean,
): EngineOption => ({ id, label, displacement, cylinders, isHybrid });

/**
 * Vehicle-specific engine choices for the models Repara sees most (Toyota &
 * Lexus first). Anything not listed falls back to the generic list below.
 */
const ENGINE_CATALOG: Record<string, CatalogEntry[]> = {
  "toyota|camry": [
    {
      from: 2018,
      engines: [
        e("2.5-i4", "2.5L 4-Cylinder", 2.5, 4),
        e("3.5-v6", "3.5L V6", 3.5, 6),
        e("2.5-hybrid", "2.5L Hybrid", 2.5, 4, true),
      ],
    },
    {
      to: 2017,
      engines: [
        e("2.5-i4", "2.5L 4-Cylinder", 2.5, 4),
        e("3.5-v6", "3.5L V6", 3.5, 6),
        e("2.5-hybrid", "2.5L Hybrid", 2.5, 4, true),
      ],
    },
  ],
  "toyota|corolla": [
    {
      engines: [
        e("1.8-i4", "1.8L 4-Cylinder", 1.8, 4),
        e("2.0-i4", "2.0L 4-Cylinder", 2.0, 4),
        e("1.8-hybrid", "1.8L Hybrid", 1.8, 4, true),
      ],
    },
  ],
  "toyota|rav4": [
    {
      engines: [
        e("2.5-i4", "2.5L 4-Cylinder", 2.5, 4),
        e("2.5-hybrid", "2.5L Hybrid", 2.5, 4, true),
      ],
    },
  ],
  "toyota|highlander": [
    {
      engines: [
        e("3.5-v6", "3.5L V6", 3.5, 6),
        e("2.4-i4", "2.4L Turbo 4-Cylinder", 2.4, 4),
        e("2.5-hybrid", "2.5L Hybrid", 2.5, 4, true),
      ],
    },
  ],
  "toyota|tacoma": [
    {
      engines: [
        e("2.7-i4", "2.7L 4-Cylinder", 2.7, 4),
        e("3.5-v6", "3.5L V6", 3.5, 6),
        e("2.4-i4", "2.4L Turbo 4-Cylinder", 2.4, 4),
        e("2.4-hybrid", "2.4L i-FORCE MAX Hybrid", 2.4, 4, true),
      ],
    },
  ],
  "toyota|tundra": [
    {
      engines: [
        e("5.7-v8", "5.7L V8", 5.7, 8),
        e("4.6-v8", "4.6L V8", 4.6, 8),
        e("3.5-v6", "3.5L Twin-Turbo V6", 3.5, 6),
        e("3.5-hybrid", "3.5L i-FORCE MAX Hybrid", 3.5, 6, true),
      ],
    },
  ],
  "toyota|4runner": [{ engines: [e("4.0-v6", "4.0L V6", 4.0, 6), e("2.4-i4", "2.4L Turbo 4-Cylinder", 2.4, 4)] }],
  "toyota|sienna": [
    { engines: [e("3.5-v6", "3.5L V6", 3.5, 6), e("2.5-hybrid", "2.5L Hybrid", 2.5, 4, true)] },
  ],
  "toyota|prius": [{ engines: [e("1.8-hybrid", "1.8L Hybrid", 1.8, 4, true), e("2.0-hybrid", "2.0L Hybrid", 2.0, 4, true)] }],
  "lexus|rx": [
    {
      engines: [
        e("3.5-v6", "3.5L V6", 3.5, 6),
        e("2.4-i4", "2.4L Turbo 4-Cylinder", 2.4, 4),
        e("2.5-hybrid", "2.5L Hybrid", 2.5, 4, true),
        e("3.5-hybrid", "3.5L Hybrid", 3.5, 6, true),
      ],
    },
  ],
  "lexus|es": [
    {
      engines: [
        e("3.5-v6", "3.5L V6", 3.5, 6),
        e("2.5-i4", "2.5L 4-Cylinder", 2.5, 4),
        e("2.5-hybrid", "2.5L Hybrid", 2.5, 4, true),
      ],
    },
  ],
  "lexus|nx": [
    {
      engines: [
        e("2.0-i4", "2.0L Turbo 4-Cylinder", 2.0, 4),
        e("2.5-i4", "2.5L 4-Cylinder", 2.5, 4),
        e("2.5-hybrid", "2.5L Hybrid", 2.5, 4, true),
      ],
    },
  ],
  "lexus|gx": [{ engines: [e("4.6-v8", "4.6L V8", 4.6, 8), e("3.4-v6", "3.4L Twin-Turbo V6", 3.4, 6)] }],
  "lexus|is": [
    { engines: [e("2.0-i4", "2.0L Turbo 4-Cylinder", 2.0, 4), e("3.5-v6", "3.5L V6", 3.5, 6), e("5.0-v8", "5.0L V8", 5.0, 8)] },
  ],
};

export const GENERIC_ENGINES: EngineOption[] = [
  e("generic-4", "4-cylinder", undefined, 4),
  e("generic-6", "6-cylinder", undefined, 6),
  e("generic-8", "8-cylinder", undefined, 8),
  e("generic-hybrid", "Hybrid", undefined, undefined, true),
  e("generic-other", "Other"),
];

const NOT_SURE: EngineOption = { id: "not-sure", label: "Not sure" };

/** Model-family key, tolerant of trims in the decoded model string ("RX 350"). */
function modelKey(make: string, model: string) {
  const m = model.trim().toLowerCase();
  const base = m.split(/[\s-]/)[0] ?? m;
  return `${make.trim().toLowerCase()}|${base}`;
}

export function engineOptionsFor(
  make: string,
  model: string,
  year?: number,
): { options: EngineOption[]; specific: boolean } {
  const entries = ENGINE_CATALOG[modelKey(make, model)];
  const match = entries?.find(
    (entry) =>
      (entry.from === undefined || (year ?? 0) >= entry.from) &&
      (entry.to === undefined || (year ?? 9999) <= entry.to),
  );
  if (match) return { options: [...match.engines, NOT_SURE], specific: true };
  return { options: [...GENERIC_ENGINES, NOT_SURE], specific: false };
}

/* ---------------------------- drivetrain choices --------------------------- */

/** Models sold in both 2WD and 4WD — the ones worth asking about. */
const TRUCK_4WD = /tacoma|tundra|4runner|tacoma|sequoia|land cruiser|gx|lx|frontier|ranger|f-150|silverado|sierra|colorado|titan|ridgeline/i;
const AWD_ONLY = /highlander|rav4|sienna|venza|nx|rx|ux|tx/i;
const FWD_FAMILIES = /camry|corolla|avalon|prius|accord|civic|altima|sentra|malibu|fusion|elantra|sonata|es\b|ux\b|ct\b|matrix|yaris|c-hr|corolla cross/i;
const RWD_SEDAN = /is|gs|ls|rc|lc|supra|challenger|charger|mustang|camaro/i;

const OPT = (value: Drivetrain): { value: Drivetrain; label: string } => ({
  value,
  label: DRIVETRAIN_LABELS[value],
});

export function drivetrainOptionsFor(
  make: string,
  model: string,
  bodyType?: string,
): { options: { value: Drivetrain; label: string }[]; question: string } | null {
  const m = model.trim();
  const body = (bodyType ?? "").toLowerCase();
  const isTruck = TRUCK_4WD.test(m) || body.includes("pickup") || body.includes("truck");

  if (isTruck) {
    return {
      question: `Is your ${m || "vehicle"} 2WD or 4WD?`,
      options: [
        { value: "rwd", label: "2WD / RWD" },
        { value: "4wd", label: "4WD / 4x4" },
        OPT("unknown"),
      ],
    };
  }

  if (AWD_ONLY.test(m) || body.includes("sport utility") || body.includes("suv") || body.includes("wagon")) {
    return {
      question: `Is your ${m || "vehicle"} front-wheel drive or all-wheel drive?`,
      options: [OPT("fwd"), OPT("awd"), OPT("unknown")],
    };
  }

  if (RWD_SEDAN.test(m)) {
    return {
      question: `Is your ${m || "vehicle"} rear-wheel drive or all-wheel drive?`,
      options: [OPT("rwd"), OPT("awd"), OPT("unknown")],
    };
  }

  if (body.includes("sedan") || body.includes("hatchback") || body.includes("coupe") || body.includes("minivan")) {
    return {
      question: `Is your ${m || "vehicle"} front-wheel drive or all-wheel drive?`,
      options: [OPT("fwd"), OPT("awd"), OPT("unknown")],
    };
  }

  // Known front-drive car families, even when we have no body class.
  if (FWD_FAMILIES.test(m)) {
    return {
      question: `Is your ${m || "vehicle"} front-wheel drive or all-wheel drive?`,
      options: [OPT("fwd"), OPT("awd"), OPT("unknown")],
    };
  }

  // Unknown body style: offer the full set rather than guessing wrong.
  return {
    question: "Which drivetrain does your vehicle have?",
    options: [OPT("fwd"), OPT("rwd"), OPT("awd"), OPT("4wd"), OPT("unknown")],
  };
}

/* ------------------------------- completeness ------------------------------ */

/** True when the VIN gave us enough engine detail to skip the question. */
export function hasEngineInfo(config: VehicleConfig) {
  return Boolean(config.engineDisplacement || config.cylinderCount);
}

export function hasDrivetrainInfo(config: VehicleConfig) {
  return config.drivetrain !== "unknown";
}

/** Short human summary used on the confirmation card, e.g. "2.5L 4-Cyl Hybrid • AWD". */
export function configSummary(config: VehicleConfig): string {
  const parts: string[] = [];
  const engine = [
    config.engineDisplacement ? `${config.engineDisplacement.toFixed(1)}L` : "",
    config.cylinderCount ? `${config.cylinderCount}-Cyl` : "",
    config.isHybrid ? "Hybrid" : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (engine) parts.push(engine);
  if (config.drivetrain !== "unknown") parts.push(DRIVETRAIN_LABELS[config.drivetrain]);
  if (config.fuelType === "diesel") parts.push("Diesel");
  if (config.fuelType === "electric") parts.push("Electric");
  return parts.join(" • ");
}
