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

/** Stable hue per vehicle so a driver's cars stay visually distinguishable. */
function hueFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return hash;
}

export function VehicleVisual({ year, make, model, trim, className, size = "card" }: VehicleVisualProps) {
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
    </div>
  );
}
