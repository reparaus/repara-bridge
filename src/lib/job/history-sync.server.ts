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
    .select("id, customer_id, vehicle_id, mileage, created_at")
    .eq("id", requestId)
    .maybeSingle();
  if (!request?.vehicle_id || !request?.customer_id) return { created: false as const };

  const { data: outcome } = await db
    .from("job_outcomes")
    .select("repair_performed, verification, completed_at")
    .eq("service_request_id", requestId)
    .maybeSingle();

  const repairPerformed = String((outcome as Row | null)?.['repair_performed'] ?? "").trim();
  if (!repairPerformed) return { created: false as const };

  const completedAt = (outcome as Row | null)?.['completed_at'] ?? new Date().toISOString();
  const serviceDate = String(completedAt).slice(0, 10);

  // Latest accepted quote supplies the customer-facing line items and totals.
  const { data: quote } = await db
    .from("quotes")
    .select("id, labor_total, parts_total, total, accepted_at, quote_items(description, item_type, position)")
    .eq("service_request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const quoteRow = quote as Row | null;
  const accepted = Boolean(quoteRow?.['accepted_at']);

  const payload: Row = {
    customer_id: request.customer_id,
    vehicle_id: request.vehicle_id,
    service_request_id: requestId,
    quote_id: quoteRow?.['id'] ?? null,
    mileage: request.mileage ?? null,
    performed_at: completedAt,
    service_date: serviceDate,
    provider_name: "Repara",
    provider_type: "repara_shop",
    source: "repara_verified",
    verification_status: "verified",
    summary: repairPerformed.slice(0, 1000),
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

  const lines = ((quoteRow?.['quote_items'] ?? []) as Row[])
    .filter((i) => String(i['item_type'] ?? "") !== "fee")
    .map((i) => String(i['description'] ?? "").trim())
    .filter(Boolean);

  const items = (accepted && lines.length ? lines : [repairPerformed.slice(0, 200)]).slice(0, 25);

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
  if (request.mileage) {
    await db.from("vehicle_mileage_history").insert({
      vehicle_id: request.vehicle_id,
      mileage: request.mileage,
      source: "repara_shop",
      source_reference: requestId,
    });
  }

  return { created: true as const, recordId };
}
