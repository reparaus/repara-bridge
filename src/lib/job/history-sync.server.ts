/**
 * Completed Repara job → vehicle service history (SERVER ONLY).
 *
 * This is the FIRST automatic history source, because Repara owns this data.
 * Rules that must not be relaxed:
 *  - Only an actually CLOSED job with a recorded repair creates history.
 *    Quoted, recommended or in-progress work never becomes history.
 *  - Internal technician notes and customer messages are never copied into the
 *    consumer-visible record.
 *  - One record per job (unique index in migration 0015), so re-closing a job
 *    updates the same record instead of duplicating the vehicle's history.
 */

type Db = { from: (table: string) => any };
type Row = Record<string, any>;

export async function syncJobToServiceHistory(requestId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Db;

  const { data: request } = await db
    .from("service_requests")
    .select("id, customer_id, user_id, vehicle_id, provider_id, service_category_key, mileage, status, created_at, service_providers(business_name, provider_kind)")
    .eq("id", requestId)
    .maybeSingle();
  if (!request?.vehicle_id || request.status !== "closed") return { created: false as const };

  const { data: outcome } = await db
    .from("job_outcomes")
    .select("repair_performed, verification, resolved, customer_summary, completion_mileage, completed_at")
    .eq("service_request_id", requestId)
    .maybeSingle();

  const outcomeRow = outcome as Row | null;
  const repairPerformed = String(outcomeRow?.['repair_performed'] ?? "").trim();

  const { data: concerns } = await db
    .from("job_concerns")
    .select("id, title, repair_performed, verification, outcome")
    .eq("service_request_id", requestId)
    .order("sort_order", { ascending: true });
  const completedConcerns = ((concerns ?? []) as Row[]).filter((row) => {
    const work = String(row['repair_performed'] ?? "").trim();
    return Boolean(work) && !["deferred", "inspection_only", "not_yet_known"].includes(String(row['outcome'] ?? ""));
  });

  const { data: recommendations } = await db
    .from("job_recommendations")
    .select("id, title, customer_description, performed_status")
    .eq("service_request_id", requestId)
    .eq("performed_status", "performed");

  const completedWork = [
    ...completedConcerns.map((row) => String(row['repair_performed'] ?? "").trim()),
    ...((recommendations ?? []) as Row[]).map((row) =>
      String(row['customer_description'] ?? row['title'] ?? "").trim(),
    ),
  ].filter(Boolean);
  if (!repairPerformed && !completedWork.length) return { created: false as const };

  const completedAt = outcomeRow?.['completed_at'] ?? new Date().toISOString();
  const serviceDate = String(completedAt).slice(0, 10);

  // Latest accepted quote supplies the customer-facing line items and totals.
  const { data: quote } = await db
    .from("quotes")
    .select("id, labor_total, parts_total, total, accepted_at")
    .eq("service_request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const quoteRow = quote as Row | null;
  const accepted = Boolean(quoteRow?.['accepted_at']);

  const provider = (request.service_providers ?? null) as Row | null;
  const providerName = String(provider?.['business_name'] ?? "").trim() || "Repara";
  const summary = String(outcomeRow?.['customer_summary'] ?? "").trim() || repairPerformed;
  const closingMileage = Number(outcomeRow?.['completion_mileage'] ?? request.mileage) || null;

  const payload: Row = {
    customer_id: request.customer_id ?? null,
    vehicle_id: request.vehicle_id,
    service_request_id: requestId,
    quote_id: quoteRow?.['id'] ?? null,
    shop_id: request.provider_id ?? null,
    source_record_id: requestId,
    mileage: closingMileage,
    performed_at: completedAt,
    service_date: serviceDate,
    provider_name: providerName,
    provider_type: provider?.['provider_kind'] ?? "repara_shop",
    source: "repara_verified",
    verification_status: "verified",
    summary: summary.slice(0, 1000),
    labor_total: accepted ? (quoteRow?.['labor_total'] ?? 0) : 0,
    parts_total: accepted ? (quoteRow?.['parts_total'] ?? 0) : 0,
    total: accepted ? (quoteRow?.['total'] ?? 0) : 0,
    total_amount: accepted ? (quoteRow?.['total'] ?? null) : null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await db
    .from("service_records")
    .select("id")
    .eq("service_request_id", requestId)
    .eq("source", "repara_verified")
    .maybeSingle();

  let recordId = existing?.id ? String(existing.id) : null;

  if (recordId) {
    await db.from("service_records").update(payload).eq("id", recordId);
    await db.from("service_record_items").delete().eq("service_record_id", recordId);
  } else {
    const { data: created, error } = await db
      .from("service_records")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error || !created?.id) return { created: false as const };
    recordId = String(created.id);
  }

  const items = (completedWork.length ? completedWork : [repairPerformed]).slice(0, 25);

  await db.from("service_record_items").insert(
    items.map((description, position) => ({
      service_record_id: recordId,
      description,
      item_type: "labor",
      status: "completed",
      position,
    })),
  );

  // Closing mileage is a legitimate, sourced reading.
  if (closingMileage) {
    await db.from("vehicle_mileage_history").upsert({
      vehicle_id: request.vehicle_id,
      mileage: closingMileage,
      source: "repara_shop",
      source_reference: requestId,
    }, { onConflict: "vehicle_id,source,source_reference" });
  }

  if (request.user_id) {
    await db.from("notifications").upsert({
      user_id: request.user_id,
      vehicle_id: request.vehicle_id,
      service_request_id: requestId,
      provider_id: request.provider_id ?? null,
      event_type: "service_completed",
      title: "Service history updated",
      body: `${providerName} completed service for your vehicle.`,
      event_key: `service_completed:${requestId}`,
    }, { onConflict: "user_id,event_key" });
  }

  return { created: true as const, recordId };
}
