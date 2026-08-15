import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin server functions. Every call runs as the signed-in user, so row level
 * security (admin role required) is the enforcement boundary — not this code.
 */

const idSchema = z.object({ id: z.string().uuid() });

const lineItemSchema = z.object({
  itemType: z.enum(["labor", "part", "fee", "discount"]),
  description: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().min(0).max(9999),
  unitPrice: z.coerce.number().min(-100000).max(1000000),
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
    const COLUMNS = LEGACY_COLUMNS.replace(
      "zip_code,",
      "zip_code, city, service_area_status, admin_viewed_at, email_status,",
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
    // Tolerate a database that has not run migration 0002 yet.
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
  customers: { first_name?: string; last_name?: string; phone?: string; email?: string } | null;
  vehicles: { year?: number; make?: string; model?: string; vin?: string } | null;
};


export const getRequestDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
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

    return { found: true as const, request, photos, quotes: quotes ?? [], statusEvents };
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
          "quoted",
          "accepted",
          "declined",
          "scheduled",
          "in_progress",
          "completed",
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


export const saveQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        serviceRequestId: z.string().uuid(),
        quoteId: z.string().uuid().nullable().optional(),
        items: z.array(lineItemSchema).max(50),
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

    const payload = {
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

    let quoteId = data.quoteId ?? null;

    if (quoteId) {
      const { error } = await context.supabase.from("quotes").update(payload).eq("id", quoteId);
      if (error) throw new Error("Could not save the quote.");
      await context.supabase.from("quote_items").delete().eq("quote_id", quoteId);
    } else {
      const { data: created, error } = await context.supabase
        .from("quotes")
        .insert(payload)
        .select("id")
        .single();
      if (error || !created) throw new Error("Could not create the quote.");
      quoteId = created.id;
    }

    if (lines.length > 0) {
      const { error } = await context.supabase.from("quote_items").insert(
        lines.map((l, index) => ({
          quote_id: quoteId!,
          item_type: l.itemType,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          line_total: l.lineTotal,
          position: index,
        })),
      );
      if (error) throw new Error("Could not save the line items.");
    }

    if (data.send) {
      await context.supabase
        .from("service_requests")
        .update({ status: "quoted" })
        .eq("id", data.serviceRequestId);
    }

    const { data: saved } = await context.supabase
      .from("quotes")
      .select("id, public_token, status")
      .eq("id", quoteId!)
      .single();

    return { quoteId: quoteId!, publicToken: saved?.public_token ?? null, status: saved?.status };
  });

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
