/**
 * Provider data access (server-only).
 *
 * Every read/write goes through the signed-in user's Supabase client, so row
 * level security from 0015/0016 is the real boundary: a provider user can only
 * ever touch its own profile, and customers only ever see ACTIVE profiles.
 *
 * Nothing here invents providers, ratings, reviews, certifications, hours or
 * availability: a field stays empty until a real provider fills it in.
 */

type Db = { from: (table: string) => any };

export type ProviderStatus = "draft" | "pending_review" | "active" | "paused" | "archived";

export type ProviderProfile = {
  id: string;
  businessName: string;
  providerKind: string;
  status: ProviderStatus;
  description: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  serviceRadiusMiles: number | null;
  offersMobile: boolean;
  offersInShop: boolean;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  /** Only present when the provider actually configured opening hours. */
  hours: Record<string, string>;
  categories: string[];
  areas: { id: string; city: string | null; region: string | null; postalCode: string | null }[];
};

const PROVIDER_COLUMNS =
  "id, business_name, provider_kind, status, description, city, region, postal_code, service_radius_miles, offers_mobile, offers_in_shop, phone, email, website, logo_url, hours";

function toProfile(
  row: Record<string, any>,
  categories: string[],
  areas: Record<string, any>[],
): ProviderProfile {
  const hours = (row['hours'] ?? {}) as Record<string, string>;
  return {
    id: String(row['id']),
    businessName: String(row['business_name'] ?? ""),
    providerKind: String(row['provider_kind'] ?? "independent_shop"),
    status: (row['status'] ?? "draft") as ProviderStatus,
    description: row['description'] ?? null,
    city: row['city'] ?? null,
    region: row['region'] ?? null,
    postalCode: row['postal_code'] ?? null,
    serviceRadiusMiles: row['service_radius_miles'] ?? null,
    offersMobile: Boolean(row['offers_mobile']),
    offersInShop: Boolean(row['offers_in_shop']),
    phone: row['phone'] ?? null,
    email: row['email'] ?? null,
    website: row['website'] ?? null,
    logoUrl: row['logo_url'] ?? null,
    hours: typeof hours === "object" && hours ? hours : {},
    categories,
    areas: areas.map((area) => ({
      id: String(area['id']),
      city: area['city'] ?? null,
      region: area['region'] ?? null,
      postalCode: area['postal_code'] ?? null,
    })),
  };
}

async function loadRelations(db: Db, providerId: string) {
  const [{ data: services }, { data: areas }] = await Promise.all([
    db.from("provider_services").select("category_key").eq("provider_id", providerId),
    db
      .from("provider_service_areas")
      .select("id, city, region, postal_code")
      .eq("provider_id", providerId),
  ]);
  return {
    categories: ((services ?? []) as Record<string, any>[]).map((r) => String(r['category_key'])),
    areas: (areas ?? []) as Record<string, any>[],
  };
}

/** The signed-in user's own provider profile, or null when they have none. */
export async function getMyProvider(db: Db, userId: string): Promise<ProviderProfile | null> {
  const { data } = await db
    .from("service_providers")
    .select(PROVIDER_COLUMNS)
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const relations = await loadRelations(db, String(data['id']));
  return toProfile(data, relations.categories, relations.areas);
}

export type ProviderInput = {
  businessName: string;
  providerKind: string;
  description?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  serviceRadiusMiles?: number;
  offersMobile?: boolean;
  offersInShop?: boolean;
  categories?: string[];
  /** Additional ZIP codes the provider covers, beyond their own location. */
  areaPostalCodes?: string[];
  hours?: Record<string, string>;
};

/**
 * Creates or updates the signed-in user's provider profile.
 *
 * A new profile starts as `draft` — it is never published automatically, so a
 * half-finished profile can't appear to customers.
 */
export async function saveMyProvider(
  db: Db,
  userId: string,
  input: ProviderInput,
): Promise<ProviderProfile> {
  const existing = await getMyProvider(db, userId);

  const fields: Record<string, unknown> = {
    business_name: input.businessName,
    provider_kind: input.providerKind,
    description: input.description ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    website: input.website ?? null,
    logo_url: input.logoUrl ?? null,
    city: input.city ?? null,
    region: input.region ?? null,
    postal_code: input.postalCode ?? null,
    service_radius_miles: input.serviceRadiusMiles ?? null,
    offers_mobile: input.offersMobile ?? false,
    offers_in_shop: input.offersInShop ?? true,
    hours: input.hours ?? {},
  };

  let providerId = existing?.id ?? null;

  if (providerId) {
    const { error } = await db.from("service_providers").update(fields).eq("id", providerId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await db
      .from("service_providers")
      .insert({ ...fields, owner_user_id: userId, status: "draft" })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not save your provider profile.");
    providerId = String(data['id']);
  }

  // Services: replace the set the provider selected. Categories come from the
  // shared taxonomy, so there is no second provider-only category system.
  if (input.categories) {
    // Keep existing rows (and their preset pricing); only add/remove the diff.
    const wanted = [...new Set(input.categories)];
    const { data: existingRows } = await db.from("provider_services").select("category_key").eq("provider_id", providerId);
    const have = new Set(((existingRows ?? []) as Record<string, unknown>[]).map((r) => String(r['category_key'])));
    const removed = [...have].filter((k) => !wanted.includes(k));
    if (removed.length) await db.from("provider_services").delete().eq("provider_id", providerId).in("category_key", removed);
    const rows = wanted.filter((k) => !have.has(k)).map((key) => ({ provider_id: providerId, category_key: key }));
    if (rows.length) {
      const { error } = await db.from("provider_services").insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  if (input.areaPostalCodes) {
    await db.from("provider_service_areas").delete().eq("provider_id", providerId);
    const rows = [...new Set(input.areaPostalCodes.filter(Boolean))].map((zip) => ({
      provider_id: providerId,
      postal_code: zip,
      region: input.region ?? null,
    }));
    if (rows.length) {
      const { error } = await db.from("provider_service_areas").insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  const relations = await loadRelations(db, providerId!);
  const { data: row } = await db
    .from("service_providers")
    .select(PROVIDER_COLUMNS)
    .eq("id", providerId)
    .maybeSingle();
  return toProfile(row ?? {}, relations.categories, relations.areas);
}

/** How complete a profile is, used to guide the provider — never to rank them. */
export function profileCompletion(profile: ProviderProfile) {
  const checks: { label: string; done: boolean }[] = [
    { label: "Business name", done: Boolean(profile.businessName) },
    { label: "Provider type", done: Boolean(profile.providerKind) },
    { label: "Description", done: Boolean(profile.description) },
    { label: "Phone or email", done: Boolean(profile.phone || profile.email) },
    { label: "Location", done: Boolean(profile.city || profile.postalCode) },
    { label: "Services offered", done: profile.categories.length > 0 },
    {
      label: "Mobile or in-shop",
      done: profile.offersMobile || profile.offersInShop,
    },
  ];
  const done = checks.filter((c) => c.done).length;
  return { checks, done, total: checks.length, percent: Math.round((done / checks.length) * 100) };
}

/**
 * Status changes a provider may make themselves.
 *
 * Publishing goes to `pending_review`, never straight to `active`: only an
 * admin activates a profile, so customer-facing discovery stays intentional.
 */
export async function setMyProviderStatus(
  db: Db,
  userId: string,
  action: "submit" | "pause" | "resume",
): Promise<{ status: ProviderStatus }> {
  const existing = await getMyProvider(db, userId);
  if (!existing) throw new Error("You don't have a provider profile yet.");

  let status: ProviderStatus;
  if (action === "submit") status = "pending_review";
  else if (action === "pause") status = "paused";
  else status = existing.status === "paused" ? "pending_review" : existing.status;
  if (action === "resume" && existing.status === "paused") {
    // A previously reviewed profile returns to review rather than going live
    // silently; nothing about the provider's data is lost while paused.
    status = "pending_review";
  }

  const { error } = await db
    .from("service_providers")
    .update({ status })
    .eq("id", existing.id)
    .eq("owner_user_id", userId);
  if (error) throw new Error(error.message);
  return { status };
}

/** Public provider profile. RLS only returns ACTIVE, non-demo providers. */
export async function getPublicProvider(db: Db, providerId: string) {
  const { data } = await db
    .from("service_providers")
    .select(PROVIDER_COLUMNS)
    .eq("id", providerId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  const relations = await loadRelations(db, providerId);
  const profile = toProfile(data, relations.categories, relations.areas);
  // Customer-facing shape: no internal fields, no fabricated signals.
  return {
    id: profile.id,
    businessName: profile.businessName,
    providerKind: profile.providerKind,
    description: profile.description,
    city: profile.city,
    region: profile.region,
    postalCode: profile.postalCode,
    serviceRadiusMiles: profile.serviceRadiusMiles,
    offersMobile: profile.offersMobile,
    offersInShop: profile.offersInShop,
    phone: profile.phone,
    email: profile.email,
    website: profile.website,
    logoUrl: profile.logoUrl,
    hours: profile.hours,
    categories: profile.categories,
    areas: profile.areas,
  };
}

/**
 * Real active providers only, optionally narrowed by service category and ZIP.
 * No ranking, no scoring, no "best" — insertion-independent alphabetical order.
 */
export async function findActiveProviders(
  db: Db,
  filter: { categoryKey?: string; postalCode?: string },
) {
  let ids: string[] | null = null;

  if (filter.categoryKey) {
    const { data } = await db
      .from("provider_services")
      .select("provider_id")
      .eq("category_key", filter.categoryKey);
    ids = ((data ?? []) as Record<string, any>[]).map((r) => String(r['provider_id']));
    if (!ids.length) return [];
  }

  if (filter.postalCode) {
    const { data } = await db
      .from("provider_service_areas")
      .select("provider_id")
      .eq("postal_code", filter.postalCode);
    const areaIds = ((data ?? []) as Record<string, any>[]).map((r) => String(r['provider_id']));
    // A ZIP-specific service area narrows the list; providers who haven't
    // listed ZIPs are kept, because absence of data is not absence of coverage.
    if (areaIds.length) ids = ids ? ids.filter((id) => areaIds.includes(id)) : null;
  }

  let query = db
    .from("service_providers")
    .select(PROVIDER_COLUMNS)
    .eq("status", "active")
    .order("business_name", { ascending: true })
    .limit(50);
  if (ids) query = query.in("id", ids);

  const { data } = await query;
  const rows = (data ?? []) as Record<string, any>[];

  const providers = await Promise.all(
    rows.map(async (row) => {
      const relations = await loadRelations(db, String(row['id']));
      return {
        id: String(row['id']),
        businessName: String(row['business_name'] ?? ""),
        providerKind: String(row['provider_kind'] ?? ""),
        description: row['description'] ?? null,
        city: row['city'] ?? null,
        region: row['region'] ?? null,
        offersMobile: Boolean(row['offers_mobile']),
        offersInShop: Boolean(row['offers_in_shop']),
        logoUrl: row['logo_url'] ?? null,
        categories: relations.categories,
      };
    }),
  );
  return providers;
}

/** Requests intentionally routed to this provider. No dispatch, no bidding. */
export async function listProviderRequests(db: Db, providerId: string) {
  const { data } = await db
    .from("service_requests")
    .select(
      "id, request_number, status, service_category_key, created_at, concern, vehicles(year, make, model, trim)",
    )
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(50);

  return ((data ?? []) as Record<string, any>[]).map((row) => {
    const vehicle = (row['vehicles'] ?? null) as Record<string, any> | null;
    return {
      id: String(row['id']),
      requestNumber: String(row['request_number'] ?? ""),
      status: String(row['status'] ?? "new"),
      categoryKey: row['service_category_key'] ?? null,
      createdAt: String(row['created_at'] ?? ""),
      concern: row['concern'] ?? null,
      vehicleLabel: vehicle
        ? [vehicle['year'], vehicle['make'], vehicle['model'], vehicle['trim']]
            .filter(Boolean)
            .join(" ")
        : null,
    };
  });
}
