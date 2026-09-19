/**
 * Garage API — the ONLY boundary the Garage UI talks to.
 *
 * Every function is authenticated with the existing Supabase bearer middleware
 * and returns plain data, so a future native app can call the exact same API.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addOwnerServiceRecord,
  addVehicleToGarage,
  buildTimeline,
  ensureProfile,
  getVehicleDetail,
  listGarage,
  listRecentActivity,
  normalizeVin,
  recordMileage,
  removeVehicleFromGarage,
  setPrimaryVehicle,
  updateProfile,
} from "@/lib/garage/garage.server";
import { askRepara, type AskTurn } from "@/lib/garage/ask.server";

type Db = { from: (table: string) => any };

const vehicleId = z.object({ vehicleId: z.string().uuid() });

// ------------------------------------------------------------------ profile
export const getGarageHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as Db;
    const profile = await ensureProfile(db, context.userId, {
      email: (context.claims as Record<string, unknown>)['email'] as string | undefined,
    });
    const vehicles = await listGarage(db, context.userId);
    const recentActivity = await listRecentActivity(
      db,
      vehicles.map((v) => v.id),
    );
    let notifications: Array<Record<string, unknown>> = [];
    try {
      const { data } = await db
        .from("notifications")
        .select("id, event_type, title, body, vehicle_id, service_request_id, provider_id, read_at, created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(30);
      notifications = (data ?? []) as Array<Record<string, unknown>>;
    } catch {
      // Migration 0017 may not be applied yet; Garage remains usable.
    }
    return {
      profile: {
        firstName: profile['first_name'] ?? null,
        lastName: profile['last_name'] ?? null,
        email: profile['email'] ?? null,
        phone: profile['phone'] ?? null,
        preferredLanguage: String(profile['preferred_language'] ?? "en"),
        notificationPreferences: (profile['notification_preferences'] ?? {}) as Record<string, boolean>,
      },
      vehicles,
      recentActivity,
      notifications: notifications.map((row) => ({
        id: String(row['id']),
        type: String(row['event_type']),
        title: String(row['title']),
        body: row['body'] ? String(row['body']) : null,
        vehicleId: row['vehicle_id'] ? String(row['vehicle_id']) : null,
        requestId: row['service_request_id'] ? String(row['service_request_id']) : null,
        readAt: row['read_at'] ? String(row['read_at']) : null,
        createdAt: String(row['created_at']),
      })),
    };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not update this notification.");
    return { ok: true };
  });

/**
 * Providers eligible for a service category. Returns ONLY real, active,
 * non-demo providers — today that list is usually empty, and the UI says so
 * instead of inventing shops, ratings or availability.
 */
export const findProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ categoryKey: z.string().max(60).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    type Provider = {
      id: string;
      name: string;
      kind: string;
      description: string | null;
      location: string | null;
      offersMobile: boolean;
      offersInShop: boolean;
      specialties: string[];
    };

    const db = context.supabase as unknown as Db;
    const { data: rows, error } = await db
      .from("service_providers")
      .select(
        "id, business_name, provider_kind, description, city, region, offers_mobile, offers_in_shop, specialties, provider_services(category_key)",
      )
      .eq("status", "active")
      .eq("is_demo", false)
      .limit(20);

    if (error) return { providers: [] as Provider[], error: "Provider availability could not be loaded." };

    const providers = ((rows ?? []) as Record<string, any>[]).filter((p) => {
      if (!data.categoryKey) return true;
      const keys = ((p['provider_services'] ?? []) as Record<string, any>[]).map((s) =>
        String(s['category_key']),
      );
      return keys.includes(data.categoryKey);
    });

    const mapped: Provider[] = providers.map((p) => ({
      id: String(p['id']),
      name: String(p['business_name']),
      kind: String(p['provider_kind']),
      description: p['description'] ? String(p['description']) : null,
      location: [p['city'], p['region']].filter(Boolean).join(", ") || null,
      offersMobile: Boolean(p['offers_mobile']),
      offersInShop: Boolean(p['offers_in_shop']),
      specialties: (p['specialties'] ?? []) as string[],
    }));

    return { providers: mapped, error: null as string | null };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        firstName: z.string().trim().max(80).optional(),
        lastName: z.string().trim().max(80).optional(),
        phone: z.string().trim().max(30).optional(),
        preferredLanguage: z.enum(["en", "es"]).optional(),
        notificationPreferences: z.record(z.string(), z.boolean()).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    updateProfile(context.supabase as unknown as Db, context.userId, data),
  );

// ------------------------------------------------------------ add a vehicle
export const addVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        vin: z.string().trim().max(24).optional(),
        year: z.number().int().min(1900).max(2100).optional(),
        make: z.string().trim().max(60).optional(),
        model: z.string().trim().max(60).optional(),
        trim: z.string().trim().max(60).optional(),
        engineDisplacement: z.number().optional(),
        cylinderCount: z.number().int().optional(),
        engineCode: z.string().trim().max(60).optional(),
        fuelType: z.string().trim().max(40).optional(),
        isHybrid: z.boolean().optional(),
        drivetrain: z.string().trim().max(20).optional(),
        bodyType: z.string().trim().max(60).optional(),
        nickname: z.string().trim().max(60).optional(),
        mileage: z.number().int().min(0).max(2_000_000).optional(),
      })
      .refine((v) => v.vin || (v.year && v.make && v.model), {
        message: "Enter a VIN, or the year, make and model.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    await ensureProfile(db, context.userId);
    return addVehicleToGarage(db, context.userId, { ...data, vin: normalizeVin(data.vin ?? null) });
  });

export const removeVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => vehicleId.parse(data))
  .handler(async ({ data, context }) =>
    removeVehicleFromGarage(context.supabase as unknown as Db, context.userId, data.vehicleId),
  );

export const makePrimaryVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => vehicleId.parse(data))
  .handler(async ({ data, context }) =>
    setPrimaryVehicle(context.supabase as unknown as Db, context.userId, data.vehicleId),
  );

// ------------------------------------------------------------ vehicle profile
export const getVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => vehicleId.parse(data))
  .handler(async ({ data, context }) => {
    const detail = await getVehicleDetail(
      context.supabase as unknown as Db,
      context.userId,
      data.vehicleId,
    );
    return { ...detail, timeline: buildTimeline(detail) };
  });

export const updateMileage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ vehicleId: z.string().uuid(), mileage: z.number().int().min(0).max(2_000_000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    // Ownership is re-checked here and again by RLS.
    await getVehicleDetail(db, context.userId, data.vehicleId);
    return recordMileage(db, data.vehicleId, data.mileage, "owner", context.userId);
  });

export const addServiceRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        vehicleId: z.string().uuid(),
        serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        mileage: z.number().int().min(0).max(2_000_000).optional(),
        providerName: z.string().trim().max(120).optional(),
        items: z.array(z.string().trim().max(200)).min(1).max(20),
        total: z.number().min(0).optional(),
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    addOwnerServiceRecord(context.supabase as unknown as Db, context.userId, data),
  );

// ---------------------------------------------------------------- Ask Repara
export const askReparaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        vehicleId: z.string().uuid(),
        message: z.string().trim().min(2).max(1500),
        turns: z
          .array(z.object({ role: z.enum(["driver", "repara"]), content: z.string().max(2000) }))
          .max(12)
          .optional(),
        language: z.enum(["en", "es"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const detail = await getVehicleDetail(db, context.userId, data.vehicleId);
    return askRepara({
      detail,
      turns: (data.turns ?? []) as AskTurn[],
      message: data.message,
      language: data.language ?? "en",
    });
  });

// -------------------------------------------- Garage → existing intake flow
/**
 * Prefill for the EXISTING service-request flow, so a signed-in driver never
 * re-enters VIN / year / make / model / mileage / contact details.
 */
export const getServiceRequestPrefill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => vehicleId.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const profile = await ensureProfile(db, context.userId);
    const { data: link } = await db
      .from("garage_vehicles")
      .select("vehicle_id, vehicles(vin, year, make, model, trim, current_mileage, engine_displacement, cylinder_count, engine_code, fuel_type, is_hybrid, drivetrain)")
      .eq("user_id", context.userId)
      .eq("vehicle_id", data.vehicleId)
      .is("ownership_ended_at", null)
      .maybeSingle();

    if (!link?.vehicles) throw new Error("Vehicle not found in your garage.");
    const v = link.vehicles as Record<string, any>;

    return {
      vin: v['vin'] ?? "",
      year: v['year'] ? String(v['year']) : "",
      make: v['make'] ?? "",
      model: v['model'] ?? "",
      trim: v['trim'] ?? "",
      mileage: v['current_mileage'] ? String(v['current_mileage']) : "",
      firstName: profile['first_name'] ?? "",
      lastName: profile['last_name'] ?? "",
      phone: profile['phone'] ?? "",
      email: profile['email'] ?? "",
      preferredLanguage: String(profile['preferred_language'] ?? "en"),
    };
  });

/**
 * Links previously submitted GUEST requests to this account.
 *
 * Deliberately strict: a VIN match alone is never enough (possession of a VIN
 * does not prove ownership), so the request's contact details must also match
 * the account's verified email or saved phone number.
 */
export const claimMyRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as Db;
    const profile = await ensureProfile(db, context.userId);
    const email = String(profile['email'] ?? "").trim().toLowerCase();
    const phoneDigits = String(profile['phone'] ?? "").replace(/\D/g, "").slice(-10);
    if (!email && phoneDigits.length < 10) return { claimed: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const service = supabaseAdmin as unknown as Db;

    const { data: mine } = await service
      .from("garage_vehicles")
      .select("vehicle_id")
      .eq("user_id", context.userId)
      .is("ownership_ended_at", null);

    const vehicleIds = ((mine ?? []) as Record<string, any>[]).map((r) => String(r['vehicle_id']));
    if (!vehicleIds.length) return { claimed: 0 };

    const { data: requests } = await service
      .from("service_requests")
      .select("id, customers(email, phone)")
      .in("vehicle_id", vehicleIds)
      .is("user_id", null)
      .limit(50);

    let claimed = 0;
    for (const request of (requests ?? []) as Record<string, any>[]) {
      const customer = request['customers'] as Record<string, any> | null;
      const customerEmail = String(customer?.['email'] ?? "").trim().toLowerCase();
      const customerPhone = String(customer?.['phone'] ?? "").replace(/\D/g, "").slice(-10);
      const matches =
        (email && customerEmail && email === customerEmail) ||
        (phoneDigits.length === 10 && customerPhone === phoneDigits);
      if (!matches) continue;
      await service.from("service_requests").update({ user_id: context.userId }).eq("id", request['id']);
      claimed += 1;
    }
    return { claimed };
  });
