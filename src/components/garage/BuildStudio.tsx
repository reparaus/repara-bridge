import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FALLBACK_SEDAN, type VehicleAsset } from "@/lib/build3d/assets";
import { compareToStock, formatTireSize, overallDiameterIn, type TireSpec } from "@/lib/build3d/fitment";
import type { StockFitment } from "@/lib/build3d/stock-fitment";
import {
  DEFAULT_VISUAL,
  RIDE_HEIGHT_MAX,
  RIDE_HEIGHT_MIN,
  TINT_OPTIONS,
  normalizeVisual,
  type PaintFinish,
  type VisualConfig,
  type WheelDesign,
  type WheelFinish,
} from "@/lib/build3d/visual-config";
import { cn } from "@/lib/utils";
import type { CameraView } from "./Build3DViewer";

export { normalizeVisual };

const Viewer = lazy(() => import("./Build3DViewer"));

const PAINTS = [
  { label: "Stock", value: null, swatch: "#d9d9d9" },
  { label: "Gloss Black", value: "#1b1c1f", swatch: "#1b1c1f" },
  { label: "Pearl White", value: "#f2f2ee", swatch: "#f2f2ee" },
  { label: "Nardo Grey", value: "#8a8d8f", swatch: "#8a8d8f" },
  { label: "Deep Red", value: "#8e1b1b", swatch: "#8e1b1b" },
  { label: "Midnight Blue", value: "#1d2b4f", swatch: "#1d2b4f" },
];
const FINISHES: { key: PaintFinish; label: string }[] = [
  { key: "gloss", label: "Gloss" },
  { key: "metallic", label: "Metallic" },
  { key: "pearl", label: "Pearl" },
  { key: "matte", label: "Matte" },
];
const DESIGNS: { key: WheelDesign; label: string }[] = [
  { key: "stock", label: "Stock" },
  { key: "five_spoke", label: "5-spoke" },
  { key: "ten_spoke", label: "10-spoke" },
  { key: "multi_spoke", label: "Multi-spoke" },
  { key: "mesh", label: "Mesh" },
];
const WHEEL_FINISHES: { key: WheelFinish; label: string }[] = [
  { key: "silver", label: "Silver" },
  { key: "gloss_black", label: "Gloss black" },
  { key: "gunmetal", label: "Gunmetal" },
  { key: "bronze", label: "Bronze" },
  { key: "chrome", label: "Chrome" },
];
const DIAMETERS = [16, 17, 18, 19, 20, 21, 22];
const WIDTHS = [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11];
const TIRE_WIDTHS = [205, 215, 225, 235, 245, 255, 265, 275, 285, 295, 305];
const ASPECTS = [25, 30, 35, 40, 45, 50, 55];
const VIEWS: { key: CameraView; label: string }[] = [
  { key: "three_quarter", label: "3/4" },
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "rear", label: "Rear" },
  { key: "top", label: "Top" },
];
type Tab = "wheels" | "suspension" | "paint" | "tint" | "body";

/** Tire aspect for this width/rim that keeps overall diameter closest to target. */
function closestAspect(widthMm: number, rimIn: number, targetIn: number): number {
  return ASPECTS.reduce((best, a) =>
    Math.abs(overallDiameterIn({ widthMm, aspect: a, rimIn }) - targetIn) <
    Math.abs(overallDiameterIn({ widthMm, aspect: best, rimIn }) - targetIn)
      ? a
      : best,
  );
}

function Chips<T extends string | number>({ items, value, onPick }: { items: { key: T; label: string }[]; value: T; onPick: (k: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <button
          key={String(i.key)}
          type="button"
          onClick={() => onPick(i.key)}
          className={cn("h-10 rounded-xl border px-3 text-sm transition-colors", value === i.key ? "border-2 border-primary bg-primary/15 font-semibold" : "border-border/60")}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: number; options: { value: number; label: string }[]; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        className="h-10 rounded-xl border border-border/60 bg-background px-2 text-sm text-foreground"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BuildStudio({
  vehicleLabel,
  saved,
  saving,
  saveFailed = false,
  onSave,
  asset = FALLBACK_SEDAN,
  stock = null,
}: {
  vehicleLabel: string;
  saved: VisualConfig;
  saving: boolean;
  saveFailed?: boolean;
  onSave: (c: VisualConfig) => void;
  asset?: VehicleAsset;
  stock?: StockFitment | null;
}) {
  const [config, setConfig] = useState<VisualConfig>(saved);
  const [history, setHistory] = useState<VisualConfig[]>([]);
  const [tab, setTab] = useState<Tab>("wheels");
  const [view, setView] = useState<CameraView>("three_quarter");
  const [nonce, setNonce] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setConfig(saved), [saved]);

  const change = (patch: Partial<VisualConfig>) => {
    if (saving) return;
    setHistory((h) => [...h.slice(-19), config]);
    setConfig((c) => ({ ...c, ...patch }));
  };
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);

  const stockTire: TireSpec = stock?.tire ?? { widthMm: 225, aspect: 45, rimIn: 18 };
  const stockDiameter = overallDiameterIn(stockTire);

  const pickDesign = (design: WheelDesign) => {
    if (design === "stock") return change({ wheelDesign: "stock" });
    // Start a custom wheel from the stock size so the first change is visible but sane.
    const wheelSpec = config.wheelSpec ?? {
      diameterIn: stock?.wheel.diameterIn ?? stockTire.rimIn,
      widthIn: stock?.wheel.widthIn ?? 8.5,
      offsetMm: stock?.wheel.offsetMm ?? 40,
    };
    change({ wheelDesign: design, wheelSpec, tireSpec: config.tireSpec ?? stockTire });
  };

  const setDiameter = (diameterIn: number) => {
    if (!config.wheelSpec || !config.tireSpec) return;
    const aspect = closestAspect(config.tireSpec.widthMm, diameterIn, stockDiameter);
    change({ wheelSpec: { ...config.wheelSpec, diameterIn }, tireSpec: { ...config.tireSpec, rimIn: diameterIn, aspect } });
  };

  const comparison = useMemo(
    () => (stock && config.wheelSpec && config.tireSpec && config.wheelDesign !== "stock" ? compareToStock(stock, { wheel: config.wheelSpec, tire: config.tireSpec }) : null),
    [stock, config.wheelSpec, config.tireSpec, config.wheelDesign],
  );

  const custom = config.wheelDesign !== "stock" && config.wheelSpec && config.tireSpec;

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
      <div className="relative h-72 bg-muted sm:h-96">
        {mounted ? (
          <Suspense
            fallback={
              <div className="flex h-full animate-pulse flex-col items-center justify-center gap-3 bg-muted text-sm text-muted-foreground" role="status">
                <div className="h-16 w-48 rounded-[40%] border-2 border-dashed border-border" />
                <span className="flex items-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading 3D preview…
                </span>
              </div>
            }
          >
            <Viewer config={config} view={view} viewNonce={nonce} asset={asset} stock={stock} />
          </Suspense>
        ) : (
          <div className="h-full animate-pulse bg-muted" aria-hidden />
        )}
        {asset.match === "fallback" && (
          <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur">
            Fallback 3D model — not your {vehicleLabel}
          </span>
        )}
        <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 overflow-x-auto">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => {
                setView(v.key);
                setNonce((n) => n + 1);
              }}
              className={cn("shrink-0 rounded-full px-3 py-1 text-xs backdrop-blur", view === v.key ? "bg-primary text-primary-foreground" : "bg-background/80 text-foreground")}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        <div className="flex gap-1 overflow-x-auto border-b border-border/60 pb-2">
          {(["wheels", "suspension", "paint", "tint", "body"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm capitalize", tab === t ? "bg-primary/15 text-foreground" : "text-muted-foreground")}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-24 space-y-4 pt-4">
          {tab === "wheels" && (
            <>
              <Chips items={DESIGNS} value={config.wheelDesign} onPick={pickDesign} />
              {custom ? (
                <>
                  <Chips items={WHEEL_FINISHES} value={config.wheelFinish} onPick={(f) => change({ wheelFinish: f })} />
                  <div className="grid grid-cols-3 gap-2">
                    <Select label="Diameter" value={config.wheelSpec!.diameterIn} options={DIAMETERS.map((d) => ({ value: d, label: `${d}"` }))} onChange={setDiameter} />
                    <Select
                      label="Width"
                      value={config.wheelSpec!.widthIn}
                      options={WIDTHS.map((w) => ({ value: w, label: `${w}"` }))}
                      onChange={(widthIn) => change({ wheelSpec: { ...config.wheelSpec!, widthIn } })}
                    />
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Offset {config.wheelSpec!.offsetMm >= 0 ? "+" : ""}
                      {config.wheelSpec!.offsetMm}
                      <input
                        type="range"
                        min={-10}
                        max={60}
                        step={1}
                        value={config.wheelSpec!.offsetMm}
                        aria-label="Wheel offset"
                        onChange={(e) => change({ wheelSpec: { ...config.wheelSpec!, offsetMm: Number(e.target.value) } })}
                        className="mt-3 w-full accent-[var(--primary)]"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select
                      label="Tire width"
                      value={config.tireSpec!.widthMm}
                      options={TIRE_WIDTHS.map((w) => ({ value: w, label: `${w}` }))}
                      onChange={(widthMm) => change({ tireSpec: { ...config.tireSpec!, widthMm } })}
                    />
                    <Select
                      label="Aspect"
                      value={config.tireSpec!.aspect}
                      options={ASPECTS.map((a) => ({ value: a, label: `${a}` }))}
                      onChange={(aspect) => change({ tireSpec: { ...config.tireSpec!, aspect } })}
                    />
                    <Button
                      variant="outline"
                      className="mt-5 h-10 text-xs"
                      onClick={() => change({ tireSpec: { ...config.tireSpec!, aspect: closestAspect(config.tireSpec!.widthMm, config.tireSpec!.rimIn, stockDiameter) } })}
                    >
                      Match stock height
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background/60 p-3 text-xs">
                    <p className="font-medium text-foreground">
                      {formatTireSize(config.tireSpec!)} · {overallDiameterIn(config.tireSpec!).toFixed(1)}" tall
                    </p>
                    {comparison ? (
                      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                        <li>
                          vs stock {formatTireSize(stock!.tire)}: {comparison.diameterChangePct >= 0 ? "+" : ""}
                          {comparison.diameterChangePct.toFixed(1)}% diameter · speedometer reads {comparison.speedoAt60.toFixed(1)} at a real 60 mph
                        </li>
                        <li>
                          {comparison.pokeChangeMm === null
                            ? "Poke vs stock: needs the stock wheel width (not yet verified)."
                            : `Sits ${Math.abs(comparison.pokeChangeMm).toFixed(0)} mm ${comparison.pokeChangeMm >= 0 ? "further out" : "further in"} than stock; ${Math.abs(comparison.innerChangeMm!).toFixed(0)} mm ${comparison.innerChangeMm! >= 0 ? "closer to" : "further from"} the suspension.`}
                        </li>
                        {comparison.warnings.map((w) => (
                          <li key={w} className="flex gap-1.5 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                            {w}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-muted-foreground">Stock size for this vehicle isn't on file yet, so there's no comparison.</p>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Geometry estimate only — not a fitment guarantee. Real fitment is confirmed by fitment data and your installer.
                      {stock && !stock.verified ? ` Stock size from: ${stock.source}.` : ""}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Pick a design to change wheel size, width, offset and tires.</p>
              )}
            </>
          )}

          {tab === "suspension" && (
            <div>
              <div className="flex justify-between text-sm">
                <span>Ride height</span>
                <span className="font-medium">
                  {config.rideHeightIn === 0 ? "Stock" : `${Math.abs(config.rideHeightIn).toFixed(1)} in ${config.rideHeightIn < 0 ? "lower" : "higher"}`}
                </span>
              </div>
              <input
                type="range"
                min={RIDE_HEIGHT_MIN}
                max={RIDE_HEIGHT_MAX}
                step={0.5}
                value={config.rideHeightIn}
                aria-label="Ride height"
                onChange={(e) => change({ rideHeightIn: Number(e.target.value) })}
                className="mt-3 w-full accent-[var(--primary)]"
              />
              <p className="mt-2 text-xs text-muted-foreground">Approximate visual. Actual height depends on the springs, coilovers or lift installed.</p>
            </div>
          )}

          {tab === "paint" && (
            <>
              <div className="flex flex-wrap gap-3">
                {PAINTS.map((p) => (
                  <button key={p.label} type="button" onClick={() => change({ paint: p.value })} className="flex flex-col items-center gap-1 text-xs">
                    <span className={cn("h-10 w-10 rounded-full border-2", config.paint === p.value ? "border-primary" : "border-border")} style={{ background: p.swatch }} />
                    {p.label}
                  </button>
                ))}
                <label className="flex flex-col items-center gap-1 text-xs">
                  <input
                    type="color"
                    aria-label="Custom paint color"
                    value={config.paint ?? "#ffffff"}
                    onChange={(e) => change({ paint: e.target.value })}
                    className="h-10 w-10 cursor-pointer rounded-full border-2 border-border bg-transparent"
                  />
                  Custom
                </label>
              </div>
              <Chips items={FINISHES} value={config.paintFinish} onPick={(f) => change({ paintFinish: f })} />
            </>
          )}

          {tab === "tint" &&
            (asset.glass.length ? (
              <Chips
                items={[{ key: 0, label: "Factory" }, ...TINT_OPTIONS.map((t) => ({ key: t as number, label: `${t}%` }))]}
                value={config.tintPct ?? 0}
                onPick={(v) => change({ tintPct: v === 0 ? null : v })}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Tint preview needs a model with separate windows — available when your car's 3D model is added. You can still add Window Tint to your build below.</p>
            ))}

          {tab === "body" &&
            (asset.hood.length ? (
              <Chips items={[{ key: "oem", label: "OEM hood" }, { key: "carbon", label: "Carbon fiber hood" }]} value={config.hood} onPick={(h) => change({ hood: h })} />
            ) : (
              <p className="text-sm text-muted-foreground">Hood and body-part swaps need a model with separate panels — available when your car's 3D model is added.</p>
            ))}
        </div>

        <p role="status" aria-live="polite" className={cn("mt-4 text-xs", saveFailed && !saving ? "text-destructive" : "text-muted-foreground")}>
          {saving ? "Saving…" : saveFailed && dirty ? "Couldn't save your changes. Try again." : dirty ? "Unsaved changes" : "All changes saved"}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="h-11"
            disabled={!history.length || saving}
            onClick={() => {
              setConfig(history[history.length - 1]!);
              setHistory((h) => h.slice(0, -1));
            }}
          >
            Undo
          </Button>
          <Button variant="outline" className="h-11" onClick={() => change(DEFAULT_VISUAL)} disabled={saving || JSON.stringify(config) === JSON.stringify(DEFAULT_VISUAL)}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button className="h-11" disabled={!dirty || saving} onClick={() => onSave(config)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {saveFailed && dirty && !saving ? "Retry" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
