/**
 * Job Workspace server functions.
 *
 * Every function is a privileged admin/technician endpoint, so each one
 * re-verifies the caller (approved admin + TOTP aal2 session) exactly like the
 * existing Repara AI functions. RLS on the job tables is the second boundary.
 *
 * Job actions (findings, diagnostics, recommendations, copilot, closeout) are
 * kept separate from business/admin actions on purpose, so a technician-only
 * role can be granted these later without rebuilding the workspace.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idSchema = z.object({ id: z.string().uuid() });
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

async function assertVerifiedAdmin(context: { supabase: unknown; userId: string; claims: unknown }) {
  const claims = context.claims as { aal?: string } | null;
  if (claims?.aal !== "aal2") throw new Error("Two-factor verification is required.");
  const client = context.supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { role?: string } | null }> };
      };
    };
  };
  const { data } = await client
    .from("admin_users")
    .select("role")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (data?.role !== "admin") throw new Error("Admin access is required.");
}

type Client = { from: (t: string) => any };

/** Appends one auditable job-timeline event. Never fails the caller. */
async function logActivity(
  client: Client,
  requestId: string,
  eventType: string,
  summary: string,
  actor: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await client.from("job_activity").insert({
      service_request_id: requestId,
      event_type: eventType,
      summary,
      metadata,
      actor,
    });
  } catch {
    /* migration 0010 not applied yet */
  }
}

type Row = Record<string, any>;

async function safeSelect(run: () => Promise<{ data: unknown }>): Promise<Row[]> {
  try {
    const { data } = await run();
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

/* ------------------------------------------------------------------ read */

export type JobDiagnostic = {
  id: string;
  entryType: string;
  code: string | null;
  title: string;
  detail: string | null;
  result: string | null;
  createdAt: string;
};

/** Type-only re-export: the server module itself never reaches the browser. */
export type { ConcernRow as JobConcern } from "@/lib/job/concerns.server";

export type JobFinding = {
  id: string;
  concernId: string | null;
  title: string;
  detail: string | null;
  measurement: string | null;
  evidence: string | null;
  confidence: string;
  severity: string;
  /** Inspection sheet condition — independent of severity. */
  condition: string;
  system: string | null;
  safetyConcern: boolean;
  source: string;
  status: string;
  aiDrafted: boolean;
  approvedAt: string | null;
  createdAt: string;
};

export type JobRecommendation = {
  id: string;
  findingId: string | null;
  concernId: string | null;
  title: string;
  customerDescription: string | null;
  internalNotes: string | null;
  priority: string;
  status: string;
  performedStatus: string;
  aiDrafted: boolean;
  approvedAt: string | null;
  createdAt: string;
};

/** Everything the Job Workspace needs beyond the existing request detail. */
export const getJobWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;

    const diagnostics: JobDiagnostic[] = (
      await safeSelect(() =>
        client
          .from("job_diagnostics")
          .select("id, entry_type, code, title, detail, result, created_at")
          .eq("service_request_id", data.id)
          .order("created_at", { ascending: false }),
      )
    ).map((d) => ({
      id: String(d['id']),
      entryType: String(d['entry_type']),
      code: s(d['code']),
      title: String(d['title'] ?? ""),
      detail: s(d['detail']),
      result: s(d['result']),
      createdAt: String(d['created_at']),
    }));

    // Newer columns first, legacy column list as a fallback, so a database that
    // has not run 0011 yet still shows its findings instead of an empty tab.
    const readTable = async (table: string, columns: string, legacy: string) => {
      const run = (cols: string) =>
        client
          .from(table)
          .select(cols)
          .eq("service_request_id", data.id)
          .order("created_at", { ascending: false });
      let rows = await safeSelect(() => run(columns));
      if (!rows.length) rows = await safeSelect(() => run(legacy));
      return rows;
    };

    const findings: JobFinding[] = (
      await readTable(
        "job_findings",
        "id, concern_id, title, detail, measurement, evidence, confidence, severity, condition, system, safety_concern, source, status, ai_drafted, approved_at, created_at",
        "id, title, detail, measurement, severity, source, status, created_at",
      )
    ).map((f) => ({
      id: String(f['id']),
      concernId: s(f['concern_id']),
      title: String(f['title'] ?? ""),
      detail: s(f['detail']),
      measurement: s(f['measurement']),
      evidence: s(f['evidence']),
      confidence: String(f['confidence'] ?? "confirmed"),
      severity: String(f['severity'] ?? "recommended"),
      condition: String(
        f['condition'] ??
          (f['severity'] === "monitor"
            ? "monitor"
            : f['severity'] === "informational"
              ? "good"
              : "needs_attention"),
      ),
      system: s(f['system']),
      safetyConcern: Boolean(f['safety_concern']),
      source: String(f['source'] ?? "technician"),
      status: String(f['status'] ?? "open"),
      aiDrafted: Boolean(f['ai_drafted']),
      approvedAt: s(f['approved_at']),
      createdAt: String(f['created_at']),
    }));

    const recommendations: JobRecommendation[] = (
      await readTable(
        "job_recommendations",
        "id, finding_id, concern_id, title, customer_description, internal_notes, priority, status, performed_status, ai_drafted, approved_at, created_at",
        "id, finding_id, title, customer_description, internal_notes, priority, status, ai_drafted, approved_at, created_at",
      )
    ).map((x) => ({
      id: String(x['id']),
      findingId: s(x['finding_id']),
      concernId: s(x['concern_id']),
      title: String(x['title'] ?? ""),
      customerDescription: s(x['customer_description']),
      internalNotes: s(x['internal_notes']),
      priority: String(x['priority'] ?? "recommended"),
      status: String(x['status'] ?? "draft"),
      performedStatus: String(x['performed_status'] ?? "pending"),
      aiDrafted: Boolean(x['ai_drafted']),
      approvedAt: s(x['approved_at']),
      createdAt: String(x['created_at']),
    }));

    const activity = (
      await safeSelect(() =>
        client
          .from("job_activity")
          .select("id, event_type, summary, created_at")
          .eq("service_request_id", data.id)
          .order("created_at", { ascending: false })
          .limit(80),
      )
    ).map((a) => ({
      id: String(a['id']),
      eventType: String(a['event_type'] ?? ""),
      summary: String(a['summary'] ?? ""),
      createdAt: String(a['created_at']),
    }));


    let outcome: {
      originalConcern: string | null;
      confirmedCause: string | null;
      repairPerformed: string | null;
      resolved: boolean | null;
      verification: string | null;
      technicianNotes: string | null;
      remainingRecommendations: string | null;
      customerSummary: string | null;
      completionMileage: number | null;
      completedAt: string | null;
    } | null = null;
    try {
      const { data: row } = await client
        .from("job_outcomes")
        .select("*")
        .eq("service_request_id", data.id)
        .maybeSingle();
      const o = (row ?? null) as Row | null;
      outcome = o
        ? {
            originalConcern: s(o['original_concern']),
            confirmedCause: s(o['confirmed_cause']),
            repairPerformed: s(o['repair_performed']),
            resolved: o['resolved'] === null || o['resolved'] === undefined ? null : Boolean(o['resolved']),
            verification: s(o['verification']),
            technicianNotes: s(o['technician_notes']),
            remainingRecommendations: s(o['remaining_recommendations']),
            customerSummary: s(o['customer_summary']),
            completionMileage: o['completion_mileage'] == null ? null : Number(o['completion_mileage']),
            completedAt: s(o['completed_at']),
          }
        : null;
    } catch {

      outcome = null;
    }

    // Concerns are derived from the customer's own submission the first time the
    // job is opened, so nothing from intake has to be retyped.
    const { ensureConcerns } = await import("@/lib/job/concerns.server");
    const derived = await ensureConcerns(client, data.id, context.userId);

    // A customer who used Spanish intake must not leave a technician reading
    // Spanish: normalize once, keep the original, then merge true duplicates.
    let language: string | null = null;
    try {
      const { data: row } = await client
        .from("service_requests")
        .select("preferred_language")
        .eq("id", data.id)
        .maybeSingle();
      language = (row as Row | null)?.['preferred_language'] ?? null;
    } catch {
      language = null;
    }

    const { normalizeConcerns } = await import("@/lib/job/normalize.server");
    const allConcerns = await normalizeConcerns(client, data.id, derived, language);
    // Merged duplicates stay in the database as supporting context, but the
    // technician sees one concern per problem.
    const concerns = allConcerns.filter((c) => !c.mergedIntoId);

    const { listJobKnowledge } = await import("@/lib/knowledge/knowledge.server");
    const knowledge = await listJobKnowledge(client, data.id);

    return {
      concerns,
      diagnostics,
      findings,
      recommendations,
      activity,
      outcome,
      knowledge,
      preferredLanguage: language,
    };
  });

/* ------------------------------------------------------------- knowledge */

/**
 * Syncs source-backed vehicle knowledge for one job and returns the matches.
 *
 * Cached in `repair_knowledge` and stamped on the request, so opening the
 * workspace does not hit an external service; a sync is only attempted when the
 * cached data is older than a day (or the technician asks for a refresh).
 * NHTSA public recall data is the first source; the pipeline itself is
 * source-agnostic.
 */
export const syncJobKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.extend({ force: z.boolean().optional() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const { listJobKnowledge, matchKnowledgeToJob, upsertKnowledge } = await import(
      "@/lib/knowledge/knowledge.server"
    );

    let request: Row | null = null;
    try {
      const { data: row } = await client
        .from("service_requests")
        .select("id, vehicle, notes, details, knowledge_synced_at")
        .eq("id", data.id)
        .maybeSingle();
      request = (row as Row | null) ?? null;
    } catch {
      request = null;
    }
    if (!request) return { knowledge: await listJobKnowledge(client, data.id), synced: false };

    const lastSynced = request['knowledge_synced_at']
      ? Date.parse(String(request['knowledge_synced_at']))
      : 0;
    const stale = !lastSynced || Date.now() - lastSynced > 24 * 60 * 60 * 1000;
    if (!stale && !data.force) {
      return { knowledge: await listJobKnowledge(client, data.id), synced: false };
    }

    const vehicle = (request['vehicle'] ?? {}) as Row;
    const year = Number(vehicle['year']) || null;
    const make = vehicle['make'] ? String(vehicle['make']) : null;
    const model = vehicle['model'] ? String(vehicle['model']) : null;

    try {
      const { fetchNhtsaRecalls } = await import("@/lib/knowledge/nhtsa.server");
      const records = await fetchNhtsaRecalls({ year, make, model });
      const ids = await upsertKnowledge(client, records);

      const concernText = [
        String(request['notes'] ?? ""),
        String((request['details'] as Row | null)?.['description'] ?? ""),
      ]
        .filter(Boolean)
        .join(" \n");
      const dtcs = (
        await safeSelect(() =>
          client
            .from("job_diagnostics")
            .select("code")
            .eq("service_request_id", data.id)
            .not("code", "is", null),
        )
      ).map((row) => String(row['code']));

      await matchKnowledgeToJob(client, data.id, { knowledgeIds: ids, concernText, dtcs });
      await client
        .from("service_requests")
        .update({ knowledge_synced_at: new Date().toISOString() })
        .eq("id", data.id);
    } catch (error) {
      // An external outage must never break the Job Workspace.
      console.error("[knowledge] sync failed", error);
    }

    return { knowledge: await listJobKnowledge(client, data.id), synced: true };
  });

/** Technician feedback on one knowledge match: relevant, or not for this job. */
export const setKnowledgeMatchState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        matchId: z.string().uuid(),
        requestId: z.string().uuid(),
        action: z.enum(["dismiss", "restore", "confirm"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const patch =
      data.action === "dismiss"
        ? { dismissed_at: new Date().toISOString() }
        : data.action === "restore"
          ? { dismissed_at: null }
          : { technician_confirmed_relevant: true, dismissed_at: null };
    try {
      await client
        .from("job_knowledge_matches")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", data.matchId);
      if (data.action === "confirm") {
        await logActivity(
          client,
          data.requestId,
          "knowledge_confirmed",
          "Technician marked vehicle knowledge as relevant to this job.",
          context.userId,
        );
      }
    } catch (error) {
      console.error("[knowledge] state update failed", error);
    }
    const { listJobKnowledge } = await import("@/lib/knowledge/knowledge.server");
    return { knowledge: await listJobKnowledge(client, data.requestId) };
  });

/* ----------------------------------------------------------- diagnostics */

export const addDiagnosticEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        entryType: z.enum([
          "dtc",
          "symptom_verified",
          "inspection",
          "test",
          "note",
          "repair",
          "verification",
        ]),
        code: optionalText(20),
        title: z.string().trim().min(2).max(200),
        detail: optionalText(2000),
        result: optionalText(600),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const { data: row, error } = await client
      .from("job_diagnostics")
      .insert({
        service_request_id: data.id,
        entry_type: data.entryType,
        code: data.code || null,
        title: data.title,
        detail: data.detail || null,
        result: data.result || null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error("Could not save this entry.");
    await logActivity(
      client,
      data.id,
      `diagnostic_${data.entryType}`,
      `${data.entryType.replace(/_/g, " ")}: ${data.title}`,
      context.userId,
    );
    return { ok: true, id: String(row?.id ?? "") };
  });

export const deleteDiagnosticEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ entryId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    await client.from("job_diagnostics").delete().eq("id", data.entryId);
    return { ok: true };
  });

/* -------------------------------------------------------------- findings */

export const saveFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        findingId: z.string().uuid().nullable().optional(),
        concernId: z.string().uuid().nullable().optional(),
        title: z.string().trim().min(2).max(200),
        detail: optionalText(2000),
        measurement: optionalText(120),
        evidence: optionalText(1000),
        confidence: z.enum(["confirmed", "suspected"]).optional(),
        severity: z.enum(["urgent", "recommended", "monitor", "informational"]).default("recommended"),
        source: z.enum(["technician", "ai"]).default("technician"),
        status: z.enum(["open", "converted", "resolved", "dismissed"]).optional(),
        aiDrafted: z.boolean().optional(),
        /** Inspection sheet fields (0013). */
        condition: z.enum(["good", "monitor", "needs_attention", "not_inspected"]).optional(),
        system: optionalText(60),
        safetyConcern: z.boolean().optional(),
        /** True when a human is confirming an AI-drafted finding. */
        approve: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const payload: Record<string, unknown> = {
      title: data.title,
      detail: data.detail || null,
      measurement: data.measurement || null,
      severity: data.severity,
      source: data.source,
      ...(data.status ? { status: data.status } : {}),
    };
    // 0011 columns are optional so this keeps working before the migration runs.
    const extended: Record<string, unknown> = {
      ...payload,
      ...(data.concernId ? { concern_id: data.concernId } : {}),
      ...(data.evidence ? { evidence: data.evidence } : {}),
      ...(data.confidence ? { confidence: data.confidence } : {}),
      ...(data.aiDrafted === undefined ? {} : { ai_drafted: data.aiDrafted }),
      ...(data.condition ? { condition: data.condition } : {}),
      ...(data.system ? { system: data.system } : {}),
      ...(data.safetyConcern === undefined ? {} : { safety_concern: data.safetyConcern }),
      ...(data.approve
        ? { approved_at: new Date().toISOString(), approved_by: context.userId }
        : {}),
    };

    if (data.findingId) {
      let { error } = await client.from("job_findings").update(extended).eq("id", data.findingId);
      if (error) ({ error } = await client.from("job_findings").update(payload).eq("id", data.findingId));
      if (error) throw new Error("Could not update this finding.");
      if (data.approve)
        await logActivity(
          client,
          data.id,
          "finding_approved",
          `Finding confirmed: ${data.title}`,
          context.userId,
        );
      return { ok: true, id: data.findingId };
    }

    const base = { service_request_id: data.id, created_by: context.userId };
    let insert = await client.from("job_findings").insert({ ...extended, ...base }).select("id").single();
    if (insert.error)
      insert = await client.from("job_findings").insert({ ...payload, ...base }).select("id").single();
    if (insert.error) throw new Error("Could not save this finding.");
    await logActivity(client, data.id, "finding_added", `Finding: ${data.title}`, context.userId, {
      severity: data.severity,
      source: data.source,
    });
    return { ok: true, id: String(insert.data?.id ?? "") };
  });

export const deleteFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ findingId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    await client.from("job_findings").delete().eq("id", data.findingId);
    return { ok: true };
  });

/* ------------------------------------------------------- recommendations */

export const saveRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        recommendationId: z.string().uuid().nullable().optional(),
        findingId: z.string().uuid().nullable().optional(),
        concernId: z.string().uuid().nullable().optional(),
        title: z.string().trim().min(2).max(200),
        customerDescription: optionalText(2000),
        internalNotes: optionalText(2000),
        priority: z.enum(["urgent", "recommended", "monitor"]).default("recommended"),
        status: z
          .enum(["draft", "approved", "quoted", "customer_approved", "customer_declined", "deferred"])
          .optional(),
        performedStatus: z
          .enum(["pending", "performed", "not_performed", "deferred", "declined"])
          .optional(),
        aiDrafted: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;

    // Approving a recommendation is the human gate before anything AI-drafted
    // can reach a customer.
    const approving = data.status === "approved";
    const payload = {
      title: data.title,
      customer_description: data.customerDescription || null,
      internal_notes: data.internalNotes || null,
      priority: data.priority,
      ai_drafted: data.aiDrafted,
      ...(data.findingId ? { finding_id: data.findingId } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(approving ? { approved_by: context.userId, approved_at: new Date().toISOString() } : {}),
    };
    const extended = {
      ...payload,
      ...(data.concernId ? { concern_id: data.concernId } : {}),
      ...(data.performedStatus ? { performed_status: data.performedStatus } : {}),
    };

    if (data.recommendationId) {
      let { error } = await client
        .from("job_recommendations")
        .update(extended)
        .eq("id", data.recommendationId);
      if (error)
        ({ error } = await client
          .from("job_recommendations")
          .update(payload)
          .eq("id", data.recommendationId));
      if (error) throw new Error("Could not update this recommendation.");
      if (approving)
        await logActivity(
          client,
          data.id,
          "recommendation_approved",
          `Recommendation approved: ${data.title}`,
          context.userId,
        );
      return { ok: true, id: data.recommendationId };
    }

    const base = { service_request_id: data.id, created_by: context.userId };
    let insert = await client
      .from("job_recommendations")
      .insert({ ...extended, ...base })
      .select("id")
      .single();
    if (insert.error)
      insert = await client
        .from("job_recommendations")
        .insert({ ...payload, ...base })
        .select("id")
        .single();
    if (insert.error) throw new Error("Could not save this recommendation.");
    const row = insert.data;

    // A finding that became a recommendation is marked converted, not deleted.
    if (data.findingId) {
      try {
        await client.from("job_findings").update({ status: "converted" }).eq("id", data.findingId);
      } catch {
        /* ignore */
      }
    }
    await logActivity(
      client,
      data.id,
      "recommendation_created",
      `Recommendation: ${data.title}`,
      context.userId,
      { priority: data.priority, aiDrafted: data.aiDrafted },
    );
    return { ok: true, id: String(row?.id ?? "") };
  });

export const deleteRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ recommendationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    await client.from("job_recommendations").delete().eq("id", data.recommendationId);
    return { ok: true };
  });

/* --------------------------------------------------------------- copilot */

export const askJobCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        action: z
          .enum([
            "ask",
            "diagnose",
            "next_test",
            "explain_dtc",
            "find_procedure",
            "specs",
            "reset_relearn",
            "summarize_job",
            "draft_finding",
            "draft_recommendation",
          ])
          .default("ask"),
        question: z.string().trim().min(2).max(1200),
        force: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const { runCopilot } = await import("@/lib/job/copilot.server");
    return runCopilot({
      client: context.supabase as unknown as Client,
      requestId: data.id,
      action: data.action,
      question: data.question,
      userId: context.userId,
      force: data.force,
    });
  });

export const listJobCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const { listCopilotMessages } = await import("@/lib/job/copilot.server");
    return {
      messages: await listCopilotMessages(context.supabase as unknown as Client, data.id),
    };
  });

/** Shows the technician exactly which job information the AI receives. */
export const getJobContextPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const { assembleJobContext, FULL_SCOPE } = await import("@/lib/job/job-context.server");
    const ctx = await assembleJobContext(
      context.supabase as unknown as Client,
      data.id,
      FULL_SCOPE,
    );
    return {
      vehicleLabel: ctx.vehicleLabel,
      mileage: ctx.mileage,
      stage: ctx.stage,
      sections: ctx.sections.map((s) => ({ label: s.label, body: s.body })),
    };
  });

/* --------------------------------------------------------------- closeout */

export const saveJobOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        originalConcern: optionalText(2000),
        confirmedCause: optionalText(2000),
        repairPerformed: optionalText(2000),
        resolved: z.boolean().nullable().optional(),
        verification: optionalText(1000),
        technicianNotes: optionalText(2000),
        remainingRecommendations: optionalText(2000),
        customerSummary: optionalText(2000),
        completionMileage: z.number().int().min(0).max(2_000_000).nullable().optional(),
        close: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;

    const payload = {
      service_request_id: data.id,
      original_concern: data.originalConcern || null,
      confirmed_cause: data.confirmedCause || null,
      repair_performed: data.repairPerformed || null,
      resolved: data.resolved ?? null,
      verification: data.verification || null,
      technician_notes: data.technicianNotes || null,
      remaining_recommendations: data.remainingRecommendations || null,
      customer_summary: data.customerSummary || null,
      completion_mileage: data.completionMileage ?? null,
      ...(data.close ? { completed_at: new Date().toISOString(), closed_by: context.userId } : {}),
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from("job_outcomes")
      .upsert(payload, { onConflict: "service_request_id" });
    if (error) throw new Error("Could not save the repair outcome.");

    // Closing a job is an explicit human action, never an AI decision.
    if (data.close) {
      try {
        await client.from("service_requests").update({ status: "closed" }).eq("id", data.id);
      } catch {
        /* status enum extension (0010) not applied yet */
      }
      await logActivity(client, data.id, "job_closed", "Job closed with repair outcome", context.userId);

    } else {
      await logActivity(client, data.id, "outcome_updated", "Repair outcome updated", context.userId);
    }

    // Keep customer history aligned when a closed job is corrected. The helper
    // independently verifies closed status and completed work.
    try {
      const { data: request } = await client
        .from("service_requests")
        .select("status")
        .eq("id", data.id)
        .maybeSingle();
      if (data.close || request?.status === "closed") {
      try {
        const { syncJobToServiceHistory } = await import("@/lib/job/history-sync.server");
        const result = await syncJobToServiceHistory(data.id);
        if (result.created) {
          await logActivity(
            client,
            data.id,
            "history_recorded",
            "Completed work added to the vehicle's service history",
            context.userId,
          );
        }
      } catch (error) {
        console.error("[job] history sync failed", (error as Error).message);
      }
      }
    } catch {
      /* history sync remains best-effort */
    }
    return { ok: true };
  });

/* --------------------------------------------------------------- concerns */

/**
 * Saves technician-side concern fields. Customer-reported wording is NOT
 * accepted here — it is never editable by the technician, by design.
 */
export const saveConcern = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        concernId: z.string().uuid(),
        concernStatus: z
          .enum(["not_inspected", "verified", "not_verified", "unable_to_duplicate", "deferred"])
          .optional(),
        testsPerformed: optionalText(2000),
        technicianObserved: optionalText(4000),
        confirmedCause: optionalText(2000),
        shorthand: optionalText(4000),
        story: optionalText(6000),
        approveStory: z.boolean().optional(),
        repairPerformed: optionalText(4000),
        verification: optionalText(2000),
        outcome: z
          .enum([
            "resolved",
            "not_resolved",
            "not_yet_known",
            "unable_to_verify",
            "deferred",
            "further_diagnosis",
            "monitor",
            "inspection_only",
          ])
          .nullable()
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;

    const set = (key: string, value: string | undefined) =>
      value === undefined ? {} : { [key]: value || null };

    const payload = {
      ...(data.concernStatus ? { concern_status: data.concernStatus } : {}),
      ...set("tests_performed", data.testsPerformed),
      ...set("technician_observed", data.technicianObserved),
      ...set("confirmed_cause", data.confirmedCause),
      ...set("shorthand", data.shorthand),
      ...set("story", data.story),
      ...set("repair_performed", data.repairPerformed),
      ...set("verification", data.verification),
      ...(data.outcome === undefined ? {} : { outcome: data.outcome }),
      // An AI-cleaned account is only official once the technician approves it.
      ...(data.approveStory ? { story_approved_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from("job_concerns").update(payload).eq("id", data.concernId);
    if (error) throw new Error("Could not save this concern.");

    if (data.approveStory)
      await logActivity(
        client,
        data.id,
        "diagnosis_approved",
        "Diagnosis account approved",
        context.userId,
        { concernId: data.concernId },
      );
    else
      await logActivity(client, data.id, "concern_updated", "Concern updated", context.userId, {
        concernId: data.concernId,
        status: data.concernStatus ?? null,
      });
    return { ok: true };
  });

/** Adds a concern the customer never mentioned (found during inspection). */
export const addConcern = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema.extend({ title: z.string().trim().min(2).max(160) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const { data: row, error } = await client
      .from("job_concerns")
      .insert({
        service_request_id: data.id,
        title: data.title,
        category: "general",
        origin: "technician",
        sort_order: 90,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error("Could not add this concern.");
    await logActivity(
      client,
      data.id,
      "concern_added",
      `Technician-found concern: ${data.title}`,
      context.userId,
    );
    return { ok: true, id: String(row?.id ?? "") };
  });

/* ---------------------------------------------------- AI drafting (drafts) */

async function loadConcern(client: Client, concernId: string) {
  const { listConcerns } = await import("@/lib/job/concerns.server");
  const { data: row } = await client
    .from("job_concerns")
    .select("service_request_id")
    .eq("id", concernId)
    .maybeSingle();
  const requestId = String((row as Row | null)?.['service_request_id'] ?? "");
  if (!requestId) throw new Error("This concern could not be found.");
  const concern = (await listConcerns(client, requestId)).find((c) => c.id === concernId);
  if (!concern) throw new Error("This concern could not be found.");
  return { requestId, concern };
}

/**
 * Technician shorthand → professional account. Returns a DRAFT only; nothing is
 * written to the concern until the technician approves it.
 */
export const draftConcernStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ concernId: z.string().uuid(), shorthand: z.string().trim().min(3).max(4000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const { requestId, concern } = await loadConcern(client, data.concernId);
    const { draftStoryFromShorthand } = await import("@/lib/job/authoring.server");
    const draft = await draftStoryFromShorthand({
      client,
      requestId,
      concern,
      shorthand: data.shorthand,
    });
    return { ok: true as const, draft };
  });

/** Approved diagnosis → candidate findings. Drafts only. */
export const draftConcernFindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ concernId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const { requestId, concern } = await loadConcern(client, data.concernId);

    const entries = await safeSelect(() =>
      client
        .from("job_diagnostics")
        .select("entry_type, code, title, detail, result")
        .eq("service_request_id", requestId)
        .order("created_at", { ascending: true }),
    );
    const documented = [
      concern.story || concern.technicianObserved || concern.shorthand || "",
      concern.confirmedCause ? `Confirmed cause: ${concern.confirmedCause}` : "",
      ...entries.map((e) =>
        [e['entry_type'], e['code'], e['title'], e['detail'], e['result']]
          .filter(Boolean)
          .join(" — "),
      ),
    ]
      .filter(Boolean)
      .join("\n");

    if (!documented.trim())
      throw new Error("Document the diagnosis first — there is nothing to draft from.");

    const { draftFindings } = await import("@/lib/job/authoring.server");
    return { ok: true as const, drafts: await draftFindings({ client, requestId, concern, source: documented }) };
  });

/**
 * One natural inspection note → a clean findings-sheet entry. Draft only:
 * nothing is written until the technician saves it.
 */
export const cleanupFindingNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        note: z.string().trim().min(3).max(2000),
        condition: z.enum(["good", "monitor", "needs_attention", "not_inspected"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const { draftFindingFromNote } = await import("@/lib/job/authoring.server");
    return {
      ok: true as const,
      draft: await draftFindingFromNote({
        client,
        requestId: data.id,
        note: data.note,
        condition: data.condition,
      }),
    };
  });

/** Findings → candidate recommendations. Drafts only. */
export const draftFindingRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        findingIds: z.array(z.string().uuid()).min(1).max(8),
        concernId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;

    const rows = await safeSelect(() =>
      client
        .from("job_findings")
        .select("id, title, detail, measurement, severity")
        .eq("service_request_id", data.id),
    );
    const selected = rows.filter((r) => data.findingIds.includes(String(r['id'])));
    if (!selected.length) throw new Error("Those findings could not be found.");

    const { listConcerns } = await import("@/lib/job/concerns.server");
    const concern = data.concernId
      ? ((await listConcerns(client, data.id)).find((c) => c.id === data.concernId) ?? null)
      : null;

    const { draftRecommendations } = await import("@/lib/job/authoring.server");
    const drafts = await draftRecommendations({
      client,
      requestId: data.id,
      concern,
      findings: selected
        .map((f) =>
          [f['severity'], f['title'], f['measurement'], f['detail']].filter(Boolean).join(" — "),
        )
        .join("\n"),
    });
    return { ok: true as const, drafts };
  });

/** Everything documented on a concern → closeout draft. Drafts only. */
export const draftConcernCloseout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ concernId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const { requestId, concern } = await loadConcern(client, data.concernId);

    const recs = await safeSelect(() =>
      client
        .from("job_recommendations")
        .select("title, status, priority, internal_notes")
        .eq("service_request_id", requestId),
    );
    const documented = [
      concern.story || concern.technicianObserved || "",
      concern.confirmedCause ? `Confirmed cause: ${concern.confirmedCause}` : "",
      concern.repairPerformed ? `Repair performed: ${concern.repairPerformed}` : "",
      concern.verification ? `Verification: ${concern.verification}` : "",
      ...recs.map((r) =>
        `Recommendation (${r['status']}, ${r['priority']}): ${r['title']}${
          r['internal_notes'] ? ` — ${r['internal_notes']}` : ""
        }`,
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const { draftCloseout } = await import("@/lib/job/authoring.server");
    return { ok: true as const, draft: await draftCloseout({ client, requestId, concern, documented }) };
  });

/* ------------------------------------------------------------- assignment */

/**
 * Records who is fulfilling this request. Repara always owns the customer
 * relationship; today the only automatic option is "I'll do it myself", and a
 * provider name can be typed in for work fulfilled by someone else.
 */
export const setRequestAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        assignmentStatus: z.enum(["unassigned", "self", "assigned", "declined"]),
        provider: optionalText(120),
        technician: optionalText(120),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const accepting = data.assignmentStatus === "self" || data.assignmentStatus === "assigned";
    const { error } = await client
      .from("service_requests")
      .update({
        assignment_status: data.assignmentStatus,
        assigned_provider: data.provider || null,
        assigned_technician: data.technician || null,
        ...(accepting ? { accepted_at: new Date().toISOString(), accepted_by: context.userId } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error("Could not update the assignment.");
    await logActivity(
      client,
      data.id,
      "assignment_changed",
      data.assignmentStatus === "self"
        ? "Accepted by Repara"
        : data.assignmentStatus === "assigned"
          ? `Assigned to ${data.provider || "a provider"}`
          : `Assignment set to ${data.assignmentStatus}`,
      context.userId,
    );
    return { ok: true };
  });
