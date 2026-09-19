import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin server functions. Every call runs as the signed-in user, so row level
 * security (admin role required) is the enforcement boundary — not this code.
 */

const idSchema = z.object({ id: z.string().uuid() });

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/**
 * One quote line. The parts fields are deliberately supplier-agnostic so a
 * future catalog integration can populate them without a schema change.
 * `internalUnitCost` is admin-only and never leaves the server for customers.
 */
const lineItemSchema = z.object({
  itemType: z.enum(["labor", "part", "fee", "discount"]),
  description: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().min(0).max(9999),
  unitPrice: z.coerce.number().min(-100000).max(1000000),
  groupLabel: optionalText(120),
  partBrand: optionalText(80),
  partNumber: optionalText(80),
  supplier: optionalText(80),
  supplierLocation: optionalText(120),
  supplierProductId: optionalText(120),
  availability: optionalText(60),
  internalUnitCost: z.coerce.number().min(0).max(1000000).optional(),
  /** Recommendation this line came from (migration 0010), so nothing is retyped. */
  recommendationId: z.string().uuid().nullable().optional(),
});


export const getAdminContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Approved admin (admin_users) + TOTP MFA completed (aal2 in the token).
    const claims = context.claims as { aal?: string } | null;
    const aal2 = claims?.aal === "aal2";

    const { data: adminRow } = await (
      context.supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              c: string,
              v: string,
            ) => { maybeSingle: () => Promise<{ data: { role?: string } | null }> };
          };
        };
      }
    )
      .from("admin_users")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    let isApproved = adminRow?.role === "admin";
    if (!isApproved) {
      const { data } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      isApproved = Boolean(data);
    }

    return { isApproved, aal2, isAdmin: isApproved && aal2 };
  });


export const listRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        status: z.string().optional(),
        category: z.string().optional(),
        search: z.string().trim().max(80).optional(),
        since: z.string().optional(),
        serviceArea: z.enum(["all", "eligible", "outside_area", "unknown"]).optional(),
        zip: z.string().trim().max(10).optional(),
        vehicle: z.string().trim().max(60).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const LEGACY_COLUMNS =
      "id, request_number, service_category, service_subcategory, services, status, created_at, zip_code, customers(first_name, last_name, phone, email), vehicles(year, make, model, vin)";
    const AREA_COLUMNS = LEGACY_COLUMNS.replace(
      "zip_code,",
      "zip_code, city, service_area_status, admin_viewed_at, email_status,",
    );
    // Assignment fields arrive with migration 0011; the list degrades without them.
    const COLUMNS = AREA_COLUMNS.replace(
      "email_status,",
      "email_status, accepted_at, assignment_status, assigned_provider, assigned_technician,",
    );

    const run = async (columns: string, withArea: boolean) => {
      let query = context.supabase
        .from("service_requests")
        .select(columns)
        .order("created_at", { ascending: false })
        .limit(300);

      if (data.status && data.status !== "all")
        query = query.eq("status", data.status as "new");
      if (data.category && data.category !== "all")
        query = query.eq("service_category", data.category);
      if (data.since) query = query.gte("created_at", data.since);
      if (withArea && data.serviceArea && data.serviceArea !== "all")
        query = (query as unknown as { eq: (c: string, v: string) => typeof query }).eq(
          "service_area_status",
          data.serviceArea,
        );
      if (data.zip?.trim()) query = query.ilike("zip_code", `${data.zip.trim()}%`);
      return query;
    };

    let { data: rows, error } = await run(COLUMNS, true);
    // Tolerate a database that has not run migration 0011 / 0002 yet.
    if (error && /column|schema cache/i.test(error.message ?? "")) {
      ({ data: rows, error } = await run(AREA_COLUMNS, true));
    }
    if (error && /column|schema cache/i.test(error.message ?? "")) {
      ({ data: rows, error } = await run(LEGACY_COLUMNS, false));
    }
    if (error) throw new Error("Could not load requests.");


    const term = data.search?.toLowerCase().trim();
    const vehicleTerm = data.vehicle?.toLowerCase().trim();

    const mapped = ((rows ?? []) as unknown as AdminRequestRow[]).map((r) => ({
      id: r.id,
      requestNumber: r.request_number,
      category: r.service_category,
      subcategory: r.service_subcategory,
      serviceLabels: Array.isArray(r.services)
        ? r.services.map((s) => s?.label).filter((s): s is string => Boolean(s))
        : [],
      status: r.status,
      createdAt: r.created_at,
      zipCode: r.zip_code ?? "",
      city: r.city ?? "",
      serviceAreaStatus: r.service_area_status ?? "unknown",
      customerName: `${r.customers?.first_name ?? ""} ${r.customers?.last_name ?? ""}`.trim(),
      phone: r.customers?.phone ?? "",
      email: r.customers?.email ?? "",
      vin: r.vehicles?.vin ?? "",
      vehicle: r.vehicles
        ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${r.vehicles.model ?? ""}`.trim()
        : "",
      viewed: Boolean(r.admin_viewed_at),
      emailStatus: r.email_status ?? null,
      acceptedAt: r.accepted_at ?? null,
      assignmentStatus: r.assignment_status ?? "unassigned",
      assignedProvider: r.assigned_provider ?? "",
      assignedTechnician: r.assigned_technician ?? "",
    }));

    let filtered = term
      ? mapped.filter((r) =>
          [r.customerName, r.phone, r.email, r.vin, r.vehicle, r.requestNumber, r.zipCode, r.city]
            .join(" ")
            .toLowerCase()
            .includes(term),
        )
      : mapped;

    if (vehicleTerm)
      filtered = filtered.filter((r) => r.vehicle.toLowerCase().includes(vehicleTerm));

    const counts: Record<string, number> = {};
    for (const r of mapped) counts[r.status] = (counts[r.status] ?? 0) + 1;

    const areaCounts: Record<string, number> = {};
    for (const r of mapped) areaCounts[r.serviceAreaStatus] = (areaCounts[r.serviceAreaStatus] ?? 0) + 1;

    // Badge: requests an admin has never opened (migration 0005).
    const unviewedCount = mapped.filter((r) => !r.viewed).length;

    return { requests: filtered, counts, areaCounts, unviewedCount };
  });

/** Shape of the admin list row; `city`/`service_area_status` come from migration 0002. */
type AdminRequestRow = {
  id: string;
  request_number: string;
  service_category: string;
  service_subcategory: string | null;
  services: { label?: string }[] | null;
  status: string;
  created_at: string;
  zip_code: string | null;
  city: string | null;
  service_area_status: string | null;
  admin_viewed_at: string | null;
  email_status: string | null;
  accepted_at?: string | null;
  assignment_status?: string | null;
  assigned_provider?: string | null;
  assigned_technician?: string | null;
  customers: { first_name?: string; last_name?: string; phone?: string; email?: string } | null;
  vehicles: { year?: number; make?: string; model?: string; vin?: string } | null;
};


export const getRequestDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const claims = context.claims as { aal?: string } | null;
    const accessClient = context.supabase as unknown as {
      from: (table: string) => any;
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
    };
    const { data: adminRow } = await accessClient
      .from("admin_users")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    const isAdmin = claims?.aal === "aal2" && adminRow?.role === "admin";
    if (!isAdmin) {
      const { data: providerAllowed } = await accessClient.rpc("is_request_provider", {
        _request_id: data.id,
      });
      if (!providerAllowed) throw new Error("You do not have access to this request.");
    }
    const { data: request, error } = await context.supabase
      .from("service_requests")
      .select("*, customers(*), vehicles(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error("Could not load this request.");
    if (!request) return { found: false as const };

    const { data: attachments } = await context.supabase
      .from("request_attachments")
      .select("id, storage_path, file_type, created_at")
      .eq("service_request_id", data.id);

    const photos: { id: string; url: string }[] = [];
    for (const a of attachments ?? []) {
      const { data: signed } = await context.supabase.storage
        .from("request-photos")
        .createSignedUrl(a.storage_path, 60 * 60);
      if (signed?.signedUrl) photos.push({ id: a.id, url: signed.signedUrl });
    }

    const { data: quotes } = await context.supabase
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("service_request_id", data.id)
      .order("version", { ascending: false });

    // Status history (migration 0005). Tolerated as empty if not applied yet.
    let statusEvents: {
      id: string;
      fromStatus: string | null;
      toStatus: string;
      createdAt: string;
    }[] = [];
    try {
      const { data: events } = await (
        context.supabase as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (
                c: string,
                v: string,
              ) => {
                order: (
                  c: string,
                  o: { ascending: boolean },
                ) => Promise<{ data: Record<string, string | null>[] | null }>;
              };
            };
          };
        }
      )
        .from("request_status_events")
        .select("id, from_status, to_status, created_at")
        .eq("service_request_id", data.id)
        .order("created_at", { ascending: true });
      statusEvents = (events ?? []).map((e) => ({
        id: String(e['id']),
        fromStatus: e['from_status'] ?? null,
        toStatus: String(e['to_status'] ?? ""),
        createdAt: String(e['created_at']),
      }));
    } catch {
      statusEvents = [];
    }

    const visibleQuotes = isAdmin
      ? (quotes ?? [])
      : (quotes ?? []).map((quote) => ({
          ...quote,
          internal_notes: null,
          internal_cost_total: null,
          quote_items: (quote.quote_items ?? []).map((item: Record<string, unknown>) => ({
            ...item,
            internal_unit_cost: null,
            supplier: null,
            supplier_location: null,
            supplier_product_id: null,
          })),
        }));
    return { found: true as const, request, photos, quotes: visibleQuotes, statusEvents };
  });

/** Marks a request as seen by an admin, which clears it from the "new" badge. */
export const markRequestViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Only stamps the first view so the badge is stable; ignored pre-0005.
    await context.supabase
      .from("service_requests")
      .update({ admin_viewed_at: new Date().toISOString() } as unknown as { status: "new" })
      .eq("id", data.id)
      .is("admin_viewed_at", null);
    return { ok: true };
  });

export const updateRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        status: z.enum([
          "new",
          "contacted",
          "reviewing",
          "ready_to_quote",
          "quoted",
          "accepted",
          "declined",
          "scheduled",
          "diagnosing",
          "in_progress",
          "awaiting_approval",
          "repairing",
          "completed",
          "closed",
          "cancelled",
        ]),

      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: before } = await context.supabase
      .from("service_requests")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("service_requests")
      // "contacted" is added by migration 0002 and not in the generated types.
      .update({ status: data.status as "new" })
      .eq("id", data.id);
    if (error) throw new Error("Could not update the status.");

    // History is best-effort: a missing table must never fail the status change.
    if (before?.status !== data.status) {
      try {
        await (
          context.supabase as unknown as {
            from: (t: string) => { insert: (v: Record<string, unknown>) => Promise<unknown> };
          }
        )
          .from("request_status_events")
          .insert({
            service_request_id: data.id,
            from_status: before?.status ?? null,
            to_status: data.status,
            changed_by: context.userId,
          });
      } catch {
        /* migration 0005 not applied */
      }
    }

    return { ok: true };
  });

/**
 * Re-sends the confirmation emails for one request. Clears the per-recipient
 * "sent" stamps first so the idempotent edge function actually sends again.
 */
export const resendRequestEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema.extend({ target: z.enum(["both", "customer", "admin"]).default("both") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const reset: Record<string, null> = { email_last_error: null };
    if (data.target === "both" || data.target === "customer") reset['customer_email_sent_at'] = null;
    if (data.target === "both" || data.target === "admin") reset['admin_email_sent_at'] = null;

    const { error: resetError } = await context.supabase
      .from("service_requests")
      .update(reset as unknown as { status: "new" })
      .eq("id", data.id);
    if (resetError) throw new Error("Could not prepare the email re-send.");

    const { triggerRequestEmailsWithResult } = await import("@/lib/request-emails.server");
    const result = await triggerRequestEmailsWithResult(data.id);

    const { data: row } = await context.supabase
      .from("service_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    const record = (row ?? {}) as Record<string, string | null>;

    return {
      ok: result.ok,
      error: result.error,
      results: result.results,
      customerSentAt: record['customer_email_sent_at'] ?? null,
      adminSentAt: record['admin_email_sent_at'] ?? null,
      emailStatus: record['email_status'] ?? null,
      lastError: record['email_last_error'] ?? null,
    };
  });


/**
 * Saves a quote draft, or saves AND sends it. All money maths happen here, on
 * the server, so the stored quote is authoritative regardless of the frontend.
 * Internal part costs are stored but never included in customer-facing output.
 */
export const saveQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        serviceRequestId: z.string().uuid(),
        quoteId: z.string().uuid().nullable().optional(),
        items: z.array(lineItemSchema).max(80),
        customerNotes: z.string().trim().max(2000).optional().or(z.literal("")),
        internalNotes: z.string().trim().max(2000).optional().or(z.literal("")),
        expirationDate: z.string().trim().max(20).optional().or(z.literal("")),
        taxTotal: z.coerce.number().min(0).max(100000).default(0),
        send: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const lines = data.items.map((i) => ({ ...i, lineTotal: round2(i.quantity * i.unitPrice) }));
    const sumOf = (type: string) =>
      round2(lines.filter((l) => l.itemType === type).reduce((s, l) => s + l.lineTotal, 0));

    const parts = sumOf("part");
    const labor = sumOf("labor");
    const fees = sumOf("fee");
    const discounts = Math.abs(sumOf("discount"));
    const total = round2(parts + labor + fees + data.taxTotal - discounts);
    const internalCost = round2(
      lines.reduce((s, l) => s + (Number(l.internalUnitCost) || 0) * (Number(l.quantity) || 0), 0),
    );

    const basePayload = {
      service_request_id: data.serviceRequestId,
      status: data.send ? ("sent" as const) : ("draft" as const),
      parts_subtotal: parts,
      labor_subtotal: labor,
      fees_total: fees,
      discount_total: discounts,
      tax_total: data.taxTotal,
      estimated_total: total,
      customer_notes: data.customerNotes || null,
      internal_notes: data.internalNotes || null,
      expiration_date: data.expirationDate || null,
      ...(data.send ? { sent_at: new Date().toISOString() } : {}),
    };
    // internal_cost_total arrives with migration 0009; tolerated when missing.
    const payload = { ...basePayload, internal_cost_total: internalCost };

    let quoteId = data.quoteId ?? null;

    const columnIssue = (message?: string | null) => /column|schema cache/i.test(message ?? "");

    if (quoteId) {
      let { error } = await context.supabase.from("quotes").update(payload as never).eq("id", quoteId);
      if (error && columnIssue(error.message))
        ({ error } = await context.supabase.from("quotes").update(basePayload).eq("id", quoteId));
      if (error) throw new Error("Could not save the quote.");
      await context.supabase.from("quote_items").delete().eq("quote_id", quoteId);
    } else {
      let created: { id: string } | null = null;
      let { data: row, error } = await context.supabase
        .from("quotes")
        .insert(payload as never)
        .select("id")
        .single();
      if (error && columnIssue(error.message)) {
        ({ data: row, error } = await context.supabase
          .from("quotes")
          .insert(basePayload)
          .select("id")
          .single());
      }
      created = row ?? null;
      if (error || !created) throw new Error("Could not create the quote.");
      quoteId = created.id;
    }

    if (lines.length > 0) {
      const baseRows = lines.map((l, index) => ({
        quote_id: quoteId!,
        item_type: l.itemType,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        line_total: l.lineTotal,
        position: index,
      }));
      // Parts-supplier metadata (migration 0009). Kept optional so an older
      // database still saves a working quote.
      const fullRows = baseRows.map((r, index) => {
        const l = lines[index]!;
        return {
          ...r,
          group_label: l.groupLabel || null,
          part_brand: l.partBrand || null,
          part_number: l.partNumber || null,
          supplier: l.supplier || null,
          supplier_location: l.supplierLocation || null,
          supplier_product_id: l.supplierProductId || null,
          availability: l.availability || null,
          internal_unit_cost: l.internalUnitCost ?? null,
          recommendation_id: l.recommendationId ?? null,
        };
      });


      let { error } = await context.supabase.from("quote_items").insert(fullRows as never);
      if (error && columnIssue(error.message))
        ({ error } = await context.supabase.from("quote_items").insert(baseRows));
      if (error) throw new Error("Could not save the line items.");
    }

    const { data: saved } = await context.supabase
      .from("quotes")
      .select("id, public_token, status")
      .eq("id", quoteId!)
      .single();

    let delivery: { ok: boolean; error: string | null; channel: string } | null = null;

    if (data.send) {
      await context.supabase
        .from("service_requests")
        .update({ status: "quoted" })
        .eq("id", data.serviceRequestId);

      // Delivery + conversation logging live server-side so the customer
      // thread is complete no matter which client sent the quote.
      const { deliverQuote } = await import("@/lib/quote-delivery.server");
      delivery = await deliverQuote({
        requestId: data.serviceRequestId,
        quoteId: quoteId!,
        publicToken: saved?.public_token ?? null,
        total,
        message: data.customerNotes || "",
        expiresOn: data.expirationDate || "",
        adminId: context.userId,
      });
    }

    return {
      quoteId: quoteId!,
      publicToken: saved?.public_token ?? null,
      status: saved?.status,
      internalCostTotal: internalCost,
      delivery,
    };
  });

function round2(n: number) {
  return Math.round(n * 100) / 100;
}


// ============================================================== providers
/**
 * Admin provider management. Reads/writes run as the signed-in admin, so the
 * verified-admin RLS policies from 0016 are the boundary. Nothing here creates
 * providers or implies verification badges.
 */
type ProviderDb = { from: (table: string) => any };

export const listProvidersAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        status: z
          .enum(["all", "draft", "pending_review", "active", "paused", "archived"])
          .default("all"),
        search: z.string().trim().max(120).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as ProviderDb;
    let query = db
      .from("service_providers")
      .select(
        "id, business_name, provider_kind, status, city, region, postal_code, service_radius_miles, offers_mobile, offers_in_shop, phone, email, website, description, created_at, provider_services(category_key)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.search) query = query.ilike("business_name", `%${data.search}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return {
      providers: ((rows ?? []) as Record<string, any>[]).map((row) => ({
        id: String(row['id']),
        businessName: String(row['business_name'] ?? ""),
        providerKind: String(row['provider_kind'] ?? ""),
        status: String(row['status'] ?? "draft"),
        location: [row['city'], row['region'], row['postal_code']].filter(Boolean).join(", ") || null,
        serviceRadiusMiles: row['service_radius_miles'] ?? null,
        offersMobile: Boolean(row['offers_mobile']),
        offersInShop: Boolean(row['offers_in_shop']),
        phone: row['phone'] ?? null,
        email: row['email'] ?? null,
        website: row['website'] ?? null,
        description: row['description'] ?? null,
        createdAt: String(row['created_at'] ?? ""),
        categories: ((row['provider_services'] ?? []) as Record<string, any>[]).map((s) =>
          String(s['category_key']),
        ),
      })),
    };
  });

export const setProviderStatusAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "pending_review", "active", "paused", "archived"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as ProviderDb;
    const { error } = await db
      .from("service_providers")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { status: data.status };
  });
