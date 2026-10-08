/**
 * Wheel & tire geometry for the 3D build studio (CLAUDE.md §22b).
 *
 * Pure math on real dimensions — no DOM, no React — so the web studio and a
 * future native app share it. These are geometric ESTIMATES (how much bigger,
 * how far the wheel sits out); they never claim a part fits. Real fitment
 * comes from licensed fitment data and the installing provider.
 */

export type TireSpec = { widthMm: number; aspect: number; rimIn: number };
export type WheelSpec = { diameterIn: number; widthIn: number; offsetMm: number };

const MM_PER_IN = 25.4;

/** Parses "235/40R19" or "235/40ZR19". Returns null when it isn't a size. */
export function parseTireSize(text: string): TireSpec | null {
  const m = text.trim().toUpperCase().match(/^(\d{3})\/(\d{2})\s*Z?R\s*(\d{2})$/);
  if (!m) return null;
  return { widthMm: Number(m[1]), aspect: Number(m[2]), rimIn: Number(m[3]) };
}

export function formatTireSize(t: TireSpec): string {
  return `${t.widthMm}/${t.aspect}R${t.rimIn}`;
}

export function formatWheel(w: WheelSpec): string {
  const sign = w.offsetMm >= 0 ? "+" : "";
  return `${w.diameterIn}×${w.widthIn} ${sign}${w.offsetMm}`;
}

export function sidewallIn(t: TireSpec): number {
  return (t.widthMm * (t.aspect / 100)) / MM_PER_IN;
}

/** Overall tire diameter in inches. */
export function overallDiameterIn(t: TireSpec): number {
  return t.rimIn + 2 * sidewallIn(t);
}

/**
 * Wheel lip positions relative to the hub mounting face, in mm.
 * outer = how far the outer lip sits outboard; inner = how far the inner lip
 * sits inboard. Higher outer = more "poke"; higher inner = closer to the
 * suspension.
 */
export function lipPositionsMm(w: WheelSpec): { outer: number; inner: number } {
  const half = (w.widthIn * MM_PER_IN) / 2;
  return { outer: half - w.offsetMm, inner: half + w.offsetMm };
}

/** Stock setup; widthIn is null until a verified source provides it. */
export type StockSetup = {
  wheel: { diameterIn: number; widthIn: number | null; offsetMm: number };
  tire: TireSpec;
};

export type FitmentComparison = {
  diameterChangePct: number;
  /** At a true 60 mph the speedometer shows this (stock calibration). */
  speedoAt60: number;
  /** Null when the stock wheel width isn't known. */
  pokeChangeMm: number | null;
  innerChangeMm: number | null;
  rimChangeIn: number;
  warnings: string[];
};

/** Compares a new wheel/tire setup with the stock one (estimates only). */
export function compareToStock(stock: StockSetup, next: { wheel: WheelSpec; tire: TireSpec }): FitmentComparison {
  const d0 = overallDiameterIn(stock.tire);
  const d1 = overallDiameterIn(next.tire);
  const diameterChangePct = ((d1 - d0) / d0) * 100;
  const stockWidth = stock.wheel.widthIn;
  const a = stockWidth === null ? null : lipPositionsMm({ ...stock.wheel, widthIn: stockWidth });
  const b = lipPositionsMm(next.wheel);
  const pokeChangeMm = a ? b.outer - a.outer : null;
  const innerChangeMm = a ? b.inner - a.inner : null;
  const warnings: string[] = [];
  if (next.tire.rimIn !== next.wheel.diameterIn) warnings.push("Tire rim size doesn't match the wheel diameter.");
  if (Math.abs(diameterChangePct) > 3) warnings.push("Overall diameter differs from stock by more than 3% — speedometer, ABS and clearance may be affected.");
  if (pokeChangeMm !== null && pokeChangeMm > 15) warnings.push("Wheel sits noticeably further out than stock — fender clearance and rubbing are likely concerns.");
  if (innerChangeMm !== null && innerChangeMm > 10) warnings.push("Wheel sits closer to the suspension than stock — inner clearance needs checking.");
  return {
    diameterChangePct,
    speedoAt60: 60 * (d0 / d1),
    pokeChangeMm,
    innerChangeMm,
    rimChangeIn: next.wheel.diameterIn - stock.wheel.diameterIn,
    warnings,
  };
}
