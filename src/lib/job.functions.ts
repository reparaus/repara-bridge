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

export type JobFinding = {
  id: string;
  title: string;
  detail: string | null;
  measurement: string | null;
  severity: string;
  source: string;
  status: string;
  createdAt: string;
};

export type JobRecommendation = {
  id: string;
  findingId: string | null;
  title: string;
  customerDescription: string | null;
  internalNotes: string | null;
  priority: string;
  status: string;
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

    const findings: JobFinding[] = (
      await safeSelect(() =>
        client
          .from("job_findings")
          .select("id, title, detail, measurement, severity, source, status, created_at")
          .eq("service_request_id", data.id)
          .order("created_at", { ascending: false }),
      )
    ).map((f) => ({
      id: String(f['id']),
      title: String(f['title'] ?? ""),
      detail: s(f['detail']),
      measurement: s(f['measurement']),
      severity: String(f['severity'] ?? "recommended"),
      source: String(f['source'] ?? "technician"),
      status: String(f['status'] ?? "open"),
      createdAt: String(f['created_at']),
    }));

    const recommendations: JobRecommendation[] = (
      await safeSelect(() =>
        client
          .from("job_recommendations")
          .select(
            "id, finding_id, title, customer_description, internal_notes, priority, status, ai_drafted, approved_at, created_at",
          )
          .eq("service_request_id", data.id)
          .order("created_at", { ascending: false }),
      )
    ).map((x) => ({
      id: String(x['id']),
      findingId: s(x['finding_id']),
      title: String(x['title'] ?? ""),
      customerDescription: s(x['customer_description']),
      internalNotes: s(x['internal_notes']),
      priority: String(x['priority'] ?? "recommended"),
      status: String(x['status'] ?? "draft"),
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


    let outcome: Record<string, unknown> | null = null;
    try {
      const { data: row } = await client
        .from("job_outcomes")
        .select("*")
        .eq("service_request_id", data.id)
        .maybeSingle();
      outcome = (row ?? null) as Record<string, unknown> | null;
    } catch {
      outcome = null;
    }

    return { diagnostics, findings, recommendations, activity, outcome };
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
        title: z.string().trim().min(2).max(200),
        detail: optionalText(2000),
        measurement: optionalText(120),
        severity: z.enum(["urgent", "recommended", "monitor", "informational"]).default("recommended"),
        source: z.enum(["technician", "ai"]).default("technician"),
        status: z.enum(["open", "converted", "resolved", "dismissed"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const client = context.supabase as unknown as Client;
    const payload = {
      title: data.title,
      detail: data.detail || null,
      measurement: data.measurement || null,
      severity: data.severity,
      source: data.source,
      ...(data.status ? { status: data.status } : {}),
    };

    if (data.findingId) {
      const { error } = await client.from("job_findings").update(payload).eq("id", data.findingId);
      if (error) throw new Error("Could not update this finding.");
      return { ok: true, id: data.findingId };
    }

    const { data: row, error } = await client
      .from("job_findings")
      .insert({ ...payload, service_request_id: data.id, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error("Could not save this finding.");
    await logActivity(client, data.id, "finding_added", `Finding: ${data.title}`, context.userId, {
      severity: data.severity,
      source: data.source,
    });
    return { ok: true, id: String(row?.id ?? "") };
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
        title: z.string().trim().min(2).max(200),
        customerDescription: optionalText(2000),
        internalNotes: optionalText(2000),
        priority: z.enum(["urgent", "recommended", "monitor"]).default("recommended"),
        status: z
          .enum(["draft", "approved", "quoted", "customer_approved", "customer_declined", "deferred"])
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

    if (data.recommendationId) {
      const { error } = await client
        .from("job_recommendations")
        .update(payload)
        .eq("id", data.recommendationId);
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

    const { data: row, error } = await client
      .from("job_recommendations")
      .insert({ ...payload, service_request_id: data.id, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error("Could not save this recommendation.");

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
    return { ok: true };
  });
