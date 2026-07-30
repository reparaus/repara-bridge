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
    const { persistQuoteRequest } = await import("./quote-submit.server");
    return persistQuoteRequest(data);
  });

/** Cleans up photos uploaded for a quote that was never submitted. */
export const discardQuotePhotos = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ paths: z.array(z.string().max(300)).max(8) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { discardUnusedPhotos } = await import("./quote-submit.server");
    return discardUnusedPhotos(data.paths);
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
