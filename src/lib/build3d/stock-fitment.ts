/**
 * Factory wheel/tire setups by vehicle, with provenance. Prototype data only:
 * this is replaced by a licensed fitment API (RideStyler / Wheel-Size /
 * DriveRightData — CLAUDE.md §22b). Never invent values: unknown stays null,
 * and unverified entries are labelled as such in the UI.
 */
import type { StockSetup } from "./fitment";

export type StockFitment = StockSetup & {
  boltPattern: string | null;
  centerBoreMm: number | null;
  verified: boolean;
  source: string;
};

type Key = { year: number | null; make: string | null; model: string | null; trim: string | null };

const ENTRIES: Array<{ match: (k: Key) => boolean; fitment: StockFitment }> = [
  {
    // 2021 Honda Accord Sport 2.0T (10th gen). Width not yet confirmed.
    match: (k) =>
      k.year === 2021 &&
      /^honda$/i.test(k.make ?? "") &&
      /^accord$/i.test(k.model ?? "") &&
      /sport/i.test(k.trim ?? ""),
    fitment: {
      wheel: { diameterIn: 19, widthIn: null, offsetMm: 45 },
      tire: { widthMm: 235, aspect: 40, rimIn: 19 },
      boltPattern: "5x114.3",
      centerBoreMm: 64.1,
      verified: false,
      source: "Public listing (threepiece.us); confirm with a fitment data provider",
    },
  },
];

export function stockFitmentFor(vehicle: Key): StockFitment | null {
  return ENTRIES.find((e) => e.match(vehicle))?.fitment ?? null;
}
