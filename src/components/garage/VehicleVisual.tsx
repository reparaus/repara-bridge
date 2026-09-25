/**
 * Vehicle visual — deliberate abstraction.
 *
 * Today this renders a calm, branded placeholder derived from the vehicle's own
 * identity. It is NOT presented as a photo or a 360° model of the car, because
 * Repara does not have licensed imagery for every vehicle yet.
 *
 * A future interactive 360° asset (drag to rotate, pinch to zoom, colour and
 * wheel personalisation) can be swapped in behind this same interface —
 * `vin`, `year`, `make`, `model`, `trim` — without redesigning the Garage.
 */

import { Car } from "lucide-react";

import { cn } from "@/lib/utils";

export type VehicleVisualProps = {
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  /** Reserved for future asset lookup; never rendered. */
  vin?: string | null;
  className?: string;
  size?: "card" | "hero";
};

/**
 * Visual source resolution. Today only the honest "silhouette" tier exists;
 * a licensed YMMT/trim image or 360° asset provider plugs in here later and
 * must set `exact` truthfully (trim/colour accurate or not).
 */
export type ResolvedVehicleVisual =
  | { kind: "silhouette"; exact: false }
  | { kind: "image"; url: string; exact: boolean; attribution?: string }
  | { kind: "model360"; assetUrl: string; exact: boolean };

export function resolveVehicleVisual(_input: Omit<VehicleVisualProps, "className" | "size">): ResolvedVehicleVisual {
  return { kind: "silhouette", exact: false };
}

/** Stable hue per vehicle so a driver's cars stay visually distinguishable. */
function hueFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return hash;
}

export function VehicleVisual({ year, make, model, trim, vin, className, size = "card" }: VehicleVisualProps) {
  const resolved = resolveVehicleVisual({ year, make, model, trim, vin });
  if (resolved.kind === "image") {
    return (
      <div className={cn("relative w-full overflow-hidden rounded-2xl bg-muted", size === "hero" ? "h-44 sm:h-56" : "h-32", className)}>
        <img src={resolved.url} alt={[year, make, model, trim].filter(Boolean).join(" ")} className="h-full w-full object-cover" loading="lazy" />
        {!resolved.exact && size === "hero" ? (
          <span className="absolute bottom-2 right-3 text-[10px] text-white/70">Representative image</span>
        ) : null}
      </div>
    );
  }
  const seed = [year, make, model, trim].filter(Boolean).join(" ") || "vehicle";
  const hue = hueFor(seed);

  return (
    <div
      aria-hidden
      className={cn(
        "relative w-full overflow-hidden rounded-2xl",
        size === "hero" ? "h-44 sm:h-56" : "h-32",
        className,
      )}
      style={{
        background: `radial-gradient(120% 120% at 20% 10%, hsl(${hue} 42% 24%) 0%, hsl(${(hue + 28) % 360} 38% 12%) 60%, hsl(${(hue + 40) % 360} 30% 8%) 100%)`,
      }}
    >
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/35 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Car
          className={cn("text-white/25", size === "hero" ? "h-24 w-24" : "h-14 w-14")}
          strokeWidth={1}
        />
      </div>
      {size === "hero" && (make || model) ? (
        <span className="absolute bottom-3 left-4 text-xs font-medium tracking-[0.18em] text-white/45 uppercase">
          {[year, make, model].filter(Boolean).join(" ")}
        </span>
      ) : null}
    </div>
  );
}
