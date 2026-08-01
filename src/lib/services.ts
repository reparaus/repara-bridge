/**
 * Service catalog + conditional question configuration.
 *
 * Repara V1 is MOBILE ONLY: this catalog intentionally covers maintenance and
 * light repair that can be performed safely without a vehicle lift.
 *
 * This is product configuration, not content: keep it structured so every
 * answer lands in a queryable field. When pricing / labor times move into the
 * database, replace this module with a loader that reads them.
 */

export type ServiceKey =
  | "oil_filter"
  | "brakes"
  | "filters"
  | "fluid_service"
  | "maintenance"
  | "battery"
  | "diagnostics"
  | "other";

export interface ServiceDefinition {
  key: ServiceKey;
  label: string;
  blurb: string;
  /** Optional "Starting at" price, sourced from the database later. */
  startingAt?: number | null;
}

export const SERVICES: ServiceDefinition[] = [
  { key: "oil_filter", label: "Oil & Filter", blurb: "Oil change and oil filter replacement" },
  { key: "brakes", label: "Brakes", blurb: "Pads, rotors, brake fluid, brake concerns" },
  { key: "filters", label: "Filters", blurb: "Engine air and cabin air filters" },
  { key: "fluid_service", label: "Fluid Services", blurb: "Brake, coolant, transmission, differential" },
  { key: "maintenance", label: "Maintenance", blurb: "Scheduled service, spark plugs, wipers" },
  { key: "battery", label: "Battery", blurb: "Replacement and starting concerns" },
  { key: "diagnostics", label: "Diagnostics", blurb: "Warning lights, electrical, drivability" },
  { key: "other", label: "Other Light Repair", blurb: "Smaller repairs not listed here" },
];

/** Landing-page cards (subset, in marketing order). */
export const LANDING_SERVICE_KEYS: ServiceKey[] = [
  "oil_filter",
  "brakes",
  "filters",
  "fluid_service",
  "maintenance",
  "battery",
  "diagnostics",
];

/** Labels for categories captured before the V1 mobile-only catalog. */
const LEGACY_LABELS: Record<string, string> = {
  oil_change: "Oil Change",
  suspension: "Suspension",
};

export function serviceLabel(key: string): string {
  return SERVICES.find((s) => s.key === key)?.label ?? LEGACY_LABELS[key] ?? key;
}

export function isServiceKey(key: string): key is ServiceKey {
  return SERVICES.some((s) => s.key === key);
}

/** Shown in the flow so scope is clear without sounding limited. */
export const MOBILE_SCOPE_NOTE =
  "Repara currently specializes in mobile maintenance and light repair services that can be performed safely without a vehicle lift.";

export const INSPECTION_TITLE = "Complimentary Service Inspection Included";
export const INSPECTION_BODY =
  "Every booked service includes a basic visual inspection of key vehicle items while we're there. Warning lights and drivability concerns are handled under Diagnostics.";

export interface Choice {
  value: string;
  label: string;
}

/* --------------------------- conditional questions -------------------------- */

export type QuestionKind = "single" | "multi" | "text" | "textarea";

export interface ServiceQuestion {
  /** Stable id — this becomes the answer key stored with the request. */
  id: string;
  label: string;
  kind: QuestionKind;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  options?: Choice[];
  columns?: 1 | 2;
}

/**
 * Only ask what a customer can reasonably answer. "Not sure" is always an
 * option where a technical answer might be expected.
 */
export const SERVICE_QUESTIONS: Record<ServiceKey, ServiceQuestion[]> = {
  // Oil specification is determined from the vehicle, never asked.
  oil_filter: [],
  brakes: [
    {
      id: "brake_area",
      label: "Which area?",
      kind: "single",
      options: [
        { value: "front", label: "Front" },
        { value: "rear", label: "Rear" },
        { value: "both", label: "Front & rear" },
        { value: "not_sure", label: "Not sure" },
      ],
    },
    {
      id: "brake_concern",
      label: "What's going on?",
      kind: "multi",
      hint: "Optional — select all that apply.",
      options: [
        { value: "pads", label: "Pads" },
        { value: "pads_rotors", label: "Pads & rotors" },
        { value: "noise_vibration", label: "Noise / vibration" },
        { value: "warning", label: "Brake warning" },
        { value: "not_sure", label: "Not sure" },
      ],
    },
  ],
  filters: [
    {
      id: "filter_type",
      label: "Which filter?",
      kind: "single",
      options: [
        { value: "engine_air", label: "Engine air filter" },
        { value: "cabin_air", label: "Cabin air filter" },
        { value: "both", label: "Both" },
        { value: "not_sure", label: "Not sure" },
      ],
    },
  ],
  fluid_service: [
    {
      id: "fluid_type",
      label: "Which fluids?",
      kind: "multi",
      hint: "Select all that apply.",
      options: [
        { value: "brake", label: "Brake fluid" },
        { value: "coolant", label: "Coolant" },
        { value: "transmission", label: "Transmission" },
        { value: "differential", label: "Differential" },
        { value: "other", label: "Other" },
        { value: "not_sure", label: "Not sure" },
      ],
    },
  ],
  maintenance: [
    {
      id: "maintenance_type",
      label: "What do you need?",
      kind: "multi",
      hint: "Select all that apply.",
      options: [
        { value: "spark_plugs", label: "Spark plugs" },
        { value: "scheduled", label: "Scheduled / mileage service" },
        { value: "wipers", label: "Wipers" },
        { value: "other", label: "Other maintenance" },
        { value: "not_sure", label: "Not sure what I need" },
      ],
    },
  ],
  battery: [
    {
      id: "battery_concern",
      label: "What are you experiencing?",
      kind: "multi",
      hint: "Select all that apply.",
      options: [
        { value: "replacement", label: "Battery replacement" },
        { value: "no_start", label: "No start" },
        { value: "slow_crank", label: "Slow crank" },
        { value: "not_sure", label: "Not sure" },
      ],
    },
  ],
  diagnostics: [
    {
      id: "concern",
      label: "Describe the concern",
      kind: "textarea",
      required: true,
      placeholder: "Check engine light, noise, electrical issue, vehicle won't start…",
    },
  ],
  other: [
    {
      id: "request",
      label: "What does your vehicle need?",
      kind: "textarea",
      required: true,
      placeholder: "Tell us what you'd like taken care of.",
    },
  ],
};

/** Contextual photo guidance on the Details step (most services need none). */
export const PHOTO_PROMPTS: Partial<Record<ServiceKey, string>> = {
  diagnostics: "Add a photo of warning lights or anything related to the concern.",
  other: "Add photos if there's something you'd like us to see.",
  brakes: "Photos of the wheels, brakes or any warning light can help.",
  battery: "A photo of the battery or warning light can help.",
};

export const CONTACT_METHODS: Choice[] = [
  { value: "text", label: "Text" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
];

export const REQUEST_STATUSES = [
  "new",
  "contacted",
  "reviewing",
  "quoted",
  "accepted",
  "declined",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;

/** Statuses Repara moves a request through in the admin dashboard. */
export const WORKFLOW_STATUSES = [
  "new",
  "contacted",
  "scheduled",
  "in_progress",
  "completed",
  "declined",
  "cancelled",
] as const;


export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Human-readable answer summary, used in confirmation + admin views. */
export function answerLabel(serviceKey: string, questionId: string, value: string): string {
  const questions = SERVICE_QUESTIONS[serviceKey as ServiceKey] ?? [];
  const q = questions.find((x) => x.id === questionId);
  return q?.options?.find((o) => o.value === value)?.label ?? value;
}
