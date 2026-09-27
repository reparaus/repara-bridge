/**
 * Provider quotes + request tracking API (0020). All writes go through
 * security-definer SQL functions that check who the caller is; reads rely on
 * RLS. Invited providers only ever receive a contact-free brief.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Db = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };
const asDb = (c: unknown) => c as Db;

function fail(message: string, error: unknown): never {
  console.error(message, error);
  throw new Error(message);
}

/** Map RPC exceptions we raise ourselves to plain messages; hide everything else. */
function friendly(error: any, fallback: string): never {
  const msg = String(error?.message ?? "");
  const known = [
    "You can't quote this request",
    "Enter the quote amounts",
    "Amounts must be positive",
    "This quote can no longer be changed",
    "A quote was already approved for this request",
  ].find((k) => msg.includes(k));
  fail(known ?? fallback, error);
}

export type ProviderQuote = {
  id: string;
  providerId: string;
  version: number;
  partsCents: number;
  laborCents: number;
  feesCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  timeframe: string | null;
  warranty: string | null;
  status: string;
  createdAt: string;
};

const mapQuote = (q: any): ProviderQuote => ({
  id: q.id,
  providerId: q.provider_id,
  version: q.version,
  partsCents: q.parts_cents,
  laborCents: q.labor_cents,
  feesCents: q.fees_cents,
  taxCents: q.tax_cents,
  totalCents: q.total_cents,
  notes: q.notes,
  timeframe: q.timeframe,
  warranty: q.warranty,
  status: q.status,
  createdAt: q.created_at,
});

// ----------------------------------------------------------------- provider

export const listProviderInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = asDb(context.supabase);
    const { data: provider } = await db.from("service_providers").select("id").eq("owner_user_id", context.userId).maybeSingle();
    if (!provider) return { invites: [] };
    const { data, error } = await db
      .from("request_provider_invites")
      .select("request_id, status, created_at")
      .eq("provider_id", provider.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) fail("Couldn't load project requests.", error);
    const briefs = await Promise.all(
      (data ?? []).map(async (i: any) => {
        const { data: b } = await db.rpc("provider_request_brief", { _request_id: i.request_id });
        return b
          ? {
              requestId: String(i.request_id),
              status: String(i.status),
              createdAt: String(i.created_at),
              requestNumber: String(b.request_number ?? ""),
              vehicleLabel: [b.vehicle?.year, b.vehicle?.make, b.vehicle?.model, b.vehicle?.trim].filter(Boolean).join(" "),
              categoryKey: (b.category_key as string | null) ?? null,
              buildName: (b.build?.name as string | undefined) ?? null,
            }
          : null;
      }),
    );
    return { invites: briefs.filter(Boolean) as NonNullable<(typeof briefs)[number]>[] };
  });

export const getProviderBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: b, error } = await asDb(context.supabase).rpc("provider_request_brief", { _request_id: data.requestId });
    if (error) fail("Couldn't load this request.", error);
    if (!b) throw new Error("This request isn't available to you.");
    return {
      id: String(b.id),
      requestNumber: String(b.request_number ?? ""),
      createdAt: String(b.created_at),
      categoryKey: (b.category_key as string | null) ?? null,
      services: (Array.isArray(b.services) ? b.services : []).map((s: any) => String(s?.label ?? s?.key ?? "")).filter(Boolean) as string[],
      notes: (b.notes as string | null) ?? null,
      mileage: (b.mileage as number | null) ?? null,
      zip: (b.zip_code as string | null) ?? null,
      locationType: (b.location_type as string | null) ?? null,
      vehicleLabel: [b.vehicle?.year, b.vehicle?.make, b.vehicle?.model, b.vehicle?.trim].filter(Boolean).join(" "),
      build: b.build
        ? {
            name: String(b.build.name),
            modifications: ((b.build.modifications ?? []) as any[]).map((m: any): { item: string; category: string; detail: string | null; notes: string | null } => ({
              item: String(m.item),
              category: String(m.category),
              detail: m.detail ?? null,
              notes: m.notes ?? null,
            })),
          }
        : null,
      inviteStatus: String(b.invite?.status ?? "invited"),
      providerId: String(b.provider_id ?? ""),
      requestStatus: String(b.status ?? ""),
      quotes: ((b.quotes ?? []) as any[]).map(mapQuote),
    };
  });

const cents = z.number().int().min(0).max(100_000_000);

export const submitProviderQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        requestId: z.string().uuid(),
        partsCents: cents,
        laborCents: cents,
        feesCents: cents,
        taxCents: cents,
        notes: z.string().max(2000).default(""),
        timeframe: z.string().max(200).default(""),
        warranty: z.string().max(500).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await asDb(context.supabase).rpc("submit_provider_quote", {
      _request_id: data.requestId,
      _parts: data.partsCents,
      _labor: data.laborCents,
      _fees: data.feesCents,
      _tax: data.taxCents,
      _notes: data.notes,
      _timeframe: data.timeframe,
      _warranty: data.warranty,
    });
    if (error) friendly(error, "Couldn't send the quote.");
    try {
      const notify = await import("./notify.server");
      await notify.dispatchNotifications(await notify.quoteSentItems(String(id)));
    } catch (e) {
      console.error("[notify] quote delivery failed", e);
    }
    return { id: String(id) };
  });

export const declineProviderInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid(), reason: z.string().max(500).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await asDb(context.supabase).rpc("decline_provider_invite", { _request_id: data.requestId, _reason: data.reason });
    if (error) friendly(error, "Couldn't decline the request.");
    return { ok: true };
  });

// ------------------------------------------------------------------ driver

export const getMyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = asDb(context.supabase);
    const [req, invites, quotes, events] = await Promise.all([
      db
        .from("service_requests")
        .select("id, request_number, status, created_at, service_category_key, vehicle_id, build_id, vehicles(year, make, model, trim)")
        .eq("id", data.requestId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      db.from("request_provider_invites").select("provider_id, status").eq("request_id", data.requestId),
      db.from("provider_quotes").select("*").eq("request_id", data.requestId).order("version", { ascending: false }),
      db.from("request_events").select("kind, actor, provider_id, detail, created_at").eq("request_id", data.requestId).order("created_at"),
    ]);
    if (req.error) fail("Couldn't load your request right now.", req.error);
    if (!req.data) throw new Error("Request not found.");
    const providerIds = [...new Set([...(invites.data ?? []), ...(quotes.data ?? [])].map((r: any) => r.provider_id))];
    const { data: providers } = providerIds.length
      ? await db
          .from("service_providers")
          .select("id, business_name, city, region, offers_mobile, offers_in_shop")
          .in("id", providerIds)
      : { data: [] };
    const r = req.data;
    const v = r.vehicles;
    return {
      id: String(r.id),
      requestNumber: String(r.request_number),
      status: String(r.status),
      createdAt: String(r.created_at),
      categoryKey: r.service_category_key ?? null,
      vehicleId: String(r.vehicle_id),
      buildId: r.build_id ? String(r.build_id) : null,
      vehicleLabel: v ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") : "",
      providers: ((providers ?? []) as any[]).map((p: any): { id: string; name: string; area: string | null; mobile: boolean; inShop: boolean } => ({
        id: String(p.id),
        name: String(p.business_name ?? "Provider"),
        area: [p.city, p.region].filter(Boolean).join(", ") || null,
        mobile: Boolean(p.offers_mobile),
        inShop: Boolean(p.offers_in_shop),
      })),
      invites: ((invites.data ?? []) as any[]).map((i: any): { providerId: string; status: string } => ({ providerId: String(i.provider_id), status: String(i.status) })),
      quotes: ((quotes.data ?? []) as any[]).map(mapQuote),
      events: ((events.data ?? []) as any[]).map((e: any): { kind: string; actor: string; providerId: string | null; createdAt: string } => ({
        kind: String(e.kind),
        actor: String(e.actor),
        providerId: e.provider_id ? String(e.provider_id) : null,
        createdAt: String(e.created_at),
      })),
    };
  });

export const respondToQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ quoteId: z.string().uuid(), action: z.enum(["accept", "decline"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await asDb(context.supabase).rpc("respond_to_provider_quote", { _quote_id: data.quoteId, _action: data.action });
    if (error) friendly(error, "Couldn't update the quote.");
    if (data.action === "accept") {
      try {
        const notify = await import("./notify.server");
        await notify.dispatchNotifications(await notify.notificationIdsFor([`accepted:${data.quoteId}`]));
      } catch (e) {
        console.error("[notify] acceptance delivery failed", e);
      }
    }
    return { ok: true };
  });

// ------------------------------------------------------------------- admin

export const getRequestInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = asDb(context.supabase);
    const [{ data: invites }, { data: providers }, { data: quotes }] = await Promise.all([
      db.from("request_provider_invites").select("provider_id, status").eq("request_id", data.requestId),
      db.from("service_providers").select("id, business_name, city, region, status").eq("status", "active").order("business_name").limit(200),
      db.from("provider_quotes").select("provider_id, version, total_cents, status").eq("request_id", data.requestId),
    ]);
    return {
      invites: ((invites ?? []) as any[]).map((i: any): { providerId: string; status: string } => ({ providerId: String(i.provider_id), status: String(i.status) })),
      providers: ((providers ?? []) as any[]).map((p: any): { id: string; name: string; area: string | null } => ({
        id: String(p.id),
        name: String(p.business_name ?? "Provider"),
        area: [p.city, p.region].filter(Boolean).join(", ") || null,
      })),
      quotes: ((quotes ?? []) as any[]).map((q: any): { providerId: string; version: number; totalCents: number; status: string } => ({
        providerId: String(q.provider_id),
        version: Number(q.version),
        totalCents: Number(q.total_cents),
        status: String(q.status),
      })),
    };
  });

export const inviteProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid(), providerIds: z.array(z.string().uuid()).min(1).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: n, error } = await asDb(context.supabase).rpc("invite_request_providers", {
      _request_id: data.requestId,
      _provider_ids: data.providerIds,
    });
    if (error) fail("Couldn't invite providers.", error);
    return { invited: Number(n ?? 0) };
  });

// ------------------------------------------------- driver: provider matching

export type MatchedProvider = {
  id: string;
  name: string;
  area: string | null;
  mobile: boolean;
  inShop: boolean;
  services: string[];
  servesArea: "yes" | "unconfirmed";
};

const zip3 = (z: unknown) => String(z ?? "").replace(/\D/g, "").slice(0, 3);

/**
 * Active providers that offer at least one of the request's services. Area is
 * "yes" only when a listed postal code shares the driver's ZIP prefix; no
 * distances, rankings, availability or ratings are ever computed.
 */
export const matchProvidersForRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = asDb(context.supabase);
    const { data: req, error } = await db
      .from("service_requests")
      .select("id, zip_code, service_category_key, build_id")
      .eq("id", data.requestId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !req) fail("Couldn't load your request right now.", error);
    const { serviceRequirements } = await import("@/lib/build-catalog");
    const keys = new Set<string>();
    if (req.service_category_key && req.service_category_key !== "other") keys.add(String(req.service_category_key));
    if (req.build_id) {
      const { data: mods } = await db
        .from("build_modifications")
        .select("item, status")
        .eq("build_id", req.build_id)
        .eq("service_request_id", data.requestId);
      for (const k of serviceRequirements(((mods ?? []) as any[]).filter((m) => m.status !== "removed").map((m) => String(m.item)))) keys.add(k);
    }
    const categories = [...keys];
    const { data: rows, error: pErr } = await db
      .from("service_providers")
      .select("id, business_name, city, region, postal_code, offers_mobile, offers_in_shop, provider_services(category_key), provider_service_areas(postal_code)")
      .eq("status", "active")
      .eq("is_demo", false)
      .limit(200);
    if (pErr) fail("Provider availability could not be loaded.", pErr);
    const want = zip3(req.zip_code);
    const providers: MatchedProvider[] = ((rows ?? []) as any[])
      .map((p) => {
        const offered = ((p.provider_services ?? []) as any[]).map((s) => String(s.category_key));
        const services = categories.length ? offered.filter((k) => keys.has(k)) : [];
        const zips = [p.postal_code, ...((p.provider_service_areas ?? []) as any[]).map((a) => a.postal_code)].map(zip3).filter(Boolean);
        return {
          id: String(p.id),
          name: String(p.business_name ?? "Provider"),
          area: [p.city, p.region].filter(Boolean).join(", ") || null,
          mobile: Boolean(p.offers_mobile),
          inShop: Boolean(p.offers_in_shop),
          services,
          servesArea: (want && zips.includes(want) ? "yes" : "unconfirmed") as MatchedProvider["servesArea"],
          outOfArea: Boolean(want && zips.length && !zips.includes(want)),
        };
      })
      .filter((p) => p.services.length > 0 && !p.outOfArea)
      .map(({ outOfArea: _o, ...p }) => p);
    const { data: alert } = await db
      .from("provider_availability_alerts")
      .select("id")
      .eq("service_request_id", data.requestId)
      .eq("status", "active")
      .maybeSingle();
    return { providers, categories, zip: (req.zip_code as string | null) ?? null, alertActive: Boolean(alert) };
  });

export const driverInviteProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid(), providerIds: z.array(z.string().uuid()).min(1).max(5) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: n, error } = await asDb(context.supabase).rpc("driver_invite_providers", {
      _request_id: data.requestId,
      _provider_ids: data.providerIds,
    });
    if (error) {
      const msg = String(error?.message ?? "");
      fail(msg.includes("up to 5") ? "Choose up to 5 providers." : msg.includes("already approved") ? "A quote was already approved for this request." : "Couldn't send your request to providers.", error);
    }
    return { invited: Number(n ?? 0) };
  });

export const createProviderAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid(), categories: z.array(z.string().max(60)).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = asDb(context.supabase);
    const { data: req } = await db
      .from("service_requests")
      .select("id, zip_code, vehicle_id")
      .eq("id", data.requestId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!req) throw new Error("Request not found.");
    const { error } = await db.from("provider_availability_alerts").insert({
      user_id: context.userId,
      service_request_id: req.id,
      vehicle_id: req.vehicle_id,
      category_keys: data.categories,
      zip_code: req.zip_code,
    });
    if (error && error.code !== "23505") fail("Couldn't save your alert.", error);
    return { ok: true };
  });
