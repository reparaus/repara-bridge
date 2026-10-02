import type { GeoPoint, LocationLookup } from "./geo";

/**
 * ZIP → approximate location (Census ZCTA internal point). Server-only and
 * loaded lazily. Swap this for a geocoding provider later; matching rules in
 * geo.ts take any LocationLookup.
 */
let cache: Map<string, GeoPoint> | null = null;

async function load(): Promise<Map<string, GeoPoint>> {
  if (cache) return cache;
  const { ZIP_CENTROIDS_PACKED: s } = await import("./zip-centroids.data.server");
  const map = new Map<string, GeoPoint>();
  for (let i = 0; i + 15 <= s.length; i += 15) {
    map.set(s.slice(i, i + 5), {
      lat: Number(s.slice(i + 5, i + 10)) / 100 - 90,
      lon: Number(s.slice(i + 10, i + 15)) / 100 - 180,
    });
  }
  cache = map;
  return map;
}

export async function getZipLookup(): Promise<LocationLookup> {
  const map = await load();
  return (zip) => map.get(zip) ?? null;
}
