import type { z } from "zod";

import type { quoteRequestSchema } from "./quote-schema";

type QuoteInput = z.infer<typeof quoteRequestSchema>;

/** Digits-only phone key so "(404) 555-1234" and "404-555-1234" are one customer. */
export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Persists a completed quote request. Runs only after final submission and
 * cleans up anything it created if a later step fails, so the database never
 * keeps a half-written request.
 */
export async function persistQuoteRequest(data: QuoteInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // ------------------------------------------------------- idempotency
  // Duplicate protection is per SUBMISSION, never per customer. If this exact
  // submission was already saved (double click, refresh, network retry) we
  // return the original request instead of creating a second one. A returning
  // customer submitting a new quote carries a new submissionId, so they can
  // always create another request.
  const submissionId = data.submissionId ?? "";
  if (submissionId) {
    const { data: existing } = await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              c: string,
              v: unknown,
            ) => {
              maybeSingle: () => Promise<{
                data: {
                  request_number: string;
                  service_area_status: string | null;
                  city: string | null;
                } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      }
    )
      .from("service_requests")
      .select("request_number, service_area_status, city")
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (existing?.request_number) {
      return {
        requestNumber: existing.request_number,
        serviceAreaStatus: (existing.service_area_status ?? "unknown") as
          | "eligible"
          | "outside_area"
          | "unknown",
        serviceAreaCity: existing.city ?? null,
        duplicate: true as const,
      };
    }
  }

  const phoneKey = normalizePhone(data.contact.phone ?? "");
  const emailKey = data.contact.email ? normalizeEmail(data.contact.email) : "";

  // ------------------------------------------------------------- customer
  // Reuse a returning customer's record so their history stays on one profile.
  // This links records only — it never blocks or merges service requests.
  let customerId: string | null = null;


  if (phoneKey.length >= 10) {
    const { data: rows } = await supabaseAdmin
      .from("customers")
      .select("id, phone")
      .ilike("phone", `%${phoneKey.slice(-10)}%`)
      .limit(20);
    const hit = (rows ?? []).find((r) => normalizePhone(r.phone ?? "") === phoneKey);
    if (hit) customerId = hit.id;
  }

  if (!customerId && emailKey) {
    const { data: rows } = await supabaseAdmin
      .from("customers")
      .select("id, email")
      .ilike("email", emailKey)
      .limit(5);
    if (rows?.length) customerId = rows[0].id;
  }

  const customerFields = {
    first_name: data.contact.firstName,
    last_name: data.contact.lastName || null,
    phone: data.contact.phone || "",
    email: data.contact.email || null,
    preferred_contact_method: data.contact.preferredContactMethod,
  };

  let createdCustomerId: string | null = null;
  if (customerId) {
    await supabaseAdmin
      .from("customers")
      .update({ ...customerFields, updated_at: new Date().toISOString() })
      .eq("id", customerId);
  } else {
    const { data: customer, error } = await supabaseAdmin
      .from("customers")
      .insert(customerFields)
      .select("id")
      .single();
    if (error || !customer) throw new Error("Could not save your contact details.");
    customerId = customer.id;
    createdCustomerId = customer.id;
  }

  const rollback = async () => {
    if (createdCustomerId) {
      // Cascades to anything created underneath this brand-new customer.
      await supabaseAdmin.from("customers").delete().eq("id", createdCustomerId);
    }
  };

  // -------------------------------------------------------------- vehicle
  // VIN is the primary identity when present, so the same car is never
  // duplicated across repeat visits.
  const vin = data.vehicle.vin || "";
  let vehicleId: string | null = null;
  let createdVehicleId: string | null = null;

  if (vin) {
    const { data: rows } = await supabaseAdmin
      .from("vehicles")
      .select("id")
      .eq("vin", vin)
      .eq("customer_id", customerId)
      .limit(1);
    if (rows?.length) vehicleId = rows[0].id;
  }

  const vehicleFields = {
    customer_id: customerId,
    vin: vin || null,
    year: data.vehicle.year,
    make: data.vehicle.make,
    model: data.vehicle.model,
    // Structured configuration — never a single free-text description.
    trim: data.vehicle.trim || null,
    engine_displacement: data.vehicle.engineDisplacement ?? null,
    engine_code: data.vehicle.engineCode || null,
    cylinder_count: data.vehicle.cylinderCount ?? null,
    fuel_type: data.vehicle.fuelType || null,
    is_hybrid: data.vehicle.isHybrid ?? null,
    drivetrain: data.vehicle.drivetrain,
    body_type: data.vehicle.bodyType || null,
    engine_source: data.vehicle.engineSource ?? null,
    drivetrain_source: data.vehicle.drivetrainSource ?? null,
    // Latest known reading only — the durable history lives in mileage_records.
    mileage: data.details.mileage,
  };

  if (vehicleId) {
    await supabaseAdmin
      .from("vehicles")
      .update({ ...vehicleFields, updated_at: new Date().toISOString() })
      .eq("id", vehicleId);
  } else {
    const { data: vehicle, error } = await supabaseAdmin
      .from("vehicles")
      .insert(vehicleFields)
      .select("id")
      .single();
    if (error || !vehicle) {
      await rollback();
      throw new Error("Could not save your vehicle.");
    }
    vehicleId = vehicle.id;
    createdVehicleId = vehicle.id;
  }

  const rollbackVehicle = async () => {
    if (createdCustomerId) {
      await supabaseAdmin.from("customers").delete().eq("id", createdCustomerId);
    } else if (createdVehicleId) {
      await supabaseAdmin.from("vehicles").delete().eq("id", createdVehicleId);
    }
  };

  // ------------------------------------------------------- service request
  const primary = data.services[0];
  // Flat list of every choice answered, so existing filters/search keep working.
  const symptoms = data.services.flatMap((s) =>
    Object.values(s.answers).flatMap((v) => (Array.isArray(v) ? v : [])),
  );

  // ZIP — never the typed city — decides service-area eligibility. Requests
  // from outside the area are still saved so demand stays visible.
  const area = await lookupServiceArea(data.details.zipCode);

  const baseRequest = {
    customer_id: customerId,
    vehicle_id: vehicleId,
    service_category: primary.key,
    service_subcategory: data.services.length > 1 ? "multiple" : null,
    services: data.services,
    symptoms,
    details: {
      vehicleEntryMethod: data.vehicle.entryMethod,
      vehicleTrim: data.vehicle.trim || "",
      services: Object.fromEntries(data.services.map((s) => [s.key, s.answers])),
    },
    notes: data.details.notes || null,
    mileage: data.details.mileage,
    zip_code: data.details.zipCode,
    service_location_type: "mobile",
    status: "new" as const,
  };

  const insertRequest = (payload: Record<string, unknown>) =>
    (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          insert: (row: unknown) => {
            select: (cols: string) => {
              single: () => Promise<{
                data: { id: string; request_number: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      }
    )
      .from("service_requests")
      .insert(payload)
      .select("id, request_number")
      .single();

  let { data: request, error: requestError } = await insertRequest({
    ...baseRequest,
    service_area_status: area.status,
    city: area.city,
  });

  // Tolerate a database that has not run migration 0002 yet: fall back to the
  // original column set rather than failing a real customer submission.
  if (requestError && /column|schema cache/i.test(requestError.message ?? "")) {
    ({ data: request, error: requestError } = await insertRequest(baseRequest));
  }

  if (requestError || !request) {
    await rollbackVehicle();
    throw new Error("Could not submit your request.");
  }

  const rollbackRequest = async () => {
    await supabaseAdmin.from("service_requests").delete().eq("id", request.id);
    await rollbackVehicle();
  };

  // Normalized multi-service rows (queryable companion to services jsonb).
  // `requested_services` exists in the external schema but not in the generated
  // (read-only) types file, so this one call is typed loosely on purpose.
  const requestedServices = supabaseAdmin as unknown as {
    from: (t: string) => {
      insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error: servicesError } = await requestedServices.from("requested_services").insert(
    data.services.map((s, index) => ({
      service_request_id: request.id,
      service_key: s.key,
      service_label: s.label,
      answers: s.answers,
      position: index,
    })),
  );
  if (servicesError) {
    await rollbackRequest();
    throw new Error("Could not submit your request.");
  }

  // Mileage is captured as a dated record, never only as a static value.
  const { error: mileageError } = await supabaseAdmin.from("mileage_records").insert({
    vehicle_id: vehicleId,
    service_request_id: request.id,
    mileage: data.details.mileage,
    source: "quote_request",
  });
  if (mileageError) {
    await rollbackRequest();
    throw new Error("Could not submit your request.");
  }

  // Photos are non-essential: a failure here must not void a valid request.
  if (data.details.photoPaths.length > 0) {
    await supabaseAdmin.from("request_attachments").insert(
      data.details.photoPaths.map((p) => ({
        service_request_id: request.id,
        storage_path: p,
        file_type: "image",
      })),
    );
  }

  // Emails are best-effort and strictly after the commit: a provider failure
  // never rolls back, duplicates or retries the saved request.
  try {
    const { triggerRequestEmails } = await import("./request-emails.server");
    await triggerRequestEmails(request.id);
  } catch (error) {
    console.error("[emails] trigger failed for request", request.id, error);
  }

  return {
    requestNumber: request.request_number,
    serviceAreaStatus: area.status,
    serviceAreaCity: area.city,
  };
}

/**
 * Resolves a ZIP code against the approved service areas. The typed city is
 * never trusted — only an active `service_areas` row makes a request eligible.
 * A lookup failure degrades to "unknown" instead of blocking a submission.
 */
export async function lookupServiceArea(
  zipCode: string,
): Promise<{ status: "eligible" | "outside_area" | "unknown"; city: string | null }> {
  const zip5 = (zipCode ?? "").trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip5)) return { status: "outside_area", city: null };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          c: string,
          v: unknown,
        ) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            maybeSingle: () => Promise<{
              data: { city: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };

  const { data, error } = await client
    .from("service_areas")
    .select("city")
    .eq("zip_code", zip5)
    .eq("active", true)
    .maybeSingle();

  if (error) return { status: "unknown", city: null };
  return data ? { status: "eligible", city: data.city } : { status: "outside_area", city: null };
}

/**
 * Removes quote photos that never became part of a submitted request
 * (submission failed or the customer abandoned the flow). Anything already
 * attached to a request is left untouched.
 */
export async function discardUnusedPhotos(paths: string[]) {
  if (paths.length === 0) return { removed: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: attached } = await supabaseAdmin
    .from("request_attachments")
    .select("storage_path")
    .in("storage_path", paths);

  const used = new Set((attached ?? []).map((a) => a.storage_path));
  const removable = paths.filter((p) => !used.has(p));
  if (removable.length === 0) return { removed: 0 };

  await supabaseAdmin.storage.from("request-photos").remove(removable);
  return { removed: removable.length };
}
