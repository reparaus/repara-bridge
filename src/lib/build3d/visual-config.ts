/**
 * Saved 3D look of a build (vehicle_builds.visual_config). Plain JSON shared by
 * the web studio, the server and a future native app (CLAUDE.md §22a/§22b).
 * Older saves ({ paint, wheel: "stock" | "dark" | "racing", rideHeightIn })
 * still load through normalizeVisual.
 */
import { z } from "zod";

import type { TireSpec, WheelSpec } from "./fitment";

export const PAINT_FINISHES = ["gloss", "metallic", "matte", "pearl"] as const;
export const WHEEL_DESIGNS = ["stock", "five_spoke", "ten_spoke", "mesh", "multi_spoke"] as const;
export const WHEEL_FINISHES = ["silver", "gloss_black", "gunmetal", "bronze", "chrome"] as const;
export const HOODS = ["oem", "carbon"] as const;

export type PaintFinish = (typeof PAINT_FINISHES)[number];
export type WheelDesign = (typeof WHEEL_DESIGNS)[number];
export type WheelFinish = (typeof WHEEL_FINISHES)[number];
export type Hood = (typeof HOODS)[number];

export type VisualConfig = {
  paint: string | null;
  paintFinish: PaintFinish;
  /** "stock" keeps the model's own wheels; anything else is generated from wheelSpec/tireSpec. */
  wheelDesign: WheelDesign;
  wheelFinish: WheelFinish;
  wheelSpec: WheelSpec | null;
  tireSpec: TireSpec | null;
  /** Inches vs stock: negative = lower. */
  rideHeightIn: number;
  /** Window tint as visible light transmission %, null = factory glass. */
  tintPct: number | null;
  hood: Hood;
};

export const RIDE_HEIGHT_MIN = -4;
export const RIDE_HEIGHT_MAX = 2;
export const TINT_OPTIONS = [5, 15, 20, 35, 50, 70] as const;

export const DEFAULT_VISUAL: VisualConfig = {
  paint: null,
  paintFinish: "gloss",
  wheelDesign: "stock",
  wheelFinish: "silver",
  wheelSpec: null,
  tireSpec: null,
  rideHeightIn: 0,
  tintPct: null,
  hood: "oem",
};

const wheelSpecSchema = z.object({
  diameterIn: z.number().int().min(14).max(24),
  widthIn: z.number().min(5).max(13),
  offsetMm: z.number().int().min(-50).max(70),
});
const tireSpecSchema = z.object({
  widthMm: z.number().int().min(155).max(355),
  aspect: z.number().int().min(20).max(80),
  rimIn: z.number().int().min(14).max(24),
});

/** What the server accepts when saving. */
export const visualConfigSchema = z.object({
  paint: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  paintFinish: z.enum(PAINT_FINISHES),
  wheelDesign: z.enum(WHEEL_DESIGNS),
  wheelFinish: z.enum(WHEEL_FINISHES),
  wheelSpec: wheelSpecSchema.nullable(),
  tireSpec: tireSpecSchema.nullable(),
  rideHeightIn: z.number().min(RIDE_HEIGHT_MIN).max(RIDE_HEIGHT_MAX),
  tintPct: z.number().int().min(5).max(70).nullable(),
  hood: z.enum(HOODS),
});

const pick = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;

/** Reads any saved shape (old or new) into a complete, valid config. */
export function normalizeVisual(raw: unknown): VisualConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  // Legacy style presets from the first studio version.
  const legacy = r["wheel"] === "dark" ? { design: "five_spoke", finish: "gloss_black" } : r["wheel"] === "racing" ? { design: "ten_spoke", finish: "silver" } : null;
  const wheel = wheelSpecSchema.safeParse(r["wheelSpec"]);
  const tire = tireSpecSchema.safeParse(r["tireSpec"]);
  const ride = typeof r["rideHeightIn"] === "number" ? r["rideHeightIn"] : 0;
  const tint = typeof r["tintPct"] === "number" ? Math.round(r["tintPct"]) : null;
  return {
    paint: typeof r["paint"] === "string" && /^#[0-9a-fA-F]{6}$/.test(r["paint"]) ? r["paint"] : null,
    paintFinish: pick(PAINT_FINISHES, r["paintFinish"], "gloss"),
    wheelDesign: pick(WHEEL_DESIGNS, r["wheelDesign"], (legacy?.design as WheelDesign) ?? "stock"),
    wheelFinish: pick(WHEEL_FINISHES, r["wheelFinish"], (legacy?.finish as WheelFinish) ?? "silver"),
    wheelSpec: wheel.success ? wheel.data : null,
    tireSpec: tire.success ? tire.data : null,
    rideHeightIn: Math.max(RIDE_HEIGHT_MIN, Math.min(RIDE_HEIGHT_MAX, ride)),
    tintPct: tint !== null && tint >= 5 && tint <= 70 ? tint : null,
    hood: pick(HOODS, r["hood"], "oem"),
  };
}
