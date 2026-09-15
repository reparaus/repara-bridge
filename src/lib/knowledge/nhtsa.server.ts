/**
 * NHTSA — Repara's FIRST external repair-knowledge source (SERVER ONLY).
 *
 * Only publicly documented, publicly accessible NHTSA interfaces are used, and
 * every record keeps its provenance so it can live beside licensed sources
 * later. Verified against the live service:
 *
 *   Recalls by vehicle
 *     GET https://api.nhtsa.gov/recalls/recallsByVehicle
 *         ?make=&model=&modelYear=                                  → works, no key
 *   Recall by campaign number
 *     GET https://api.nhtsa.gov/recalls/campaignNumber?campaignNumber=
 *   Vehicle identification (vPIC) — already used by Repara's VIN decoder.
 *
 * There is NO public per-vehicle manufacturer-communication / TSB endpoint:
 * `api.nhtsa.gov/manufacturer-communications/...` and friends return 403
 * "Missing Authentication Token". NHTSA publishes manufacturer communications
 * only as bulk flat files. So Repara does NOT claim bulletin coverage it does
 * not have — the generic `information_type = 'manufacturer_communication'`
 * shape exists and an authorized feed can be ingested later through the same
 * `KnowledgeRecord` contract with no product change.
 *
 * Nothing here throws into the Job Workspace: an outage, timeout or malformed
 * response simply yields no new knowledge.
 */

import type { KnowledgeRecord } from "./knowledge.server";

const RECALLS_URL = "https://api.nhtsa.gov/recalls/recallsByVehicle";

type NhtsaRecall = {
  Manufacturer?: string;
  NHTSACampaignNumber?: string;
  ReportReceivedDate?: string;
  Component?: string;
  Summary?: string;
  Consequence?: string;
  Remedy?: string;
  Notes?: string;
  parkIt?: boolean;
  parkOutSide?: boolean;
  overTheAirUpdate?: boolean;
};

function toIso(mmddyyyy: string | undefined): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(mmddyyyy ?? ""));
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}T00:00:00Z`;
}

async function getJson(url: string, timeoutMs = 9000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      console.error("[nhtsa] request failed", res.status, url);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error("[nhtsa] unreachable", (error as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Public NHTSA recall records for a year/make/model.
 *
 * IMPORTANT: this establishes only that a campaign *applies to* this
 * year/make/model. It does NOT establish VIN-specific remedy completion, so
 * callers must never render these as "open" or "unrepaired" recalls.
 */
export async function fetchNhtsaRecalls(vehicle: {
  year: number | null;
  make: string | null;
  model: string | null;
}): Promise<KnowledgeRecord[]> {
  const { year, make, model } = vehicle;
  if (!year || !make || !model) return [];

  const url = `${RECALLS_URL}?make=${encodeURIComponent(make)}&model=${encodeURIComponent(
    model,
  )}&modelYear=${encodeURIComponent(String(year))}`;
  const json = await getJson(url);
  const results: NhtsaRecall[] = Array.isArray(json?.results) ? json.results : [];

  return results
    .filter((r) => r.NHTSACampaignNumber)
    .slice(0, 40)
    .map((r) => {
      const campaign = String(r.NHTSACampaignNumber);
      const component = String(r.Component ?? "").trim();
      return {
        source: "nhtsa",
        sourceRecordId: campaign,
        sourceType: "public_api",
        licenseType: "public",
        informationType: "recall",
        title: `Recall ${campaign} — ${component || "safety recall"}`,
        summary: String(r.Summary ?? "").slice(0, 4000),
        sourceUrl: "https://www.nhtsa.gov/recalls",
        publishedAt: toIso(r.ReportReceivedDate),
        make,
        model,
        yearStart: year,
        yearEnd: year,
        component: component || null,
        conditions: [
          r.Consequence ? `Consequence: ${r.Consequence}` : "",
          r.Remedy ? `Remedy: ${r.Remedy}` : "",
          r.Notes ? `Notes: ${r.Notes}` : "",
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000),
        metadata: {
          manufacturer: r.Manufacturer ?? null,
          parkIt: Boolean(r.parkIt),
          parkOutside: Boolean(r.parkOutSide),
          overTheAirUpdate: Boolean(r.overTheAirUpdate),
          // Applicability is by year/make/model only — never VIN remedy status.
          appliesByYearMakeModelOnly: true,
        },
        rawSourceMetadata: r as Record<string, unknown>,
      } satisfies KnowledgeRecord;
    });
}
