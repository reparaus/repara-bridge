/**
 * Repara Garage — consumer vehicle lifecycle (SERVER ONLY).
 *
 * API-first on purpose: every Garage capability lives here behind a plain
 * function so a future native app can call the same Supabase backend without
 * re-implementing anything from the web UI.
 *
 * Rules:
 *  - ONE canonical vehicle (public.vehicles) shared with service requests and
 *    the shop Job Workspace. No consumer-only vehicle table.
 *  - Possession of a VIN never proves ownership: access is always through an
 *    active public.garage_vehicles link (enforced again by RLS).
 *  - Nothing is invented. Maintenance and recall information is only ever
 *    reported when a real source backs it.
 */

import { fetchNhtsaRecalls } from "@/lib/knowledge/nhtsa.server";
import { upsertKnowledge } from "@/lib/knowledge/knowledge.server";

type Db = { from: (table: string) => any };
type Row = Record<string, any>;

const RECALL_CACHE_HOURS = 24;

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export function normalizeVin(vin: string | null | undefined): string | null {
  const clean = String(vin ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return clean.length ? clean : null;
}

/**
 * The account's email ONLY when the auth provider has confirmed it. Profile
 * email/phone are self-entered and never prove who submitted a guest request.
 */
export async function verifiedAccountEmail(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  const user = data?.user;
  if (error || !user?.email || !user.email_confirmed_at) return null;
  return user.email.trim().toLowerCase();
}

function maskVin(vin: string | null): string | null {
  const clean = normalizeVin(vin);
  if (!clean) return null;
  return `••••••${clean.slice(-4)}`;
}

export type VehicleSummary = {
  id: string;
  nickname: string | null;
  label: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  drivetrain: string | null;
  vinMasked: string | null;
  currentMileage: number | null;
  mileageUpdatedAt: string | null;
  /** Where the current mileage came from — never shown as fact when estimated. */
  mileageSource: string | null;
  mileageConfidence: string | null;
  isPrimary: boolean;
  status: { tone: "good" | "attention" | "unknown"; label: string };
  nextService: { label: string; detail: string } | null;
  recallCount: number;
};

function vehicleLabel(row: Row): string {
  return [row['year'], row['make'], row['model'], row['trim']].filter(Boolean).join(" ") || "Vehicle";
}

function engineLabel(row: Row): string | null {
  const parts = [
    row['engine_displacement'] ? `${row['engine_displacement']}L` : null,
    row['cylinder_count'] ? `${row['cylinder_count']}-cyl` : null,
    row['is_hybrid'] ? "Hybrid" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// --------------------------------------------------------------- profile
export async function ensureProfile(
  db: Db,
  userId: string,
  fallback: { email?: string | null; firstName?: string | null } = {},
) {
  const { data } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) return data as Row;

  const { data: created } = await db
    .from("profiles")
    .insert({
      id: userId,
      email: fallback.email ?? null,
      first_name: fallback.firstName ?? null,
    })
    .select("*")
    .maybeSingle();
  return (created ?? { id: userId, preferred_language: "en" }) as Row;
}

export async function updateProfile(
  db: Db,
  userId: string,
  input: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    preferredLanguage?: string | null;
    notificationPreferences?: Record<string, boolean> | null;
  },
) {
  const patch: Row = { updated_at: new Date().toISOString() };
  if (input.firstName !== undefined) patch['first_name'] = input.firstName;
  if (input.lastName !== undefined) patch['last_name'] = input.lastName;
  if (input.phone !== undefined) patch['phone'] = input.phone;
  if (input.preferredLanguage) patch['preferred_language'] = input.preferredLanguage;
  if (input.notificationPreferences) {
    // Merge so provider/email preferences saved elsewhere are kept.
    const { data: current } = await db.from("profiles").select("notification_preferences").eq("id", userId).maybeSingle();
    patch['notification_preferences'] = {
      ...(((current as Row | null)?.['notification_preferences'] ?? {}) as Record<string, boolean>),
      ...input.notificationPreferences,
    };
  }

  const { error } = await db.from("profiles").update(patch).eq("id", userId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

// ------------------------------------------------------- vehicle knowledge
/**
 * Source-backed vehicle knowledge, reusing the SAME repair_knowledge store the
 * technician workspace uses. Cached for a day so opening a Garage screen does
 * not hit NHTSA on every render, and never worded as "open" or "unrepaired":
 * year/make/model applicability does not establish VIN remedy status.
 */
export async function getVehicleRecalls(vehicle: {
  year: number | null;
  make: string | null;
  model: string | null;
}) {
  const { year, make, model } = vehicle;
  if (!year || !make || !model) return [];

  const db = await admin();
  const cutoff = new Date(Date.now() - RECALL_CACHE_HOURS * 3600_000).toISOString();

  const read = async () => {
    const { data } = await db
      .from("repair_knowledge")
      .select("id, title, summary, conditions, source_record_id, source_url, published_at, last_synced_at")
      .eq("information_type", "recall")
      .eq("year_start", year)
      .ilike("make", make)
      .ilike("model", model)
      .order("published_at", { ascending: false })
      .limit(25);
    return (data ?? []) as Row[];
  };

  let rows = await read();
  const fresh = rows.some((r) => String(r['last_synced_at'] ?? "") > cutoff);

  if (!fresh) {
    try {
      const records = await fetchNhtsaRecalls({ year, make, model });
      if (records.length) {
        await upsertKnowledge(db as any, records);
        rows = await read();
      }
    } catch (error) {
      // An NHTSA outage must never break the Garage — stale or empty is fine.
      console.error("[garage] recall sync failed", (error as Error).message);
    }
  }

  return rows.map((r) => ({
    id: String(r['id']),
    campaign: r['source_record_id'] ? String(r['source_record_id']) : null,
    title: String(r['title'] ?? ""),
    summary: r['summary'] ? String(r['summary']) : null,
    details: r['conditions'] ? String(r['conditions']) : null,
    sourceUrl: r['source_url'] ? String(r['source_url']) : "https://www.nhtsa.gov/recalls",
    publishedAt: r['published_at'] ? String(r['published_at']) : null,
  }));
}

// ------------------------------------------------------------- maintenance
async function maintenanceFor(db: Db, vehicleId: string) {
  const { data } = await db
    .from("vehicle_maintenance_state")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("estimated_due_mileage", { ascending: true })
    .limit(20);
  return (data ?? []) as Row[];
}

function nextServiceFrom(states: Row[], currentMileage: number | null) {
  const upcoming = states
    .filter((s) => s['status'] !== "up_to_date" && s['status'] !== "unknown")
    .sort((a, b) => Number(a['estimated_due_mileage'] ?? 1e9) - Number(b['estimated_due_mileage'] ?? 1e9))[0];
  if (!upcoming) return null;

  const due = Number(upcoming['estimated_due_mileage'] ?? 0);
  const remaining = currentMileage && due ? due - currentMileage : null;
  const detail =
    remaining !== null && remaining > 0
      ? `approximately ${remaining.toLocaleString()} mi`
      : upcoming['status'] === "overdue"
        ? "Overdue"
        : upcoming['status'] === "due"
          ? "Due now"
          : "Coming up";
  return { label: String(upcoming['service_label']), detail };
}

// ------------------------------------------------------------------ garage
export async function listGarage(db: Db, userId: string) {
  const { data } = await db
    .from("garage_vehicles")
    .select("id, nickname, is_primary, relationship, vehicle_id, vehicles(*)")
    .eq("user_id", userId)
    .is("ownership_ended_at", null)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const links = ((data ?? []) as Row[]).filter((l) => l['vehicles']);

  const vehicles: VehicleSummary[] = [];
  for (const link of links) {
    const v = link['vehicles'] as Row;
    const states = await maintenanceFor(db, String(v['id']));
    const recalls = await getVehicleRecalls({
      year: v['year'] ?? null,
      make: v['make'] ?? null,
      model: v['model'] ?? null,
    });
    const needsAttention =
      recalls.length > 0 || states.some((s) => s['status'] === "due" || s['status'] === "overdue");

    vehicles.push({
      id: String(v['id']),
      nickname: link['nickname'] ? String(link['nickname']) : null,
      label: vehicleLabel(v),
      year: v['year'] ?? null,
      make: v['make'] ?? null,
      model: v['model'] ?? null,
      trim: v['trim'] ?? null,
      engine: engineLabel(v),
      drivetrain: v['drivetrain'] ?? null,
      vinMasked: maskVin(v['vin'] ?? null),
      currentMileage: v['current_mileage'] ?? v['mileage'] ?? null,
      mileageUpdatedAt: v['mileage_updated_at'] ?? null,
      mileageSource: v['current_mileage_source'] ?? null,
      mileageConfidence: v['current_mileage_confidence'] ?? null,
      isPrimary: Boolean(link['is_primary']),
      status: needsAttention
        ? { tone: "attention", label: "Something to review" }
        : { tone: "good", label: "Looking good" },
      nextService: nextServiceFrom(states, v['current_mileage'] ?? null),
      recallCount: recalls.length,
    });
  }
  return vehicles;
}

// -------------------------------------------------------------- add vehicle
export type AddVehicleInput = {
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engineDisplacement?: number | null;
  cylinderCount?: number | null;
  engineCode?: string | null;
  fuelType?: string | null;
  isHybrid?: boolean | null;
  drivetrain?: string | null;
  bodyType?: string | null;
  nickname?: string | null;
  mileage?: number | null;
  decodedMetadata?: Record<string, unknown> | null;
};

export async function addVehicleToGarage(db: Db, userId: string, input: AddVehicleInput) {
  const vin = normalizeVin(input.vin);
  const service = await admin();

  // Already in this driver's garage? Return it instead of duplicating.
  if (vin) {
    const { data: mine } = await service
      .from("garage_vehicles")
      .select("vehicle_id, vehicles!inner(vin_normalized)")
      .eq("user_id", userId)
      .is("ownership_ended_at", null)
      .eq("vehicles.vin_normalized", vin)
      .maybeSingle();
    if (mine?.vehicle_id) {
      if (input.mileage) await recordMileage(service, String(mine.vehicle_id), input.mileage, "owner", userId);
      return { vehicleId: String(mine.vehicle_id), reused: true as const };
    }
  }

  // A vehicle row may already exist from a GUEST service request, or from this
  // driver removing the car earlier. A VIN match alone never proves ownership,
  // so an existing row is reused only when no OTHER account has ever had it in
  // a garage (no silent hand-over between owners) AND either this driver had it
  // before, or its guest contact email equals this account's CONFIRMED email.
  // Otherwise the driver gets a fresh vehicle record.
  let vehicleId: string | null = null;
  let adopted: Row | null = null;
  if (vin) {
    const { data: candidates } = await service
      .from("vehicles")
      .select("*, customers(email)")
      .eq("vin_normalized", vin)
      .order("created_at", { ascending: true })
      .limit(10);

    let accountEmail: string | null | undefined;
    for (const candidate of (candidates ?? []) as Row[]) {
      const { data: links } = await service
        .from("garage_vehicles")
        .select("user_id")
        .eq("vehicle_id", candidate['id']);
      const linkUsers = ((links ?? []) as Row[]).map((l) => String(l['user_id']));
      if (linkUsers.some((id) => id !== userId)) continue;

      let proven = linkUsers.includes(userId);
      if (!proven) {
        if (accountEmail === undefined) accountEmail = await verifiedAccountEmail(userId);
        const customerEmail = String(candidate['customers']?.['email'] ?? "").trim().toLowerCase();
        proven = Boolean(accountEmail && customerEmail && customerEmail === accountEmail);
      }
      if (proven) {
        vehicleId = String(candidate['id']);
        adopted = candidate;
        break;
      }
    }
  }

  const fields: Row = {
    vin: vin,
    year: input.year ?? null,
    make: input.make ?? null,
    model: input.model ?? null,
    trim: input.trim ?? null,
    engine_displacement: input.engineDisplacement ?? null,
    cylinder_count: input.cylinderCount ?? null,
    engine_code: input.engineCode ?? null,
    fuel_type: input.fuelType ?? null,
    is_hybrid: input.isHybrid ?? null,
    drivetrain: input.drivetrain ?? "unknown",
    body_type: input.bodyType ?? null,
    decoded_vehicle_metadata: input.decodedMetadata ?? {},
    updated_at: new Date().toISOString(),
  };

  if (vehicleId && adopted) {
    // Keep the adopted record's identity; only fill details it is missing.
    const patch: Row = {};
    for (const [key, value] of Object.entries(fields)) {
      if (key === "vin" || key === "updated_at") continue;
      const current = adopted[key];
      const missing =
        current === null ||
        current === undefined ||
        (key === "drivetrain" && current === "unknown") ||
        (key === "decoded_vehicle_metadata" && !Object.keys(current ?? {}).length);
      const useful = value !== null && value !== undefined && !(key === "drivetrain" && value === "unknown");
      if (missing && useful) patch[key] = value;
    }
    if (Object.keys(patch).length) {
      await service
        .from("vehicles")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", vehicleId);
    }
  } else {
    const { data: created, error } = await service
      .from("vehicles")
      .insert(fields)
      .select("id")
      .maybeSingle();
    if (error || !created?.id) throw new Error("Could not save this vehicle.");
    vehicleId = String(created.id);
  }

  const { data: existingGarage } = await service
    .from("garage_vehicles")
    .select("id")
    .eq("user_id", userId)
    .is("ownership_ended_at", null)
    .limit(1);

  const { error: linkError } = await service.from("garage_vehicles").insert({
    user_id: userId,
    vehicle_id: vehicleId,
    relationship: "owner",
    nickname: input.nickname ?? null,
    is_primary: !existingGarage?.length,
    ownership_started_at: new Date().toISOString(),
  });
  if (linkError) throw new Error("Could not add this vehicle to your garage.");

  if (input.mileage) await recordMileage(service, vehicleId, input.mileage, "owner", userId);

  return { vehicleId, reused: false as const };
}

export async function removeVehicleFromGarage(_db: Db, userId: string, vehicleId: string) {
  // Ending ownership is server-only (0029): drivers can't edit
  // ownership_ended_at, so an ended link can never be reactivated by them.
  const service = await admin();
  const { error } = await service
    .from("garage_vehicles")
    .update({ ownership_ended_at: new Date().toISOString(), is_primary: false })
    .eq("user_id", userId)
    .eq("vehicle_id", vehicleId)
    .is("ownership_ended_at", null);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function setPrimaryVehicle(db: Db, userId: string, vehicleId: string) {
  await db.from("garage_vehicles").update({ is_primary: false }).eq("user_id", userId);
  await db
    .from("garage_vehicles")
    .update({ is_primary: true })
    .eq("user_id", userId)
    .eq("vehicle_id", vehicleId);
  return { ok: true as const };
}

// ------------------------------------------------------------------ mileage
export async function recordMileage(
  db: Db,
  vehicleId: string,
  mileage: number,
  // Drivers can only ever record owner-reported readings; the database
  // (0018 guard_mileage_reading) enforces this too.
  source: "owner" | "service_record" | "intake",
  userId: string | null,
) {
  const { error } = await db.from("vehicle_mileage_history").insert({
    vehicle_id: vehicleId,
    mileage,
    source,
    recorded_by: userId,
  });
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

// --------------------------------------------------------- vehicle profile
export async function getVehicleDetail(db: Db, userId: string, vehicleId: string) {
  const { data: link } = await db
    .from("garage_vehicles")
    .select("id, nickname, is_primary, vehicle_id, vehicles(*)")
    .eq("user_id", userId)
    .eq("vehicle_id", vehicleId)
    .is("ownership_ended_at", null)
    .maybeSingle();

  if (!link?.vehicles) throw new Error("Vehicle not found in your garage.");
  const v = link.vehicles as Row;

  const [{ data: mileage }, { data: records }, states, recalls, { data: requests }] = await Promise.all([
    db
      .from("vehicle_mileage_history")
      // "*" keeps working before and after 0018 adds confidence/metadata.
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("recorded_at", { ascending: false })
      .limit(24),
    db
      .from("service_records")
      .select(
        "id, service_date, performed_at, mileage, provider_name, provider_type, source, verification_status, total_amount, summary, notes, service_record_items(id, description, category, service_type)",
      )
      .eq("vehicle_id", vehicleId)
      .order("performed_at", { ascending: false })
      .limit(50),
    maintenanceFor(db, vehicleId),
    getVehicleRecalls({ year: v['year'] ?? null, make: v['make'] ?? null, model: v['model'] ?? null }),
    db
      .from("service_requests")
      .select("id, request_number, service_category, status, created_at")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const history = ((records ?? []) as Row[]).map((r) => ({
    id: String(r['id']),
    date: String(r['service_date'] ?? r['performed_at'] ?? "").slice(0, 10),
    mileage: r['mileage'] ?? null,
    providerName: r['provider_name'] ? String(r['provider_name']) : null,
    source: String(r['source'] ?? "repara_verified"),
    verified: String(r['source'] ?? "") === "repara_verified",
    total: r['total_amount'] ?? null,
    summary: r['summary'] ? String(r['summary']) : r['notes'] ? String(r['notes']) : null,
    items: ((r['service_record_items'] ?? []) as Row[]).map((i) => String(i['description'] ?? "")),
  }));

  const needsAttention =
    recalls.length > 0 || states.some((s) => s['status'] === "due" || s['status'] === "overdue");

  const mileageReadings = ((mileage ?? []) as Row[]).map((m) => ({
    id: String(m['id']),
    mileage: Number(m['mileage']),
    recordedAt: String(m['recorded_at']),
    source: String(m['source']),
    confidence: m['confidence'] ? String(m['confidence']) : null,
  }));

  return {
    vehicle: {
      id: String(v['id']),
      label: vehicleLabel(v),
      nickname: link.nickname ? String(link.nickname) : null,
      year: v['year'] ?? null,
      make: v['make'] ?? null,
      model: v['model'] ?? null,
      trim: v['trim'] ?? null,
      engine: engineLabel(v),
      engineCode: v['engine_code'] ?? null,
      fuelType: v['fuel_type'] ?? null,
      drivetrain: v['drivetrain'] ?? null,
      bodyType: v['body_type'] ?? null,
      vinMasked: maskVin(v['vin'] ?? null),
      currentMileage: v['current_mileage'] ?? v['mileage'] ?? null,
      mileageUpdatedAt: v['mileage_updated_at'] ?? null,
      mileageSource: v['current_mileage_source'] ?? null,
      mileageConfidence: v['current_mileage_confidence'] ?? null,
    },
    status: needsAttention
      ? { tone: "attention" as const, label: "Something to review" }
      : { tone: "good" as const, label: "Looking good" },
    nextService: nextServiceFrom(states, v['current_mileage'] ?? null),
    maintenance: states.map((s) => ({
      id: String(s['id']),
      label: String(s['service_label']),
      status: String(s['status']),
      dueMileage: s['estimated_due_mileage'] ?? null,
      dueDate: s['estimated_due_date'] ?? null,
      lastCompletedMileage: s['last_completed_mileage'] ?? null,
      lastCompletedDate: s['last_completed_date'] ?? null,
      source: s['source'] ? String(s['source']) : null,
    })),
    history,
    mileageReadings,
    recalls,
    requests: ((requests ?? []) as Row[]).map((r) => ({
      id: String(r['id']),
      requestNumber: String(r['request_number'] ?? ""),
      category: String(r['service_category'] ?? ""),
      status: String(r['status'] ?? ""),
      createdAt: String(r['created_at']),
    })),
  };
}

/**
 * Unified vehicle timeline — meaningful OWNERSHIP events only. Internal
 * workflow events are deliberately excluded from the consumer view.
 */
export function buildTimeline(detail: Awaited<ReturnType<typeof getVehicleDetail>>) {
  type Event = {
    kind: "service" | "request" | "recall" | "mileage";
    date: string;
    mileage: number | null;
    title: string;
    detail: string | null;
  };
  const events: Event[] = [];

  for (const record of detail.history) {
    events.push({
      kind: "service",
      date: record.date,
      mileage: record.mileage,
      title: record.items.length ? record.items.join(" · ") : (record.summary ?? "Service performed"),
      detail: record.providerName,
    });
  }
  for (const request of detail.requests) {
    events.push({
      kind: "request",
      date: request.createdAt.slice(0, 10),
      mileage: null,
      title: "Service request submitted",
      detail: request.requestNumber || null,
    });
  }
  for (const recall of detail.recalls) {
    if (!recall.publishedAt) continue;
    events.push({
      kind: "recall",
      date: recall.publishedAt.slice(0, 10),
      mileage: null,
      title: "Manufacturer recall information",
      detail: recall.campaign,
    });
  }

  return events.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);
}

// ------------------------------------------------- owner-entered history
export async function addOwnerServiceRecord(
  db: Db,
  userId: string,
  input: {
    vehicleId: string;
    serviceDate: string;
    mileage?: number | null;
    providerName?: string | null;
    items: string[];
    total?: number | null;
    notes?: string | null;
  },
) {
  const { data: record, error } = await db
    .from("service_records")
    .insert({
      vehicle_id: input.vehicleId,
      service_date: input.serviceDate,
      performed_at: `${input.serviceDate}T12:00:00Z`,
      mileage: input.mileage ?? null,
      provider_name: input.providerName ?? null,
      provider_type: "independent",
      // Owner-entered work is NEVER labelled verified.
      source: "owner_provided",
      verification_status: "unverified",
      total_amount: input.total ?? null,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (error || !record?.id) throw new Error(error?.message ?? "Could not save this service record.");

  const items = input.items.filter((i) => i.trim().length);
  if (items.length) {
    await db.from("service_record_items").insert(
      items.map((description, position) => ({
        service_record_id: record.id,
        description,
        item_type: "labor",
        status: "completed",
        position,
      })),
    );
  }

  if (input.mileage) {
    await recordMileage(db, input.vehicleId, input.mileage, "service_record", userId);
  }

  return { ok: true as const, id: String(record.id) };
}

// -------------------------------------------------- recent activity (home)
/**
 * Meaningful OWNERSHIP activity across every vehicle in the garage: completed
 * services, submitted requests and mileage updates. Internal workflow events
 * are deliberately excluded.
 */
export async function listRecentActivity(db: Db, vehicleIds: string[]) {
  if (!vehicleIds.length) return [];

  const [{ data: records }, { data: requests }, { data: mileage }] = await Promise.all([
    db
      .from("service_records")
      .select("id, vehicle_id, service_date, performed_at, mileage, provider_name, source, summary")
      .in("vehicle_id", vehicleIds)
      .order("performed_at", { ascending: false })
      .limit(8),
    db
      .from("service_requests")
      .select("id, vehicle_id, request_number, service_category, status, created_at")
      .in("vehicle_id", vehicleIds)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("vehicle_mileage_history")
      .select("id, vehicle_id, mileage, recorded_at, source")
      .in("vehicle_id", vehicleIds)
      .order("recorded_at", { ascending: false })
      .limit(5),
  ]);

  type Activity = {
    id: string;
    vehicleId: string;
    kind: "service" | "request" | "mileage";
    date: string;
    title: string;
    detail: string | null;
    /** Provenance label — owner records are never presented as verified. */
    source: string | null;
  };

  const events: Activity[] = [];

  for (const r of (records ?? []) as Row[]) {
    events.push({
      id: String(r['id']),
      vehicleId: String(r['vehicle_id']),
      kind: "service",
      date: String(r['service_date'] ?? r['performed_at'] ?? "").slice(0, 10),
      title: r['summary'] ? String(r['summary']).slice(0, 120) : "Service performed",
      detail: [
        r['provider_name'] ? String(r['provider_name']) : null,
        r['mileage'] ? `${Number(r['mileage']).toLocaleString()} mi` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
      source: String(r['source'] ?? "owner_provided"),
    });
  }

  for (const r of (requests ?? []) as Row[]) {
    events.push({
      id: String(r['id']),
      vehicleId: String(r['vehicle_id']),
      kind: "request",
      date: String(r['created_at']).slice(0, 10),
      title: "Service request submitted",
      detail: [r['request_number'] ? String(r['request_number']) : null, String(r['status'] ?? "")]
        .filter(Boolean)
        .join(" · ") || null,
      source: null,
    });
  }

  for (const m of (mileage ?? []) as Row[]) {
    events.push({
      id: String(m['id']),
      vehicleId: String(m['vehicle_id']),
      kind: "mileage",
      date: String(m['recorded_at']).slice(0, 10),
      title: `Mileage updated to ${Number(m['mileage']).toLocaleString()} mi`,
      detail: null,
      source: null,
    });
  }

  return events.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
}
