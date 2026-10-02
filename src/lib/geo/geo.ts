/**
 * Repara geographic eligibility — the single place where service-area rules live.
 * Client-safe (pure). Location lookup is injected so a precise geocoder can
 * replace the ZIP-centroid table later without touching the matching rules.
 *
 * Rules:
 *   - In-shop: customer → provider service ZIP distance, capped by the
 *     customer's distance preference (default "nearby").
 *   - Mobile: customer → provider base ZIP distance must be <= travel radius.
 *     A mobile provider without a valid radius is not geographically eligible.
 *   - Unknown distance never invents one: only an exact ZIP match qualifies.
 */

export const TRAVEL_RADIUS_OPTIONS = [5, 10, 15, 25, 50] as const;
export type TravelRadius = (typeof TRAVEL_RADIUS_OPTIONS)[number];

export const CUSTOMER_DISTANCE_OPTIONS = [10, 25, 50] as const;
export type CustomerDistance = (typeof CUSTOMER_DISTANCE_OPTIONS)[number];

/** Max in-shop distance when the customer just wants "nearby" providers. */
export const DEFAULT_NEARBY_MILES = 25;

export type GeoPoint = { lat: number; lon: number };
export type LocationLookup = (zip: string) => GeoPoint | null;

export type ProviderGeo = {
  zip: string | null;
  offersMobile: boolean;
  offersInShop: boolean;
  travelRadiusMiles: number | null;
};

export type GeoResult = {
  eligible: boolean;
  /** Approximate miles, or null when it can't be determined. */
  distanceMiles: number | null;
  /** How the provider would serve this customer. */
  mode: "in_shop" | "mobile" | null;
  reason:
    | "ok"
    | "too_far"
    | "outside_radius"
    | "mobile_missing_radius"
    | "missing_customer_zip"
    | "missing_provider_zip"
    | "distance_unknown";
};

export function normalizeZip(zip: unknown): string | null {
  const z = String(zip ?? "").trim().slice(0, 5);
  return /^\d{5}$/.test(z) ? z : null;
}

export function isValidTravelRadius(r: unknown): r is TravelRadius {
  return TRAVEL_RADIUS_OPTIONS.includes(Number(r) as TravelRadius);
}

export function isValidCustomerDistance(r: unknown): r is CustomerDistance {
  return CUSTOMER_DISTANCE_OPTIONS.includes(Number(r) as CustomerDistance);
}

export function milesBetween(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isProviderGeographicallyEligible(
  provider: ProviderGeo,
  customerZip: unknown,
  lookup: LocationLookup,
  customerMaxMiles?: number | null,
): GeoResult {
  const cz = normalizeZip(customerZip);
  const pz = normalizeZip(provider.zip);
  const inShop = provider.offersInShop || !provider.offersMobile;
  const radius = isValidTravelRadius(provider.travelRadiusMiles) ? provider.travelRadiusMiles : null;
  const shopCap = isValidCustomerDistance(customerMaxMiles) ? customerMaxMiles : DEFAULT_NEARBY_MILES;

  if (!cz) return { eligible: false, distanceMiles: null, mode: null, reason: "missing_customer_zip" };
  if (!pz) return { eligible: false, distanceMiles: null, mode: null, reason: "missing_provider_zip" };

  const a = lookup(cz);
  const b = lookup(pz);
  if (!a || !b) {
    // No distance available: only the identical ZIP is safe to treat as local.
    if (cz === pz) {
      if (inShop) return { eligible: true, distanceMiles: null, mode: "in_shop", reason: "ok" };
      if (radius) return { eligible: true, distanceMiles: null, mode: "mobile", reason: "ok" };
    }
    return { eligible: false, distanceMiles: null, mode: null, reason: "distance_unknown" };
  }

  const d = Math.round(milesBetween(a, b) * 10) / 10;
  if (provider.offersMobile && radius && d <= radius) {
    // Prefer in-shop wording when the shop is also within the customer's range.
    if (inShop && d <= shopCap) return { eligible: true, distanceMiles: d, mode: "in_shop", reason: "ok" };
    return { eligible: true, distanceMiles: d, mode: "mobile", reason: "ok" };
  }
  if (inShop && d <= shopCap) return { eligible: true, distanceMiles: d, mode: "in_shop", reason: "ok" };
  if (provider.offersMobile && !radius && !inShop)
    return { eligible: false, distanceMiles: d, mode: null, reason: "mobile_missing_radius" };
  return {
    eligible: false,
    distanceMiles: d,
    mode: null,
    reason: provider.offersMobile && radius && !inShop ? "outside_radius" : "too_far",
  };
}

/** Customer-facing distance text; never claims precision it doesn't have. */
export function formatDistance(miles: number | null, lang: "en" | "es" = "en"): string | null {
  if (miles == null) return null;
  if (miles < 1) return lang === "es" ? "A menos de 1 milla" : "Less than 1 mile away";
  const n = miles < 10 ? miles.toFixed(1) : String(Math.round(miles));
  return lang === "es" ? `A unas ${n} millas` : `About ${n} miles away`;
}
