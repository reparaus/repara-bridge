/**
 * Builds API. Every call runs as the signed-in driver, so RLS (0019) limits
 * access to builds on vehicles in their own Garage. A build is a plan and
 * never changes the actual vehicle record.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { normalizeVisual, visualConfigSchema, type VisualConfig } from "@/lib/build3d/visual-config";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildItem, isBuildItem, PRESETS, serviceRequirements } from "@/lib/build-catalog";

type Db = { from: (table: string) => any };

export type BuildMod = {
  id: string;
  category: string;
  item: string;
  label: string;
  detail: string | null;
  notes: string | null;
  status: string;
  compatibility: string;
  source: string;
  serviceRequestId: string | null;
};
export type BuildSummary = {
  id: string;
  vehicleId: string;
  name: string;
  preset: string;
  isActive: boolean;
  budgetCents: number | null;
  notes: string | null;
  visualConfig: VisualConfig | null;
  modifications: BuildMod[];
  estimate: { totalLow: number; totalHigh: number; currency: string; source: string } | null;
};

const presetEnum = z.enum(PRESETS.map((p) => p.key) as [string, ...string[]]);

function fail(message: string, error: unknown): never {
  console.error(message, error);
  throw new Error(message);
}

async function readBuilds(db: Db, vehicleId: string): Promise<BuildSummary[]> {
  const { data, error } = await db
    .from("vehicle_builds")
    .select("*, build_modifications(*), build_estimates(*)")
    .eq("vehicle_id", vehicleId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) fail("Couldn't load builds right now.", error);
  return (data ?? []).map((b: any) => {
    const estimates = (b.build_estimates ?? []).filter((e: any) => e.modification_id == null && e.total_low != null);
    const est = estimates[0];
    return {
      id: b.id,
      vehicleId: b.vehicle_id,
      name: b.name,
      preset: b.preset,
      isActive: b.is_active,
      budgetCents: b.budget_cents,
      notes: b.notes,
      visualConfig: b.visual_config ? normalizeVisual(b.visual_config) : null,
      modifications: (b.build_modifications ?? [])
        .filter((m: any) => m.status !== "removed")
        .sort((a: any, c: any) => String(a.created_at).localeCompare(String(c.created_at)))
        .map((m: any) => ({
          id: m.id,
          category: m.category,
          item: m.item,
          label: buildItem(m.item)?.label ?? m.item,
          detail: m.detail,
          notes: m.notes,
          status: m.status,
          compatibility: m.compatibility,
          source: m.source,
          serviceRequestId: m.service_request_id,
        })),
      estimate: est
        ? { totalLow: est.total_low, totalHigh: est.total_high, currency: est.currency, source: est.source }
        : null,
    };
  });
}

async function vehicleOfBuild(db: Db, buildId: string): Promise<string> {
  const { data, error } = await db.from("vehicle_builds").select("vehicle_id").eq("id", buildId).maybeSingle();
  if (error || !data) fail("Build not found.", error);
  return String(data.vehicle_id);
}

export const listBuilds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ vehicleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => ({ builds: await readBuilds(context.supabase as unknown as Db, data.vehicleId) }));

export const getBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ buildId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const vehicleId = await vehicleOfBuild(db, data.buildId);
    const builds = await readBuilds(db, vehicleId);
    const build = builds.find((b) => b.id === data.buildId);
    if (!build) throw new Error("Build not found.");
    const { data: v } = await db.from("vehicles").select("year, make, model, trim").eq("id", vehicleId).maybeSingle();
    return { build, builds: builds.map((b) => ({ id: b.id, name: b.name, isActive: b.isActive })), vehicle: v ?? null };
  });

export const createBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        vehicleId: z.string().uuid(),
        preset: presetEnum,
        name: z.string().trim().min(1).max(60),
        duplicateOf: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { count } = await db
      .from("vehicle_builds")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_id", data.vehicleId)
      .eq("is_active", true)
      .is("archived_at", null);
    const { data: row, error } = await db
      .from("vehicle_builds")
      .insert({
        vehicle_id: data.vehicleId,
        user_id: context.userId,
        name: data.name,
        preset: data.preset,
        is_active: !count,
      })
      .select("id")
      .single();
    if (error) fail("Couldn't create the build.", error);
    if (data.duplicateOf) {
      const { data: mods } = await db
        .from("build_modifications")
        .select("category, item, detail, notes, source, status")
        .eq("build_id", data.duplicateOf);
      const copy = (mods ?? [])
        .filter((m: any) => m.status !== "removed")
        // A copy is a new plan: statuses never carry over.
        .map((m: any) => ({ build_id: row.id, category: m.category, item: m.item, detail: m.detail, notes: m.notes, source: m.source }));
      if (copy.length) await db.from("build_modifications").insert(copy);
    }
    return { id: String(row.id) };
  });

export const updateBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        buildId: z.string().uuid(),
        name: z.string().trim().min(1).max(60).optional(),
        notes: z.string().max(1000).nullable().optional(),
        budgetCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
        makeActive: z.boolean().optional(),
        archive: z.boolean().optional(),
        visualConfig: visualConfigSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const vehicleId = await vehicleOfBuild(db, data.buildId);
    if (data.makeActive) {
      await db.from("vehicle_builds").update({ is_active: false }).eq("vehicle_id", vehicleId).eq("user_id", context.userId);
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.budgetCents !== undefined) patch.budget_cents = data.budgetCents;
    if (data.visualConfig) patch.visual_config = data.visualConfig;
    if (data.makeActive) patch.is_active = true;
    if (data.archive) Object.assign(patch, { archived_at: new Date().toISOString(), is_active: false });
    if (Object.keys(patch).length) {
      const { error } = await db.from("vehicle_builds").update(patch).eq("id", data.buildId);
      if (error) fail("Couldn't save the build.", error);
    }
    return { ok: true };
  });

export const addModification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        buildId: z.string().uuid(),
        category: z.string().min(1).max(40),
        item: z.string().min(1).max(60),
        detail: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(1000).optional(),
        source: z.enum(["owner", "suggestion"]).default("owner"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!isBuildItem(data.category, data.item)) throw new Error("Unknown modification.");
    const db = context.supabase as unknown as Db;
    const { data: existing } = await db
      .from("build_modifications")
      .select("id")
      .eq("build_id", data.buildId)
      .eq("item", data.item)
      .neq("status", "removed")
      .maybeSingle();
    if (existing) return { id: String(existing.id) };
    const { data: row, error } = await db
      .from("build_modifications")
      .insert({ build_id: data.buildId, category: data.category, item: data.item, detail: data.detail || null, notes: data.notes || null, source: data.source })
      .select("id")
      .single();
    if (error) fail("Couldn't add that modification.", error);
    return { id: String(row.id) };
  });

export const updateModification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        detail: z.string().trim().max(200).nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
        remove: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const patch: Record<string, unknown> = {};
    if (data.detail !== undefined) patch.detail = data.detail || null;
    if (data.notes !== undefined) patch.notes = data.notes || null;
    if (data.remove) patch.status = "removed";
    const { error } = await db.from("build_modifications").update(patch).eq("id", data.id);
    if (error) fail(data.remove ? "This modification can't be removed now." : "Couldn't save the change.", error);
    return { ok: true };
  });

/** Text + routing for "Request Actual Quotes" so the driver never retypes the project. */
export const getBuildRequestPrefill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ buildId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const vehicleId = await vehicleOfBuild(db, data.buildId);
    const build = (await readBuilds(db, vehicleId)).find((b) => b.id === data.buildId);
    if (!build) throw new Error("Build not found.");
    const open = build.modifications.filter((m) => m.status === "planned" || m.status === "requested");
    const lines = open.map((m) => `- ${m.label}${m.detail ? ` (${m.detail})` : ""}${m.notes ? ` — ${m.notes}` : ""}`);
    const requirements = serviceRequirements(open.map((m) => m.item));
    const text = [
      `Build: ${build.name}`,
      "Requested work:",
      ...lines,
      build.notes ? `Notes: ${build.notes}` : null,
      "Repara estimate: unavailable",
    ]
      .filter(Boolean)
      .join("\n");
    return { vehicleId, text, requirements, primaryCategory: requirements[0] ?? "other" };
  });
