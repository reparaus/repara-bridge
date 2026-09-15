/**
 * Job Concerns (SERVER ONLY).
 *
 * A job is not "a request with a status" — it is one or more concerns, each of
 * which travels through the same chain: what the customer reported → what the
 * technician observed → the confirmed cause → the repair → verification.
 *
 * Concerns are DERIVED from information the customer already gave (selected
 * services, their own description, intake follow-up answers) so the technician
 * never retypes intake. The customer's original wording is copied into
 * `customer_report` and is never overwritten by technician or AI text.
 */

import { isComplaintFamily } from "@/lib/ai/playbooks";

type Client = { from: (table: string) => any };
type Row = Record<string, any>;

/** Human labels for the intake complaint families. */
const FAMILY_LABELS: Record<string, string> = {
  noise: "Noise concern",
  vibration: "Vibration concern",
  fluid_leak: "Fluid leak",
  warning_light: "Warning light",
  starting: "Starting concern",
  engine_performance: "Engine performance",
  overheating: "Overheating / cooling",
  braking: "Braking concern",
  steering: "Steering concern",
  suspension: "Suspension / ride",
  transmission: "Transmission / shifting",
  hvac: "A/C & heating",
  electrical: "Electrical concern",
  battery_charging: "Battery / charging",
  maintenance: "Maintenance service",
  fluid_service: "Fluid service",
  tire_wheel: "Tire / wheel concern",
  drivability: "Drivability concern",
  fuel_economy: "Fuel economy",
  odor: "Smell / odor",
  interior_feature: "Interior feature",
  exterior_feature: "Exterior feature",
  intermittent: "Intermittent concern",
  other: "Customer concern",
  general: "Customer concern",
};

/** Concerns that are an inspection request rather than a reported symptom. */
const INSPECTION_FAMILIES = new Set(["maintenance", "fluid_service"]);

export type DerivedConcern = {
  title: string;
  category: string;
  origin: "derived" | "service" | "customer_text" | "technician";
  customerReport: string;
  intakeDetails: { question: string; answer: string }[];
  inspectionOnly: boolean;
};

export type ConcernRow = {
  id: string;
  title: string;
  category: string;
  origin: string;
  customerReport: string | null;
  intakeDetails: { question: string; answer: string }[];
  concernStatus: string;
  testsPerformed: string | null;
  technicianObserved: string | null;
  confirmedCause: string | null;
  shorthand: string | null;
  story: string | null;
  storyApprovedAt: string | null;
  repairPerformed: string | null;
  verification: string | null;
  outcome: string | null;
  sortOrder: number;
  /**
   * Technician-facing English wording. The customer's own words always stay in
   * `title` / `customerReport` / `intakeDetails`; these fields only ever hold a
   * normalized translation of them (empty when intake was already English).
   */
  normalizedTitle: string | null;
  normalizedCustomerReport: string | null;
  normalizedIntakeDetails: { question: string; answer: string }[];
  sourceLanguage: string | null;
  normalizedAt: string | null;
  /** Set when this concern was merged into another as a duplicate. */
  mergedIntoId: string | null;
  /** Original wording of concerns merged into this one — kept, never deleted. */
  mergedReports: { title?: string; original?: string | null; english?: string | null; reason?: string }[];
};

const text = (value: unknown, max = 2000) => String(value ?? "").trim().slice(0, max);

/**
 * Builds the concern list from the customer's own submission. Deterministic —
 * no AI call, so opening a job never costs anything.
 */
export function deriveConcerns(request: Row): DerivedConcern[] {
  const description = text(request['details']?.description ?? request['notes'] ?? "");
  const followups: Row[] = Array.isArray(request['intake_followups'])
    ? (request['intake_followups'] as Row[])
    : [];

  // Group intake answers by the complaint family the intake AI assigned.
  const groups = new Map<string, { question: string; answer: string }[]>();
  for (const f of followups) {
    const category = text(f['category'], 60);
    if (category === "intake_summary") continue;
    const family = text(f['concern'], 60) || (isComplaintFamily(category) ? category : "other");
    const answer = [text(f['answer'], 400), text(f['otherText'], 300)].filter(Boolean).join(" — ");
    const entry = { question: text(f['question'], 300), answer: f['skipped'] ? "Not answered" : answer };
    if (!entry.question) continue;
    const bucket = groups.get(family);
    if (bucket) bucket.push(entry);
    else groups.set(family, [entry]);
  }

  const concerns: DerivedConcern[] = [];
  for (const [family, items] of groups) {
    concerns.push({
      title: FAMILY_LABELS[family] ?? FAMILY_LABELS['other']!,
      category: family,
      origin: "derived",
      // The customer's own words stay attached to every concern they describe.
      customerReport: description,
      intakeDetails: items.slice(0, 20),
      inspectionOnly: INSPECTION_FAMILIES.has(family),
    });
  }

  // Selected services that produced no follow-up group are still work to do.
  const services: Row[] = Array.isArray(request['services']) ? (request['services'] as Row[]) : [];
  for (const service of services) {
    const label = text(service['label'] ?? service['key'], 120);
    if (!label) continue;
    const answers = (service['answers'] ?? {}) as Record<string, unknown>;
    const details = Object.entries(answers).map(([question, value]) => ({
      question: text(question, 200),
      answer: (Array.isArray(value) ? value : [value]).map((v) => text(v, 200)).filter(Boolean).join(", "),
    }));
    const key = text(service['key'], 60);
    const alreadyCovered = concerns.some(
      (c) => c.title.toLowerCase() === label.toLowerCase() || c.category === key,
    );
    if (alreadyCovered) continue;
    concerns.push({
      title: label,
      category: key || "general",
      origin: "service",
      customerReport: description,
      intakeDetails: details.filter((d) => d.answer).slice(0, 20),
      // A requested service is work, not a symptom to reproduce.
      inspectionOnly: true,
    });
  }

  if (!concerns.length) {
    concerns.push({
      title: description ? description.slice(0, 70) : "Customer concern",
      category: "general",
      origin: "customer_text",
      customerReport: description,
      intakeDetails: [],
      inspectionOnly: false,
    });
  }

  return concerns.slice(0, 12);
}

function mapConcern(row: Row): ConcernRow {
  return {
    id: String(row['id']),
    title: String(row['title'] ?? ""),
    category: String(row['category'] ?? "general"),
    origin: String(row['origin'] ?? "derived"),
    customerReport: row['customer_report'] ? String(row['customer_report']) : null,
    intakeDetails: Array.isArray(row['intake_details'])
      ? (row['intake_details'] as { question: string; answer: string }[])
      : [],
    concernStatus: String(row['concern_status'] ?? "not_inspected"),
    testsPerformed: row['tests_performed'] ? String(row['tests_performed']) : null,
    technicianObserved: row['technician_observed'] ? String(row['technician_observed']) : null,
    confirmedCause: row['confirmed_cause'] ? String(row['confirmed_cause']) : null,
    shorthand: row['shorthand'] ? String(row['shorthand']) : null,
    story: row['story'] ? String(row['story']) : null,
    storyApprovedAt: row['story_approved_at'] ? String(row['story_approved_at']) : null,
    repairPerformed: row['repair_performed'] ? String(row['repair_performed']) : null,
    verification: row['verification'] ? String(row['verification']) : null,
    outcome: row['outcome'] ? String(row['outcome']) : null,
    sortOrder: Number(row['sort_order'] ?? 0),
    normalizedTitle: row['normalized_title'] ? String(row['normalized_title']) : null,
    normalizedCustomerReport: row['normalized_customer_report']
      ? String(row['normalized_customer_report'])
      : null,
    normalizedIntakeDetails: Array.isArray(row['normalized_intake_details'])
      ? (row['normalized_intake_details'] as { question: string; answer: string }[])
      : [],
    sourceLanguage: row['source_language'] ? String(row['source_language']) : null,
    normalizedAt: row['normalized_at'] ? String(row['normalized_at']) : null,
    mergedIntoId: row['merged_into_id'] ? String(row['merged_into_id']) : null,
    mergedReports: Array.isArray(row['merged_reports']) ? (row['merged_reports'] as any[]) : [],
  };
}

const CONCERN_COLUMNS =
  "id, title, category, origin, customer_report, intake_details, concern_status, tests_performed, technician_observed, confirmed_cause, shorthand, story, story_approved_at, repair_performed, verification, outcome, sort_order, created_at";

/** Normalization/dedup columns from 0012; selected separately so a database
 *  that has not run 0012 yet still returns its concerns. */
const CONCERN_COLUMNS_V2 = `${CONCERN_COLUMNS}, normalized_title, normalized_customer_report, normalized_intake_details, source_language, normalized_at, merged_into_id, merged_reports`;

/** Reads the concerns for one job. Returns [] if migration 0011 is not applied. */
export async function listConcerns(client: Client, requestId: string): Promise<ConcernRow[]> {
  const read = async (columns: string): Promise<ConcernRow[] | null> => {
    try {
      const { data, error } = await client
        .from("job_concerns")
        .select(columns)
        .eq("service_request_id", requestId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) return null;
      return ((data ?? []) as Row[]).map(mapConcern);
    } catch {
      return null;
    }
  };
  return (await read(CONCERN_COLUMNS_V2)) ?? (await read(CONCERN_COLUMNS)) ?? [];
}

/**
 * Returns the job's concerns, deriving and storing them the first time the job
 * is opened. Idempotent: existing concerns are never rebuilt or overwritten, so
 * technician work is safe.
 */
export async function ensureConcerns(
  client: Client,
  requestId: string,
  userId: string,
): Promise<ConcernRow[]> {
  const existing = await listConcerns(client, requestId);
  if (existing.length) return existing;

  let request: Row | null = null;
  try {
    const { data } = await client
      .from("service_requests")
      .select("id, notes, details, services, service_category, intake_followups")
      .eq("id", requestId)
      .maybeSingle();
    request = (data ?? null) as Row | null;
  } catch {
    return [];
  }
  if (!request) return [];

  const derived = deriveConcerns(request);
  try {
    await client.from("job_concerns").insert(
      derived.map((c, index) => ({
        service_request_id: requestId,
        title: c.title,
        category: c.category,
        origin: c.origin,
        customer_report: c.customerReport || null,
        intake_details: c.intakeDetails,
        ...(c.inspectionOnly ? { outcome: "inspection_only" } : {}),
        sort_order: index,
        created_by: userId,
      })),
    );
  } catch {
    return [];
  }
  return listConcerns(client, requestId);
}

/** Compact concern text for AI prompts, with provenance labels intact. */
export function renderConcern(concern: ConcernRow): string {
  const lines = [`Concern: ${concern.title}`];
  if (concern.customerReport) lines.push(`Customer reported (unverified): ${concern.customerReport}`);
  if (concern.intakeDetails.length)
    lines.push(
      `Customer answers: ${concern.intakeDetails
        .map((d) => `${d.question} → ${d.answer}`)
        .join(" | ")}`,
    );
  lines.push(`Concern status: ${concern.concernStatus.replace(/_/g, " ")}`);
  if (concern.testsPerformed) lines.push(`Tests performed: ${concern.testsPerformed}`);
  if (concern.technicianObserved) lines.push(`Technician observed: ${concern.technicianObserved}`);
  if (concern.confirmedCause) lines.push(`Confirmed cause: ${concern.confirmedCause}`);
  if (concern.repairPerformed) lines.push(`Repair performed: ${concern.repairPerformed}`);
  if (concern.verification) lines.push(`Verification: ${concern.verification}`);
  return lines.join("\n");
}
