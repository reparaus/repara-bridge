/**
 * Labor estimating + provider pricing defaults (0027).
 * Labor-time suggestions are source-tagged and only come from rows that exist
 * (licensed / reference / Repara-observed data, or the provider's own
 * default). Nothing is invented here; with no data, callers get an empty list.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Db = { from: (t: string) => any };
const asDb = (c: unknown) => c as Db;
const cents = z.number().int().min(0).max(10_000_000);

export type LaborSource = "reference" | "licensed" | "repara_observed" | "provider_default" | "manual";
export type LaborSuggestion = {
  source: LaborSource;
  hours: number;
  sourceName: string | null;
  isTestData: boolean;
  isWarrantyTime: boolean;
  sampleSize: number | null;
};
export type RepairOperation = { key: string; name: string; related: boolean };
export type PricingSettings = {
  laborRateCents: number | null;
  defaultWarranty: string | null;
  defaultShopSuppliesCents: number | null;
  defaultDisposalFeeCents: number | null;
};

async function myProviderId(ctx: { supabase: unknown; userId: string }): Promise<string | null> {
  const { data } = await asDb(ctx.supabase)
    .from("service_providers")
    .select("id")
    .eq("owner_user_id", ctx.userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

export const getPricingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PricingSettings> => {
    const db = asDb(context.supabase);
    const full = await db
      .from("service_providers")
      .select("labor_rate_cents, default_warranty, default_shop_supplies_cents, default_disposal_fee_cents")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!full.error) {
      const d = full.data ?? {};
      return {
        laborRateCents: d.labor_rate_cents ?? null,
        defaultWarranty: d.default_warranty ?? null,
        defaultShopSuppliesCents: d.default_shop_supplies_cents ?? null,
        defaultDisposalFeeCents: d.default_disposal_fee_cents ?? null,
      };
    }
    // 0027 not applied yet — fall back to the 0026 labor rate only.
    const { data } = await db.from("service_providers").select("labor_rate_cents").eq("owner_user_id", context.userId).limit(1).maybeSingle();
    return { laborRateCents: data?.labor_rate_cents ?? null, defaultWarranty: null, defaultShopSuppliesCents: null, defaultDisposalFeeCents: null };
  });

export const savePricingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        laborRateCents: cents.nullable(),
        defaultWarranty: z.string().trim().max(500).nullable(),
        defaultShopSuppliesCents: cents.nullable(),
        defaultDisposalFeeCents: cents.nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const id = await myProviderId(context);
    if (!id) throw new Error("Set up your provider profile first.");
    const { error } = await asDb(context.supabase)
      .from("service_providers")
      .update({
        labor_rate_cents: data.laborRateCents,
        default_warranty: data.defaultWarranty || null,
        default_shop_supplies_cents: data.defaultShopSuppliesCents,
        default_disposal_fee_cents: data.defaultDisposalFeeCents,
      })
      .eq("id", id);
    if (error) {
      console.error("save pricing", error);
      throw new Error("Couldn't save your pricing settings.");
    }
    return { ok: true };
  });

export const getRepairOperations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ categoryKeys: z.array(z.string().max(60)).max(20) }).parse(d))
  .handler(async ({ data, context }): Promise<RepairOperation[]> => {
    const { data: rows, error } = await asDb(context.supabase)
      .from("repair_operations")
      .select("key, name, category_keys, sort_order")
      .order("sort_order");
    if (error) return [];
    const wanted = new Set(data.categoryKeys);
    return ((rows ?? []) as any[]).map((r) => ({
      key: String(r.key),
      name: String(r.name),
      related: ((r.category_keys ?? []) as string[]).some((k) => wanted.has(k)),
    }));
  });

const vehicleSchema = z.object({
  year: z.number().int().nullable(),
  make: z.string().max(80).nullable(),
  model: z.string().max(80).nullable(),
  trim: z.string().max(80).nullable(),
  engine: z.string().max(120).nullable(),
  drivetrain: z.string().max(20).nullable(),
});

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** A row applies when every field it specifies matches the vehicle. Returns a specificity score, or -1. */
function applicability(row: any, v: z.infer<typeof vehicleSchema>): number {
  let score = 0;
  if (row.year_from != null || row.year_to != null) {
    if (v.year == null) return -1;
    if (row.year_from != null && v.year < row.year_from) return -1;
    if (row.year_to != null && v.year > row.year_to) return -1;
    score++;
  }
  for (const [col, val] of [["make", v.make], ["model", v.model], ["trim", v.trim], ["drivetrain", v.drivetrain]] as const) {
    if (row[col] == null) continue;
    if (norm(row[col]) !== norm(val)) return -1;
    score++;
  }
  if (row.engine != null) {
    if (!norm(v.engine).includes(norm(row.engine))) return -1;
    score++;
  }
  return score;
}

export const getLaborSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ operationKey: z.string().max(80), vehicle: vehicleSchema }).parse(d))
  .handler(async ({ data, context }): Promise<LaborSuggestion[]> => {
    const db = asDb(context.supabase);
    const out: LaborSuggestion[] = [];
    const { data: rows, error } = await db.from("labor_time_estimates").select("*").eq("operation_key", data.operationKey).limit(200);
    if (!error) {
      // Best (most vehicle-specific) row per source type. Generic rows (no vehicle fields) are skipped:
      // suggestions must apply to this vehicle.
      const best = new Map<string, { row: any; score: number }>();
      for (const row of (rows ?? []) as any[]) {
        const score = applicability(row, data.vehicle);
        if (score <= 0) continue;
        const cur = best.get(row.source_type);
        if (!cur || score > cur.score) best.set(row.source_type, { row, score });
      }
      for (const type of ["licensed", "reference", "repara_observed"] as const) {
        const b = best.get(type);
        if (!b) continue;
        out.push({
          source: type,
          hours: Number(b.row.hours),
          sourceName: b.row.source_name ?? null,
          isTestData: Boolean(b.row.is_test_data),
          isWarrantyTime: Boolean(b.row.is_warranty_time),
          sampleSize: b.row.sample_size ?? null,
        });
      }
    }
    const pid = await myProviderId(context);
    if (pid) {
      const def = await db.from("provider_labor_defaults").select("hours").eq("provider_id", pid).eq("operation_key", data.operationKey).maybeSingle();
      if (!def.error && def.data) out.push({ source: "provider_default", hours: Number(def.data.hours), sourceName: null, isTestData: false, isWarrantyTime: false, sampleSize: null });
    }
    return out;
  });

export const saveLaborDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ operationKey: z.string().max(80), hours: z.number().positive().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const pid = await myProviderId(context);
    if (!pid) throw new Error("Set up your provider profile first.");
    const { error } = await asDb(context.supabase)
      .from("provider_labor_defaults")
      .upsert({ provider_id: pid, operation_key: data.operationKey, hours: data.hours, updated_at: new Date().toISOString() });
    if (error) {
      console.error("save labor default", error);
      throw new Error("Couldn't save your default time.");
    }
    return { ok: true };
  });
