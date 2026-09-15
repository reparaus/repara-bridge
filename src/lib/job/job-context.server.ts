/**
 * Repara AI — job context assembly (SERVER ONLY).
 *
 * One place that gathers everything Repara AI may know about a job, so no UI
 * component ever builds a prompt by hand. New context sources (OEM data, TSBs,
 * procedures, historical outcomes, shop knowledge) plug in as additional
 * `sections` without touching the Job Workspace or the copilot.
 *
 * Only the subset a given action needs is rendered, and customer contact data
 * is never included — the AI does not need it to reason about a repair.
 */

export type JobContextScope =
  | "vehicle"
  | "concern"
  | "intake"
  | "stage"
  | "communications"
  | "diagnostics"
  | "findings"
  | "recommendations"
  | "outcome"
  | "knowledge";

export const DIAGNOSTIC_SCOPE: JobContextScope[] = [
  "vehicle",
  "concern",
  "intake",
  "stage",
  "diagnostics",
  "findings",
  "knowledge",
];

export const FULL_SCOPE: JobContextScope[] = [
  "vehicle",
  "concern",
  "intake",
  "stage",
  "communications",
  "diagnostics",
  "findings",
  "recommendations",
  "outcome",
  "knowledge",
];

export type JobContext = {
  requestId: string;
  requestNumber: string;
  stage: string;
  sections: { scope: JobContextScope; label: string; body: string }[];
  /** Quick facts the UI can show so a technician sees what the AI received. */
  vehicleLabel: string;
  mileage: string;
};

type Row = Record<string, any>;

type QueryClient = {
  from: (table: string) => any;
};

function text(value: unknown, max = 1200): string {
  return String(value ?? "").trim().slice(0, max);
}

function vehicleLine(v: Row): string {
  return (
    [v['year'], v['make'], v['model'], v['trim']].filter(Boolean).join(" ") || "not provided"
  );
}

function engineLine(v: Row): string {
  return (
    [
      v['engine_displacement'] ? `${Number(v['engine_displacement']).toFixed(1)}L` : null,
      v['cylinder_count'] ? `${v['cylinder_count']}-cyl` : null,
      v['fuel_type'],
      v['is_hybrid'] ? "hybrid" : null,
      v['engine_code'] ? `engine code ${v['engine_code']}` : null,
      v['drivetrain'] && v['drivetrain'] !== "unknown" ? String(v['drivetrain']).toUpperCase() : null,
    ]
      .filter(Boolean)
      .join(" · ") || "not provided"
  );
}

/**
 * Reads every job source once and returns the rendered sections.
 *
 * The caller passes its own Supabase client, so this works both from an
 * admin-authenticated server function (RLS as the admin) and from a privileged
 * server path. Missing job tables (migration 0010 not applied yet) degrade to
 * empty sections instead of failing the request.
 */
export async function assembleJobContext(
  client: QueryClient,
  requestId: string,
  scopes: JobContextScope[] = DIAGNOSTIC_SCOPE,
): Promise<JobContext> {
  const want = new Set(scopes);

  const { data: request } = await client
    .from("service_requests")
    .select("*, vehicles(*)")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) throw new Error("This job could not be found.");
  const r = request as Row;
  const v = (r['vehicles'] ?? {}) as Row;

  const safe = async <T>(run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch {
      return fallback;
    }
  };

  const sections: JobContext["sections"] = [];
  const push = (scope: JobContextScope, label: string, body: string) => {
    if (want.has(scope) && body.trim()) sections.push({ scope, label, body: body.trim() });
  };

  /* ------------------------------------------------------------- vehicle */
  push(
    "vehicle",
    "Vehicle",
    [
      `Vehicle: ${vehicleLine(v)}`,
      `Engine/drivetrain: ${engineLine(v)}`,
      `VIN: ${v['vin'] ? String(v['vin']) : "not provided"}`,
      `Mileage: ${
        r['mileage'] || v['mileage']
          ? `${Number(r['mileage'] || v['mileage']).toLocaleString("en-US")} mi`
          : "not provided"
      }`,
    ].join("\n"),
  );

  /* ------------------------------------------------------------- concern */
  const services = Array.isArray(r['services'])
    ? (r['services'] as Row[]).map((s) => text(s?.['label'] || s?.['key'], 80)).filter(Boolean)
    : [];
  push(
    "concern",
    "Customer concern",
    [
      `Requested services: ${services.length ? services.join(", ") : text(r['service_category'], 80) || "not provided"}`,
      `Customer's own words: ${text(r['details']?.description ?? r['notes'], 1500) || "none provided"}`,
    ].join("\n"),
  );

  /* -------------------------------------------------------------- intake */
  const followups = Array.isArray(r['intake_followups']) ? (r['intake_followups'] as Row[]) : [];
  const intakeSummary =
    followups.find((f) => f['category'] === "intake_summary")?.['answer'] ?? r['ai_summary'] ?? "";
  const answers = followups
    .filter((f) => f['category'] !== "intake_summary" && !f['skipped'])
    .slice(0, 30)
    .map(
      (f) =>
        `- ${text(f['question'], 200)} → ${[text(f['answer'], 300), text(f['otherText'], 300)]
          .filter(Boolean)
          .join(" — ")}`,
    );
  push(
    "intake",
    "Pre-arrival intake (customer-reported, not verified)",
    [text(intakeSummary, 1200), ...answers].filter(Boolean).join("\n"),
  );

  /* --------------------------------------------------------------- stage */
  push("stage", "Current job stage", String(r['status'] ?? "new"));

  /* ------------------------------------------------------ communications */
  if (want.has("communications")) {
    const comms = await safe(
      async () =>
        (
          await client
            .from("request_communications")
            .select("direction, message, category, created_at")
            .eq("service_request_id", requestId)
            .order("created_at", { ascending: true })
            .limit(30)
        ).data as Row[] | null,
      null,
    );
    push(
      "communications",
      "Customer conversation (relevant to diagnosis)",
      (comms ?? [])
        .filter((c) => c['category'] !== "confirmation")
        .map(
          (c) =>
            `- ${c['direction'] === "inbound" ? "Customer" : "Shop"}: ${text(c['message'], 400)}`,
        )
        .join("\n"),
    );
  }

  /* --------------------------------------------------------- diagnostics */
  if (want.has("diagnostics")) {
    const rows = await safe(
      async () =>
        (
          await client
            .from("job_diagnostics")
            .select("entry_type, code, title, detail, result, created_at")
            .eq("service_request_id", requestId)
            .order("created_at", { ascending: true })
            .limit(60)
        ).data as Row[] | null,
      null,
    );
    const dtcs = (rows ?? []).filter((d) => d['entry_type'] === "dtc");
    const rest = (rows ?? []).filter((d) => d['entry_type'] !== "dtc");
    push(
      "diagnostics",
      "Diagnostic activity recorded by the technician",
      [
        dtcs.length
          ? `DTCs: ${dtcs.map((d) => `${text(d['code'], 20)} (${text(d['title'], 120)})`).join(", ")}`
          : "",
        ...rest.map(
          (d) =>
            `- [${d['entry_type']}] ${text(d['title'], 200)}${
              d['result'] ? ` → result: ${text(d['result'], 300)}` : ""
            }${d['detail'] ? ` — ${text(d['detail'], 400)}` : ""}`,
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  /* ------------------------------------------------------------ findings */
  if (want.has("findings")) {
    const rows = await safe(
      async () =>
        (
          await client
            .from("job_findings")
            .select("title, detail, measurement, severity, source, status")
            .eq("service_request_id", requestId)
            .order("created_at", { ascending: true })
            .limit(40)
        ).data as Row[] | null,
      null,
    );
    push(
      "findings",
      "Confirmed technician findings",
      (rows ?? [])
        .filter((f) => f['status'] !== "dismissed")
        .map(
          (f) =>
            `- (${f['severity']}) ${text(f['title'], 200)}${
              f['measurement'] ? ` [${text(f['measurement'], 80)}]` : ""
            }${f['detail'] ? ` — ${text(f['detail'], 400)}` : ""}`,
        )
        .join("\n"),
    );
  }

  /* ----------------------------------------------------- recommendations */
  if (want.has("recommendations")) {
    const rows = await safe(
      async () =>
        (
          await client
            .from("job_recommendations")
            .select("title, customer_description, internal_notes, priority, status")
            .eq("service_request_id", requestId)
            .order("created_at", { ascending: true })
            .limit(40)
        ).data as Row[] | null,
      null,
    );
    push(
      "recommendations",
      "Recommendations",
      (rows ?? [])
        .map(
          (x) =>
            `- (${x['priority']}, ${x['status']}) ${text(x['title'], 200)}${
              x['internal_notes'] ? ` — internal: ${text(x['internal_notes'], 300)}` : ""
            }`,
        )
        .join("\n"),
    );
  }

  /* ------------------------------------------------------------- outcome */
  if (want.has("outcome")) {
    const row = await safe(
      async () =>
        (
          await client
            .from("job_outcomes")
            .select("*")
            .eq("service_request_id", requestId)
            .maybeSingle()
        ).data as Row | null,
      null,
    );
    if (row)
      push(
        "outcome",
        "Repair outcome so far",
        [
          row['confirmed_cause'] ? `Confirmed cause: ${text(row['confirmed_cause'], 400)}` : "",
          row['repair_performed'] ? `Repair performed: ${text(row['repair_performed'], 400)}` : "",
          row['resolved'] === null || row['resolved'] === undefined
            ? ""
            : `Concern resolved: ${row['resolved'] ? "yes" : "no"}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
  }

  /* ----------------------------------------------------------- knowledge */
  // Only knowledge already matched to THIS job is included, and only titles and
  // short summaries — the AI context stays small, and every line keeps its
  // source so the model can cite instead of inventing.
  if (want.has("knowledge")) {
    const body = await safe(async () => {
      const { listJobKnowledge, renderKnowledgeForAi } = await import(
        "@/lib/knowledge/knowledge.server"
      );
      return renderKnowledgeForAi(await listJobKnowledge(client, requestId));
    }, "");
    if (body)
      push(
        "knowledge",
        "Source-backed vehicle knowledge available to Repara",
        `${body}\n\nOnly the information above is source-backed. If a repair procedure, torque specification, ` +
          "fluid capacity, wiring detail, bulletin number or recall status is not listed here, say it is not " +
          "available from current Repara sources — never invent it. Applicability shown is by vehicle only and " +
          "does not establish that a recall remains unrepaired on this VIN.",
      );
  }

  return {
    requestId,
    requestNumber: String(r['request_number'] ?? ""),
    stage: String(r['status'] ?? "new"),
    sections,
    vehicleLabel: vehicleLine(v),
    mileage:
      r['mileage'] || v['mileage']
        ? `${Number(r['mileage'] || v['mileage']).toLocaleString("en-US")} mi`
        : "",
  };
}

/** Flattens the assembled context into prompt text. */
export function renderJobContext(context: JobContext): string {
  return [
    `Job #${context.requestNumber} — current stage: ${context.stage}`,
    ...context.sections.map((s) => `## ${s.label}\n${s.body}`),
  ].join("\n\n");
}

/**
 * Cheap stable digest of the rendered context. Used for cost control: an action
 * whose context has not changed can reuse the stored answer instead of paying
 * for another model call.
 */
export function contextDigest(rendered: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < rendered.length; i++) {
    hash ^= rendered.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + ":" + rendered.length.toString(36);
}
