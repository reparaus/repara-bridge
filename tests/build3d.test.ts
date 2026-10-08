/** Wheel/tire geometry and saved-build compatibility for the 3D studio. */
import { describe, expect, test } from "bun:test";

import { compareToStock, lipPositionsMm, overallDiameterIn, parseTireSize } from "../src/lib/build3d/fitment";
import { stockFitmentFor } from "../src/lib/build3d/stock-fitment";
import { DEFAULT_VISUAL, normalizeVisual, visualConfigSchema } from "../src/lib/build3d/visual-config";

describe("tire math", () => {
  test("parses sizes", () => {
    expect(parseTireSize("235/40R19")).toEqual({ widthMm: 235, aspect: 40, rimIn: 19 });
    expect(parseTireSize("255/35zr19")).toEqual({ widthMm: 255, aspect: 35, rimIn: 19 });
    expect(parseTireSize("19x8.5")).toBeNull();
  });

  test("overall diameter: 235/40R19 is about 26.40 in", () => {
    // sidewall = 235 * 0.40 = 94 mm = 3.7008 in; 19 + 2 * 3.7008 = 26.4016
    expect(overallDiameterIn({ widthMm: 235, aspect: 40, rimIn: 19 })).toBeCloseTo(26.4016, 3);
  });

  test("lip positions: 19x8.5 +45", () => {
    // half width = 8.5 * 25.4 / 2 = 107.95 mm
    const p = lipPositionsMm({ diameterIn: 19, widthIn: 8.5, offsetMm: 45 });
    expect(p.outer).toBeCloseTo(62.95, 2);
    expect(p.inner).toBeCloseTo(152.95, 2);
  });
});

describe("compare to stock", () => {
  const stock = { wheel: { diameterIn: 19, widthIn: 8.5, offsetMm: 45 }, tire: { widthMm: 235, aspect: 40, rimIn: 19 } };

  test("wider, lower offset wheel pokes out and warns", () => {
    const c = compareToStock(stock, { wheel: { diameterIn: 19, widthIn: 9.5, offsetMm: 35 }, tire: { widthMm: 255, aspect: 35, rimIn: 19 } });
    expect(c.pokeChangeMm).toBeCloseTo(22.7, 1);
    expect(c.innerChangeMm).toBeCloseTo(2.7, 1);
    expect(c.diameterChangePct).toBeCloseTo(-1.4, 1);
    expect(c.warnings.some((w) => w.includes("further out"))).toBe(true);
  });

  test("unknown stock width: no poke numbers, still compares diameter", () => {
    const c = compareToStock(
      { ...stock, wheel: { ...stock.wheel, widthIn: null } },
      { wheel: { diameterIn: 20, widthIn: 9, offsetMm: 40 }, tire: { widthMm: 245, aspect: 35, rimIn: 20 } },
    );
    expect(c.pokeChangeMm).toBeNull();
    expect(c.innerChangeMm).toBeNull();
    expect(Number.isFinite(c.diameterChangePct)).toBe(true);
  });

  test("rim/tire mismatch is flagged", () => {
    const c = compareToStock(stock, { wheel: { diameterIn: 20, widthIn: 9, offsetMm: 40 }, tire: { widthMm: 245, aspect: 35, rimIn: 19 } });
    expect(c.warnings.some((w) => w.includes("doesn't match"))).toBe(true);
  });
});

describe("stock fitment registry", () => {
  test("2021 Accord Sport is on file, unverified, width unknown", () => {
    const f = stockFitmentFor({ year: 2021, make: "Honda", model: "Accord", trim: "Sport" })!;
    expect(f.tire).toEqual({ widthMm: 235, aspect: 40, rimIn: 19 });
    expect(f.wheel.widthIn).toBeNull();
    expect(f.verified).toBe(false);
  });

  test("unknown vehicles return null (nothing invented)", () => {
    expect(stockFitmentFor({ year: 2015, make: "Toyota", model: "Camry", trim: "SE" })).toBeNull();
  });
});

describe("saved builds", () => {
  test("old saves still load", () => {
    const v = normalizeVisual({ paint: "#1b1c1f", wheel: "dark", rideHeightIn: -1.5 });
    expect(v.paint).toBe("#1b1c1f");
    expect(v.wheelDesign).toBe("five_spoke");
    expect(v.wheelFinish).toBe("gloss_black");
    expect(v.rideHeightIn).toBe(-1.5);
    expect(v.tintPct).toBeNull();
  });

  test("garbage falls back to defaults", () => {
    expect(normalizeVisual({ paint: "red", tintPct: 99, rideHeightIn: -40 })).toEqual({ ...DEFAULT_VISUAL, rideHeightIn: -4 });
  });

  test("a full new config passes the server schema", () => {
    const full = {
      ...DEFAULT_VISUAL,
      wheelDesign: "mesh",
      wheelSpec: { diameterIn: 19, widthIn: 9.5, offsetMm: 35 },
      tireSpec: { widthMm: 255, aspect: 35, rimIn: 19 },
      tintPct: 20,
      hood: "carbon",
    };
    expect(visualConfigSchema.safeParse(full).success).toBe(true);
  });
});
