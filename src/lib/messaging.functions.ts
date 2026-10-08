/**
 * Request notifications + request-specific messaging + provider workspace (0023).
 *
 * Signed-in callers go through RLS and security-definer SQL functions that
 * decide the caller's role server-side. Guests use a request-scoped token that
 * resolves to exactly one request; the guest endpoints never accept a request
 * id from the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Db = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };
const asDb = (c: unknown) => c as Db;

function fail(message: string, error?: unknown): never {
  if (error) console.error(message, error);
  throw new Error(message);
}

const KNOWN = [
  "Write a message first",
  "Message is too long",
  "This conversation is not available",
  "This quote can no longer be changed",
  "A quote was already approved for this request",
];
function friendly(error: any, fallback: string): never {
  const msg = String(error?.message ?? "");
  fail(KNOWN.find((k) => msg.includes(k)) ?? fallback, error);
}

export type Message = {
  id: string;
  providerId: string;
  senderRole: "customer" | "provider" | "admin";
  body: string;
  readAt: string | null;
  createdAt: string;
};
const mapMessage = (m: any): Message => ({
  id: String(m.id),
  providerId: String(m.provider_id),
  senderRole: m.sender_role,
  body: String(m.body),
  readAt: m.read_at ?? null,
  createdAt: String(m.created_at),
});

const ids = z.object({ requestId: z.string().uuid(), providerId: z.string().uuid() });
const bodySchema = z.string().trim().min(1, "Write a message first").max(2000);

// ------------------------------------------------------------ notifications

export const listMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ audience: z.enum(["driver", "provider"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await asDb(context.supabase)
      .from("notifications")
      .select("id, event_type, title, body, link, service_request_id, vehicle_id, read_at, created_at")
      .eq("user_id", context.userId)
      .eq("audience", data.audience)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) fail("Notifications could not be loaded.", error);
    return {
      notifications: ((rows ?? []) as any[]).map((n) => ({
        id: String(n.id),
        type: String(n.event_type),
        title: String(n.title),
        body: (n.body as string | null) ?? null,
        link: (n.link as string | null) ?? null,
        readAt: (n.read_at as string | null) ?? null,
        createdAt: String(n.created_at),
      })),
    };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ audience: z.enum(["driver", "provider"]), ids: z.array(z.string().uuid()).max(100).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = asDb(context.supabase)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("audience", data.audience)
      .is("read_at", null);
    if (data.ids?.length) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) fail("Could not update notifications.", error);
    return { ok: true };
  });

export const getNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await asDb(context.supabase)
      .from("profiles")
      .select("notification_preferences")
      .eq("id", context.userId)
      .maybeSingle();
    return { preferences: ((data?.notification_preferences ?? {}) as Record<string, boolean>) };
  });

export const setNotificationPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: z.string().regex(/^(email|sms|in_app)\.[a-z_]{2,40}$/), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = asDb(context.supabase);
    const { data: row } = await db.from("profiles").select("notification_preferences").eq("id", context.userId).maybeSingle();
    if (!row) fail("Your profile isn't set up yet.");
    const next = { ...((row.notification_preferences ?? {}) as Record<string, boolean>), [data.key]: data.enabled };
    const { error } = await db.from("profiles").update({ notification_preferences: next }).eq("id", context.userId);
    if (error) fail("Could not save your preference.", error);
    return { preferences: next };
  });

// --------------------------------------------------------------- messaging

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ids.parse(d))
  .handler(async ({ data, context }) => {
    const db = asDb(context.supabase);
    const { data: rows, error } = await db
      .from("request_messages")
      .select("id, provider_id, sender_role, body, read_at, created_at")
      .eq("request_id", data.requestId)
      .eq("provider_id", data.providerId)
      .order("created_at")
      .limit(300);
    if (error) fail("Messages could not be loaded.", error);
    await db.rpc("mark_request_messages_read", { _request_id: data.requestId, _provider_id: data.providerId });
    return { messages: ((rows ?? []) as any[]).map(mapMessage) };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ids.extend({ body: bodySchema }).parse(d))
  .handler(async ({ data, context }) => {
    const db = asDb(context.supabase);
    const { data: res, error } = await db.rpc("send_request_message", {
      _request_id: data.requestId,
      _provider_id: data.providerId,
      _body: data.body,
    });
    if (error) friendly(error, "Your message could not be sent.");
    const { dispatchNotifications } = await import("./notify.server");
    if (res?.notification_id) await dispatchNotifications([{ kind: "user", notificationId: String(res.notification_id) }]);
    if (res?.guest_recipient) {
      // Provider rows are server-only (0031); read the public name with the server client.
      const directory = (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Db;
      const { data: p } = await directory.from("service_providers").select("business_name").eq("id", data.providerId).maybeSingle();
      await dispatchNotifications([
        { kind: "guest", requestId: data.requestId, event: "message_received", ref: String(res.message_id), providerName: p?.business_name ?? undefined },
      ]);
    }
    return { id: String(res?.message_id ?? "") };
  });

// --------------------------------------------------------- provider workspace

export type ProviderRequestRow = {
  requestId: string;
  requestNumber: string;
  createdAt: string;
  inviteStatus: string;
  requestStatus: string;
  categoryKey: string | null;
  mileage: number | null;
  concern: string;
  vehicle: string;
  buildName: string | null;
  customerLabel: string;
  quoteStatus: string | null;
  unread: number;
  appointmentStatus: string | null;
  stage: "new" | "reviewing" | "quoted" | "accepted" | "in_progress" | "completed" | "archived";
};

function stageOf(r: { invite_status: string; request_status: string }): ProviderRequestRow["stage"] {
  if (["declined", "not_selected"].includes(r.invite_status) || r.request_status === "cancelled") return "archived";
  if (r.invite_status === "selected") {
    if (r.request_status === "in_progress") return "in_progress";
    if (["completed", "closed"].includes(r.request_status)) return "completed";
    return "accepted";
  }
  if (r.invite_status === "quoted") return "quoted";
  if (r.invite_status === "viewed") return "reviewing";
  return "new";
}

export const listProviderRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await asDb(context.supabase).rpc("provider_request_list");
    if (error) fail("Requests could not be loaded.", error);
    const rows: ProviderRequestRow[] = ((data ?? []) as any[]).map((r) => ({
      requestId: String(r.request_id),
      requestNumber: String(r.request_number ?? ""),
      createdAt: String(r.created_at),
      inviteStatus: String(r.invite_status),
      requestStatus: String(r.request_status),
      categoryKey: r.category_key ?? null,
      mileage: r.mileage ?? null,
      concern: String(r.concern ?? ""),
      vehicle: String(r.vehicle ?? "").trim(),
      buildName: r.build_name ?? null,
      customerLabel: String(r.customer_label ?? "Customer"),
      quoteStatus: r.quote_status ?? null,
      unread: Number(r.unread ?? 0),
      appointmentStatus: r.appointment_status ?? null,
      stage: stageOf(r),
    }));
    return { requests: rows };
  });

// ------------------------------------------------------ preset pricing

export type ServicePrice = {
  categoryKey: string;
  isActive: boolean;
  pricingMode: "fixed" | "starting_at" | "range" | "quote";
  priceCents: number | null;
  priceMaxCents: number | null;
  durationMinutes: number | null;
  notes: string | null;
};

async function myProviderId(db: Db, userId: string) {
  const { data } = await db.from("service_providers").select("id").eq("owner_user_id", userId).maybeSingle();
  return data?.id ? String(data.id) : null;
}

export const getMyServicePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = asDb(context.supabase);
    const pid = await myProviderId(db, context.userId);
    if (!pid) return { services: [] as ServicePrice[] };
    const { data, error } = await db
      .from("provider_services")
      .select("category_key, is_active, pricing_mode, price_cents, price_max_cents, duration_minutes, notes")
      .eq("provider_id", pid);
    if (error) fail("Your services could not be loaded.", error);
    return {
      services: ((data ?? []) as any[]).map(
        (s): ServicePrice => ({
          categoryKey: String(s.category_key),
          isActive: s.is_active !== false,
          pricingMode: (s.pricing_mode ?? "quote") as ServicePrice["pricingMode"],
          priceCents: s.price_cents ?? null,
          priceMaxCents: s.price_max_cents ?? null,
          durationMinutes: s.duration_minutes ?? null,
          notes: s.notes ?? null,
        }),
      ),
    };
  });

const cents = z.number().int().min(0).max(100_000_000).nullable();

export const saveServicePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        categoryKey: z.string().min(1).max(60),
        isActive: z.boolean(),
        pricingMode: z.enum(["fixed", "starting_at", "range", "quote"]),
        priceCents: cents,
        priceMaxCents: cents,
        durationMinutes: z.number().int().min(0).max(10080).nullable(),
        notes: z.string().max(500).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = asDb(context.supabase);
    const pid = await myProviderId(db, context.userId);
    if (!pid) fail("Create your provider profile first.");
    if (data.pricingMode !== "quote" && data.priceCents === null) fail("Enter a price.");
    if (data.pricingMode === "range" && (data.priceMaxCents === null || data.priceMaxCents < (data.priceCents ?? 0)))
      fail("Enter a valid price range.");
    const { error } = await db
      .from("provider_services")
      .update({
        is_active: data.isActive,
        pricing_mode: data.pricingMode,
        price_cents: data.pricingMode === "quote" ? null : data.priceCents,
        price_max_cents: data.pricingMode === "range" ? data.priceMaxCents : null,
        duration_minutes: data.durationMinutes,
        notes: data.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider_id", pid)
      .eq("category_key", data.categoryKey);
    if (error) fail("Could not save this service.", error);
    return { ok: true };
  });

// ---------------------------------------------------------------- guests

const tokenSchema = z.object({ token: z.string().min(20).max(64) });

async function guestRequestId(token: string) {
  const { resolveRequestToken } = await import("./notify.server");
  const id = await resolveRequestToken(token);
  if (!id) throw new Error("This link is invalid or has expired.");
  return id;
}
async function adminDb(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export const getGuestRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const requestId = await guestRequestId(data.token);
    const db = await adminDb();
    const [req, invites, quotes, messages, appt] = await Promise.all([
      db
        .from("service_requests")
        .select("id, request_number, status, created_at, mileage, notes, service_category_key, services, vehicle_id, vehicles(year, make, model, trim)")
        .eq("id", requestId)
        .maybeSingle(),
      db.from("request_provider_invites").select("provider_id, status").eq("request_id", requestId),
      db.from("provider_quotes").select("*").eq("request_id", requestId).in("status", ["submitted", "accepted", "declined"]).order("version", { ascending: false }),
      db.from("request_messages").select("id, provider_id, sender_role, body, read_at, created_at").eq("request_id", requestId).order("created_at").limit(500),
      db.from("appointments").select("status").eq("service_request_id", requestId).order("created_at", { ascending: false }).limit(1),
    ]);
    if (!req.data) throw new Error("This request is no longer available.");
    const providerIds = [...new Set(((invites.data ?? []) as any[]).map((i) => String(i.provider_id)))];
    const { data: providers } = providerIds.length
      ? await db.from("service_providers").select("id, business_name, city, region").in("id", providerIds)
      : { data: [] };
    // Customer has now seen provider messages.
    await db
      .from("request_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("request_id", requestId)
      .eq("sender_role", "provider")
      .is("read_at", null);
    const r = req.data;
    const v = r.vehicles;
    const { estimateForRequest } = await import("./estimate.server");
    const vid = (r as any).vehicle_id as string | null;
    const { data: vfull } = vid
      ? await db.from("vehicles").select("year, make, model, trim, engine_code, engine_displacement, drivetrain").eq("id", vid).maybeSingle()
      : { data: null };
    const estimate = await estimateForRequest(db, {
      categoryKey: (r.service_category_key as string | null) ?? null,
      vehicle: vfull
        ? {
            year: vfull.year ?? null, make: vfull.make ?? null, model: vfull.model ?? null, trim: vfull.trim ?? null,
            engine: [vfull.engine_displacement ? `${vfull.engine_displacement}` : null, vfull.engine_code].filter(Boolean).join(" ") || null,
            drivetrain: vfull.drivetrain && vfull.drivetrain !== "unknown" ? String(vfull.drivetrain) : null,
          }
        : null,
      invitedProviderIds: providerIds,
    });
    return {
      estimate,
      requestNumber: String(r.request_number),
      status: String(r.status),
      createdAt: String(r.created_at),
      mileage: (r.mileage as number | null) ?? null,
      categoryKey: (r.service_category_key as string | null) ?? null,
      services: (Array.isArray(r.services) ? r.services : []).map((s: any) => String(s?.label ?? s?.key ?? "")).filter(Boolean) as string[],
      vehicleLabel: v ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") : "",
      appointmentStatus: ((appt.data ?? []) as any[])[0]?.status ?? null,
      providers: ((providers ?? []) as any[]).map((p) => ({
        id: String(p.id),
        name: String(p.business_name ?? "Provider"),
        area: [p.city, p.region].filter(Boolean).join(", ") || null,
        inviteStatus: String(((invites.data ?? []) as any[]).find((i) => String(i.provider_id) === String(p.id))?.status ?? "invited"),
      })),
      quoteLines: await (await import("./provider-quotes.functions")).customerQuoteLines(db, ((quotes.data ?? []) as any[]).map((q) => String(q.id))),
      quotes: ((quotes.data ?? []) as any[]).map((q) => ({
        id: String(q.id),
        providerId: String(q.provider_id),
        version: Number(q.version),
        partsCents: Number(q.parts_cents),
        laborCents: Number(q.labor_cents),
        feesCents: Number(q.fees_cents),
        taxCents: Number(q.tax_cents),
        totalCents: Number(q.total_cents),
        notes: (q.notes as string | null) ?? null,
        timeframe: (q.timeframe as string | null) ?? null,
        warranty: (q.warranty as string | null) ?? null,
        status: String(q.status),
      })),
      messages: ((messages.data ?? []) as any[]).map(mapMessage),
    };
  });

export const sendGuestMessage = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.extend({ providerId: z.string().uuid(), body: bodySchema }).parse(d))
  .handler(async ({ data }) => {
    const requestId = await guestRequestId(data.token);
    const db = await adminDb();
    const { data: res, error } = await db.rpc("post_request_message", {
      _request_id: requestId,
      _provider_id: data.providerId,
      _sender_role: "customer",
      _sender_user: null,
      _body: data.body,
    });
    if (error) friendly(error, "Your message could not be sent.");
    if (res?.notification_id) {
      const { dispatchNotifications } = await import("./notify.server");
      await dispatchNotifications([{ kind: "user", notificationId: String(res.notification_id) }]);
    }
    return { ok: true };
  });

export const guestRespondToQuote = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.extend({ quoteId: z.string().uuid(), action: z.enum(["accept", "decline"]) }).parse(d))
  .handler(async ({ data }) => {
    const requestId = await guestRequestId(data.token);
    const db = await adminDb();
    const { data: q } = await db.from("provider_quotes").select("request_id").eq("id", data.quoteId).maybeSingle();
    if (!q || String(q.request_id) !== requestId) throw new Error("This quote isn't part of your request.");
    const { data: res, error } = await db.rpc("apply_quote_response", { _quote_id: data.quoteId, _action: data.action, _actor: "guest" });
    if (error) friendly(error, "Couldn't update the quote.");
    if (res?.notification_id) {
      const { dispatchNotifications } = await import("./notify.server");
      await dispatchNotifications([{ kind: "user", notificationId: String(res.notification_id) }]);
    }
    return { ok: true };
  });

// ------------------------------------------------------------------ admin

export const getRequestCommsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS limits both tables to verified admins.
    const db = asDb(context.supabase);
    const [deliveries, messages] = await Promise.all([
      db
        .from("notification_deliveries")
        .select("id, channel, event_type, audience, status, error, created_at")
        .eq("service_request_id", data.requestId)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("request_messages")
        .select("id, provider_id, sender_role, body, read_at, created_at")
        .eq("request_id", data.requestId)
        .order("created_at")
        .limit(300),
    ]);
    return {
      deliveries: ((deliveries.data ?? []) as any[]).map((d) => ({
        id: String(d.id),
        channel: String(d.channel),
        eventType: String(d.event_type),
        audience: String(d.audience),
        status: String(d.status),
        error: (d.error as string | null) ?? null,
        createdAt: String(d.created_at),
      })),
      messages: ((messages.data ?? []) as any[]).map(mapMessage),
    };
  });

// ------------------------------------------------ external channel (0024)
// Where out-of-app notifications go: email, text (SMS), both, or in-app only.
// Texts require a valid mobile number AND explicit consent.

const channelInput = z.object({
  audience: z.enum(["driver", "provider"]),
});

export const getContactChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => channelInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = asDb(context.supabase);
    if (data.audience === "provider") {
      const { data: p } = await db.from("service_providers").select("*").eq("owner_user_id", context.userId).maybeSingle();
      if (!p) return { available: false as const };
      return { available: true as const, channel: String(p.notify_channel ?? "email"), phone: String(p.notify_phone_e164 ?? p.phone ?? ""), consented: !!p.sms_consent_at };
    }
    const { data: p } = await db.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    if (!p) return { available: false as const };
    return { available: true as const, channel: String(p.notify_channel ?? "email"), phone: String(p.phone_e164 ?? p.phone ?? ""), consented: !!p.sms_consent_at };
  });

export const setContactChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    channelInput
      .extend({
        channel: z.enum(["email", "sms", "both", "in_app"]),
        phone: z.string().trim().max(30).optional().default(""),
        consent: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { toE164 } = await import("@/lib/phone");
    const texts = data.channel === "sms" || data.channel === "both";
    const e164 = toE164(data.phone);
    if (texts && !e164) fail("Enter a valid mobile number to receive texts.");
    if (texts && !data.consent) fail("Please agree to receive texts first.");
    const consentAt = texts ? new Date().toISOString() : null;
    const db = asDb(context.supabase);
    const q =
      data.audience === "provider"
        ? db.from("service_providers").update({ notify_channel: data.channel, notify_phone_e164: e164, sms_consent_at: consentAt }).eq("owner_user_id", context.userId)
        : db.from("profiles").update({ notify_channel: data.channel, phone_e164: e164, sms_consent_at: consentAt }).eq("id", context.userId);
    const { error } = await q;
    if (error) {
      if (/notify_channel|column/.test(String(error.message))) fail("Text notifications need the latest database update (0024).", error);
      fail("Could not save your notification settings.", error);
    }
    return { ok: true };
  });
