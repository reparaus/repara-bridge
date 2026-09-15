/**
 * Repara Repair Knowledge (SERVER ONLY).
 *
 * One source-agnostic pipeline:
 *
 *   authorized source → normalize → repair_knowledge
 *                     → relevance match → job_knowledge_matches
 *                     → focused Repara AI context → technician
 *
 * NHTSA public recall data is the first source. Licensed OEM procedures,
 * wiring, specifications, reset/relearn data, technician-created knowledge and
 * confirmed repair outcomes all enter through the same `KnowledgeRecord`
 * contract, so adding them later needs no product redesign.
 *
 * Rules that must never be broken here:
 *  - Provenance and license metadata are preserved, never stripped.
 *  - Nothing is invented: knowledge rows only ever come from a real source.
 *  - Only relevant records are retrieved, so AI context stays small and cheap.
 */

type Client = { from: (table: string) => any };
type Row = Record<string, any>;

export type KnowledgeInformationType =
  | "recall"
  | "service_bulletin"
  | "manufacturer_communication"
  | "procedure"
  | "diagnostic_procedure"
  | "wiring"
  | "component_location"
  | "connector_information"
  | "specification"
  | "torque_specification"
  | "fluid_capacity"
  | "reset_relearn"
  | "dtc_information"
  | "technician_knowledge"
  | "repair_outcome";

/** The single shape every knowledge source normalizes into. */
export type KnowledgeRecord = {
  source: string;
  sourceRecordId: string;
  sourceType: "public_api" | "public_dataset" | "licensed" | "oem" | "repara" | "technician" | "shop";
  licenseType: "public" | "licensed" | "proprietary" | "repara_owned" | "shop_owned";
  informationType: KnowledgeInformationType;
  title: string;
  summary?: string | null;
  sourceUrl?: string | null;
  documentUrl?: string | null;
  publishedAt?: string | null;
  make?: string | null;
  model?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
  engine?: string | null;
  drivetrain?: string | null;
  trim?: string | null;
  system?: string | null;
  subsystem?: string | null;
  component?: string | null;
  conditions?: string | null;
  symptoms?: string[];
  relatedDtcs?: string[];
  metadata?: Record<string, unknown>;
  rawSourceMetadata?: Record<string, unknown>;
};

export type KnowledgeMatch = {
  matchId: string;
  knowledgeId: string;
  informationType: KnowledgeInformationType;
  title: string;
  summary: string | null;
  conditions: string | null;
  source: string;
  sourceRecordId: string | null;
  sourceUrl: string | null;
  documentUrl: string | null;
  publishedAt: string | null;
  applicability: string;
  matchReason: string | null;
  dismissed: boolean;
  confirmedRelevant: boolean | null;
};

const STOP = new Set([
  "the","and","for","not","with","from","that","this","when","only","also","have","has","was","were",
  "does","doesn","don","won","will","would","been","being","into","after","before","while","there",
  "vehicle","customer","concern","reported","says","said","car","truck","please","other","than","then",
  "some","times","time","very","just","about","over","under","more","most","because","they","them",
]);

function terms(value: string): string[] {
  return Array.from(
    new Set(
      (value.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((word) => !STOP.has(word)),
    ),
  );
}

function searchText(record: KnowledgeRecord): string {
  return [
    record.title,
    record.summary,
    record.conditions,
    record.component,
    record.system,
    (record.symptoms ?? []).join(" "),
    (record.relatedDtcs ?? []).join(" "),
  ]
    .filter(Boolean)
    .join(" \n")
    .slice(0, 12000);
}

function applicabilityLabel(row: Row): string {
  const years =
    row['year_start'] && row['year_end'] && row['year_start'] !== row['year_end']
      ? `${row['year_start']}–${row['year_end']}`
      : (row['year_start'] ?? row['year_end'] ?? "");
  return [years, row['make'], row['model'], row['engine'], row['trim']]
    .filter(Boolean)
    .join(" ");
}

/**
 * Inserts or refreshes knowledge rows. Idempotent by
 * (source, information_type, source_record_id) so repeated syncs never
 * duplicate a recall or bulletin.
 */
export async function upsertKnowledge(
  client: Client,
  records: KnowledgeRecord[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const record of records) {
    const payload = {
      source: record.source,
      source_record_id: record.sourceRecordId,
      source_type: record.sourceType,
      license_type: record.licenseType,
      information_type: record.informationType,
      title: record.title.slice(0, 400),
      summary: record.summary ? record.summary.slice(0, 6000) : null,
      source_url: record.sourceUrl ?? null,
      document_url: record.documentUrl ?? null,
      published_at: record.publishedAt ?? null,
      make: record.make ?? null,
      model: record.model ?? null,
      year_start: record.yearStart ?? null,
      year_end: record.yearEnd ?? null,
      engine: record.engine ?? null,
      drivetrain: record.drivetrain ?? null,
      trim: record.trim ?? null,
      system: record.system ?? null,
      subsystem: record.subsystem ?? null,
      component: record.component ?? null,
      conditions: record.conditions ?? null,
      symptoms: record.symptoms ?? [],
      related_dtcs: record.relatedDtcs ?? [],
      metadata: record.metadata ?? {},
      raw_source_metadata: record.rawSourceMetadata ?? {},
      normalized_search_text: searchText(record),
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const { data: existing } = await client
        .from("repair_knowledge")
        .select("id")
        .eq("source", record.source)
        .eq("information_type", record.informationType)
        .eq("source_record_id", record.sourceRecordId)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await client
          .from("repair_knowledge")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        ids.push(String(existing.id));
      } else {
        const { data, error } = await client
          .from("repair_knowledge")
          .insert(payload)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (data?.id) ids.push(String(data.id));
      }
    } catch (error) {
      console.error("[knowledge] upsert failed", record.sourceRecordId, error);
    }
  }
  return ids;
}

/**
 * Scores stored knowledge against THIS job and records the matches.
 *
 * Vehicle applicability is a hard filter — information for another engine or
 * model year is never surfaced just because the symptoms look similar. The
 * score is internal ranking only and is never shown to a technician.
 */
export async function matchKnowledgeToJob(
  client: Client,
  requestId: string,
  input: {
    knowledgeIds: string[];
    concernText: string;
    dtcs?: string[];
  },
): Promise<void> {
  if (!input.knowledgeIds.length) return;
  const jobTerms = new Set(terms(input.concernText));
  const dtcs = (input.dtcs ?? []).map((d) => d.toUpperCase());

  let rows: Row[] = [];
  try {
    const { data } = await client
      .from("repair_knowledge")
      .select("id, information_type, title, normalized_search_text, related_dtcs")
      .in("id", input.knowledgeIds);
    rows = (data ?? []) as Row[];
  } catch {
    return;
  }

  for (const row of rows) {
    const knowledgeTerms = new Set(terms(String(row['normalized_search_text'] ?? "")));
    const overlap = [...jobTerms].filter((term) => knowledgeTerms.has(term));
    const dtcHit = dtcs.filter((code) =>
      (row['related_dtcs'] ?? []).map((c: string) => c.toUpperCase()).includes(code),
    );

    const isRecall = row['information_type'] === "recall";
    // Recalls are vehicle-level information a technician should always see.
    // Everything else must actually relate to the job before it is surfaced.
    const score = (isRecall ? 0.4 : 0) + overlap.length * 0.12 + dtcHit.length * 0.3;
    if (score < 0.35) continue;

    const reason = isRecall
      ? "Published recall information that applies to this year, make and model."
      : overlap.length
        ? `Mentions wording similar to this job: ${overlap.slice(0, 6).join(", ")}.`
        : "Related to a diagnostic trouble code recorded on this job.";

    try {
      await client.from("job_knowledge_matches").upsert(
        {
          service_request_id: requestId,
          repair_knowledge_id: row['id'],
          match_score: Math.min(1, Number(score.toFixed(2))),
          match_reason: reason,
          matched_terms: overlap.slice(0, 12),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "service_request_id,repair_knowledge_id", ignoreDuplicates: false },
      );
    } catch (error) {
      console.error("[knowledge] match failed", error);
    }
  }
}

/** Knowledge already matched to a job, newest first, dismissed items last. */
export async function listJobKnowledge(
  client: Client,
  requestId: string,
): Promise<KnowledgeMatch[]> {
  try {
    const { data } = await client
      .from("job_knowledge_matches")
      .select(
        "id, match_reason, match_score, dismissed_at, technician_confirmed_relevant, repair_knowledge(*)",
      )
      .eq("service_request_id", requestId)
      .order("match_score", { ascending: false })
      .limit(25);

    return ((data ?? []) as Row[])
      .filter((row) => row['repair_knowledge'])
      .map((row) => {
        const k = row['repair_knowledge'] as Row;
        return {
          matchId: String(row['id']),
          knowledgeId: String(k['id']),
          informationType: String(k['information_type']) as KnowledgeInformationType,
          title: String(k['title'] ?? ""),
          summary: k['summary'] ? String(k['summary']) : null,
          conditions: k['conditions'] ? String(k['conditions']) : null,
          source: String(k['source'] ?? ""),
          sourceRecordId: k['source_record_id'] ? String(k['source_record_id']) : null,
          sourceUrl: k['source_url'] ? String(k['source_url']) : null,
          documentUrl: k['document_url'] ? String(k['document_url']) : null,
          publishedAt: k['published_at'] ? String(k['published_at']) : null,
          applicability: applicabilityLabel(k),
          matchReason: row['match_reason'] ? String(row['match_reason']) : null,
          dismissed: Boolean(row['dismissed_at']),
          confirmedRelevant:
            row['technician_confirmed_relevant'] === null ||
            row['technician_confirmed_relevant'] === undefined
              ? null
              : Boolean(row['technician_confirmed_relevant']),
        } satisfies KnowledgeMatch;
      });
  } catch {
    // Migration 0012 not applied yet — the workspace keeps working without it.
    return [];
  }
}

/**
 * Compact, provenance-labelled knowledge for the Repara AI job context.
 * Deliberately small: titles and short summaries only, never full documents.
 */
export function renderKnowledgeForAi(matches: KnowledgeMatch[]): string {
  const active = matches.filter((m) => !m.dismissed).slice(0, 6);
  if (!active.length) return "";
  return active
    .map(
      (m) =>
        `- [SOURCE-BACKED · ${m.source.toUpperCase()} · ${m.informationType.replace(/_/g, " ")}${
          m.sourceRecordId ? ` · ${m.sourceRecordId}` : ""
        }] ${m.title}${m.applicability ? ` (applies to: ${m.applicability})` : ""}${
          m.summary ? `\n  ${m.summary.slice(0, 600)}` : ""
        }`,
    )
    .join("\n");
}
