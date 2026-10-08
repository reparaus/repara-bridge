/**
 * 3D vehicle assets and their named attachment points ("slots").
 * Plain data (no DOM) so a native renderer can use the same registry.
 *
 * Asset honesty: today only Kenney's CC0 low-poly sedan exists, always shown
 * as a fallback — never as the driver's car. A licensed model of a specific
 * vehicle is added here with its own slot names; the studio needs no changes.
 */

export type AssetMatch = "exact" | "trim" | "model" | "fallback";

export type VehicleAsset = {
  url: string;
  match: AssetMatch;
  license: string;
  /** Node names the paint applies to. */
  body: string[];
  /** Wheel nodes; the axle runs along the model's X axis. */
  wheels: { frontLeft: string; frontRight: string; rearLeft: string; rearRight: string };
  /** Window nodes (tint). Empty when the model has no separate glass. */
  glass: string[];
  /** Hood nodes (hood swaps). Empty when the hood isn't a separate part. */
  hood: string[];
};

export const FALLBACK_SEDAN: VehicleAsset = {
  url: "/models/sedan.glb",
  match: "fallback",
  license: "CC0 — Kenney Car Kit",
  body: ["body"],
  wheels: { frontLeft: "wheel-front-left", frontRight: "wheel-front-right", rearLeft: "wheel-back-left", rearRight: "wheel-back-right" },
  glass: [],
  hood: [],
};

type Key = { year: number | null; make: string | null; model: string | null; trim: string | null };

/** Licensed vehicle-specific assets go here (see CLAUDE.md §22b). */
const ASSETS: Array<{ match: (k: Key) => boolean; asset: VehicleAsset }> = [];

export function assetFor(vehicle: Key): VehicleAsset {
  return ASSETS.find((a) => a.match(vehicle))?.asset ?? FALLBACK_SEDAN;
}
