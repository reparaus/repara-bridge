import { lazy, Suspense, useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CameraView, VisualConfig, WheelStyle } from "./Build3DViewer";

const Viewer = lazy(() => import("./Build3DViewer"));

const DEFAULT: VisualConfig = { paint: null, wheel: "stock", rideHeightIn: 0 };
const PAINTS = [
  { label: "Stock", value: null, swatch: "#d9d9d9" },
  { label: "Gloss Black", value: "#1b1c1f", swatch: "#1b1c1f" },
  { label: "Pearl White", value: "#f2f2ee", swatch: "#f2f2ee" },
  { label: "Nardo Grey", value: "#8a8d8f", swatch: "#8a8d8f" },
  { label: "Deep Red", value: "#8e1b1b", swatch: "#8e1b1b" },
  { label: "Midnight Blue", value: "#1d2b4f", swatch: "#1d2b4f" },
];
const WHEELS: { key: WheelStyle; label: string }[] = [
  { key: "stock", label: "Stock" },
  { key: "dark", label: "Dark 5-spoke" },
  { key: "racing", label: "Racing" },
];
const VIEWS: { key: CameraView; label: string }[] = [
  { key: "three_quarter", label: "3/4" },
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "rear", label: "Rear" },
  { key: "top", label: "Top" },
];

export function normalizeVisual(raw: unknown): VisualConfig {
  const r = (raw ?? {}) as Partial<VisualConfig>;
  return {
    paint: typeof r.paint === "string" ? r.paint : null,
    wheel: r.wheel === "dark" || r.wheel === "racing" ? r.wheel : "stock",
    rideHeightIn: typeof r.rideHeightIn === "number" ? Math.max(-3, Math.min(0, r.rideHeightIn)) : 0,
  };
}

export function BuildStudio({
  vehicleLabel,
  saved,
  saving,
  saveFailed = false,
  onSave,
}: {
  vehicleLabel: string;
  saved: VisualConfig;
  saving: boolean;
  saveFailed?: boolean;
  onSave: (c: VisualConfig) => void;
}) {
  const [config, setConfig] = useState<VisualConfig>(saved);
  const [history, setHistory] = useState<VisualConfig[]>([]);
  const [tab, setTab] = useState<"wheels" | "suspension" | "paint" | "tint">("wheels");
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

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
      <div className="relative h-72 bg-muted sm:h-96">
        {mounted ? (
          <Suspense fallback={<div className="flex h-full animate-pulse flex-col items-center justify-center gap-3 bg-muted text-sm text-muted-foreground" role="status"><div className="h-16 w-48 rounded-[40%] border-2 border-dashed border-border" /><span className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading 3D preview…</span></div>}>
            <Viewer config={config} view={view} viewNonce={nonce} />
          </Suspense>
        ) : (
          <div className="h-full animate-pulse bg-muted" aria-hidden />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur">
          Fallback 3D model — not your {vehicleLabel}
        </span>
        <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 overflow-x-auto">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => { setView(v.key); setNonce((n) => n + 1); }}
              className={cn("shrink-0 rounded-full px-3 py-1 text-xs backdrop-blur", view === v.key ? "bg-primary text-primary-foreground" : "bg-background/80 text-foreground")}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        <div className="flex gap-1 overflow-x-auto border-b border-border/60 pb-2">
          {(["wheels", "suspension", "paint", "tint"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm capitalize", tab === t ? "bg-primary/15 text-foreground" : "text-muted-foreground")}>
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-24 pt-4">
          {tab === "wheels" && (
            <div className="grid grid-cols-3 gap-2">
              {WHEELS.map((w) => (
                <button key={w.key} type="button" onClick={() => change({ wheel: w.key })}
                  className={cn("h-11 rounded-xl border text-sm transition-colors", config.wheel === w.key ? "border-2 border-primary bg-primary/15 font-semibold" : "border-border/60")}>
                  {w.label}
                </button>
              ))}
              <p className="col-span-3 text-xs text-muted-foreground">Style preview only. Real wheel size, brand and fitment come from your provider quote.</p>
            </div>
          )}
          {tab === "suspension" && (
            <div>
              <div className="flex justify-between text-sm"><span>Ride height</span><span className="font-medium">{config.rideHeightIn === 0 ? "Stock" : `${Math.abs(config.rideHeightIn).toFixed(1)} in lower`}</span></div>
              <input type="range" min={-3} max={0} step={0.5} value={config.rideHeightIn} aria-label="Ride height"
                onChange={(e) => change({ rideHeightIn: Number(e.target.value) })} className="mt-3 w-full accent-[var(--primary)]" />
              <p className="mt-2 text-xs text-muted-foreground">Approximate visual. Actual drop depends on the springs or coilovers installed.</p>
            </div>
          )}
          {tab === "paint" && (
            <div className="flex flex-wrap gap-3">
              {PAINTS.map((p) => (
                <button key={p.label} type="button" onClick={() => change({ paint: p.value })} className="flex flex-col items-center gap-1 text-xs">
                  <span className={cn("h-10 w-10 rounded-full border-2", config.paint === p.value ? "border-primary" : "border-border")} style={{ background: p.swatch }} />
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {tab === "tint" && (
            <p className="text-sm text-muted-foreground">3D tint preview isn't available on this model — its windows aren't a separate part. You can still add Window Tint to your build below.</p>
          )}
        </div>

        <p role="status" aria-live="polite" className={cn("mt-4 text-xs", saveFailed && !saving ? "text-destructive" : "text-muted-foreground")}>
          {saving ? "Saving…" : saveFailed && dirty ? "Couldn't save your changes. Try again." : dirty ? "Unsaved changes" : "All changes saved"}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Button variant="outline" className="h-11" disabled={!history.length || saving}
            onClick={() => { setConfig(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); }}>
            Undo
          </Button>
          <Button variant="outline" className="h-11" onClick={() => change(DEFAULT)} disabled={saving || JSON.stringify(config) === JSON.stringify(DEFAULT)}>
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
