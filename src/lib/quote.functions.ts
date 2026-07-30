import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { quoteRequestSchema } from "./quote-schema";

/**
 * Public (unauthenticated) server functions for the customer quote journey.
 * All database access happens here with the privileged server client, so the
 * public never gets read access to customers, vehicles or requests.
 */

const tokenSchema = z.object({ token: z.string().trim().regex(/^[a-f0-9]{16,80}$/) });

export const submitQuoteRequest = createServerFn({ method: "POST" })
  .inputValidator((data) => quoteRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .insert({
        first_name: data.contact.firstName,
        last_name: data.contact.lastName || null,
        phone: data.contact.phone || "",
        email: data.contact.email || null,
        preferred_contact_method: data.contact.preferredContactMethod,
      })
      .select("id")
      .single();
    if (customerError || !customer) throw new Error("Could not save your contact details.");

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .insert({
        customer_id: customer.id,
        vin: data.vehicle.vin || null,
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
      })
      .select("id")
      .single();
    if (vehicleError || !vehicle) throw new Error("Could not save your vehicle.");


    const primary = data.services[0];
    // Flat list of every choice answered, so existing filters/search keep working.
    const symptoms = data.services.flatMap((s) =>
      Object.values(s.answers).flatMap((v) => (Array.isArray(v) ? v : [])),
    );

    const { data: request, error: requestError } = await supabaseAdmin
      .from("service_requests")
      .insert({
        customer_id: customer.id,
        vehicle_id: vehicle.id,
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
      })
      .select("id, request_number")
      .single();
    if (requestError || !request) throw new Error("Could not submit your request.");

    // Mileage is captured as a dated record, never only as a static value.
    await supabaseAdmin.from("mileage_records").insert({
      vehicle_id: vehicle.id,
      service_request_id: request.id,
      mileage: data.details.mileage,
      source: "quote_request",
    });

    if (data.details.photoPaths.length > 0) {
      await supabaseAdmin.from("request_attachments").insert(
        data.details.photoPaths.map((p) => ({
          service_request_id: request.id,
          storage_path: p,
          file_type: "image",
        })),
      );
    }

    return { requestNumber: request.request_number };
  });


export const getPublicQuote = createServerFn({ method: "POST" })
  .inputValidator((data) => tokenSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select(
        "id, status, parts_subtotal, labor_subtotal, fees_total, discount_total, tax_total, estimated_total, customer_notes, expiration_date, sent_at, service_request_id",
      )
      .eq("public_token", data.token)
      .maybeSingle();

    if (!quote || quote.status === "draft") return { found: false as const };

    const { data: request } = await supabaseAdmin
      .from("service_requests")
      .select(
        "request_number, service_category, service_subcategory, customers(first_name), vehicles(year, make, model)",
      )
      .eq("id", quote.service_request_id)
      .single();

    const { data: items } = await supabaseAdmin
      .from("quote_items")
      .select("id, item_type, description, quantity, unit_price, line_total")
      .eq("quote_id", quote.id)
      .order("position");

    const expired =
      !!quote.expiration_date && new Date(quote.expiration_date) < new Date(new Date().toDateString());

    return {
      found: true as const,
      expired,
      quote: {
        status: quote.status,
        partsSubtotal: Number(quote.parts_subtotal),
        laborSubtotal: Number(quote.labor_subtotal),
        feesTotal: Number(quote.fees_total),
        discountTotal: Number(quote.discount_total),
        taxTotal: Number(quote.tax_total),
        estimatedTotal: Number(quote.estimated_total),
        customerNotes: quote.customer_notes,
        expirationDate: quote.expiration_date,
      },
      items: (items ?? []).map((i) => ({
        id: i.id,
        type: i.item_type,
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price),
        lineTotal: Number(i.line_total),
      })),
      request: {
        requestNumber: request?.request_number ?? "",
        category: request?.service_category ?? "",
        subcategory: request?.service_subcategory ?? null,
        firstName: request?.customers?.first_name ?? "",
        vehicle: request?.vehicles
          ? `${request.vehicles.year ?? ""} ${request.vehicles.make ?? ""} ${request.vehicles.model ?? ""}`.trim()
          : "",
      },
    };
  });

export const respondToQuote = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    tokenSchema.extend({ decision: z.enum(["accepted", "declined"]) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select("id, status, service_request_id, expiration_date")
      .eq("public_token", data.token)
      .maybeSingle();

    if (!quote) throw new Error("Quote not found.");
    if (quote.status !== "sent") throw new Error("This quote can no longer be updated.");
    if (quote.expiration_date && new Date(quote.expiration_date) < new Date(new Date().toDateString()))
      throw new Error("This quote has expired.");

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("quotes")
      .update({
        status: data.decision,
        accepted_at: data.decision === "accepted" ? now : null,
        declined_at: data.decision === "declined" ? now : null,
      })
      .eq("id", quote.id);

    await supabaseAdmin
      .from("service_requests")
      .update({ status: data.decision })
      .eq("id", quote.service_request_id);

    return { status: data.decision };
  });
