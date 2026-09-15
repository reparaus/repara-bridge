/**
 * Concern normalization + conservative deduplication (SERVER ONLY).
 *
 * Two jobs, one pass, run once per concern:
 *
 *  1. TRANSLATION — a customer who completed intake in Spanish must not leave a
 *     technician reading Spanish. The normalized English wording is stored in
 *     `normalized_*` columns; the original is left untouched in
 *     `customer_report` / `intake_details` and stays available as
 *     "View original".
 *
 *  2. DEDUPLICATION — the same underlying problem can arrive twice ("passenger
 *     window doesn't work" and "el vidrio del pasajero no baja"). Duplicates are
 *     MERGED (`merged_into_id`, `merged_reports`), never deleted, and only when
 *     the wording clearly describes the same component and symptom. Concerns
 *     that merely share a vehicle system are left separate.
 *
 * Everything degrades quietly: no AI, no 0012 migration, or a provider outage
 * simply means the technician sees the original wording.
 */

import { normalizeToEnglish } from "@/lib/translate.server";
import { parseJsonObject, runJsonCompletion } from "@/lib/ai/provider.server";
import { listConcerns, type ConcernRow } from "@/lib/job/concerns.server";

type Client = { from: (table: string) => any };

/** Translates concern text into English once and stores it. */
async function normalizeConcern(
  client: Client,
  concern: ConcernRow,
  language: string | null,
): Promise<void> {
  const [title, report] = await Promise.all([
    normalizeToEnglish(client, concern.title, { language }),
    normalizeToEnglish(client, concern.customerReport, { language }),
  ]);

  const details: { question: string; answer: string }[] = [];
  for (const detail of concern.intakeDetails.slice(0, 20)) {
    const [q, a] = await Promise.all([
      normalizeToEnglish(client, detail.question, { language }),
      normalizeToEnglish(client, detail.answer, { language }),
    ]);
    details.push({ question: q.text, answer: a.text });
  }

  try {
    await client
      .from("job_concerns")
      .update({
        normalized_title: title.text || concern.title,
        normalized_customer_report: report.text || concern.customerReport,
        normalized_intake_details: details,
        source_language: language ?? null,
        normalized_at: new Date().toISOString(),
      })
      .eq("id", concern.id);
  } catch {
    /* 0012 not applied — originals keep showing */
  }
}

/**
 * Asks the model ONLY whether two or more concerns describe the same underlying
 * problem. It never rewrites, invents or diagnoses anything.
 */
async function findDuplicateGroups(
  concerns: ConcernRow[],
): Promise<{ keep: string; duplicates: string[]; reason: string }[]> {
  if (concerns.length < 2) return [];
  const list = concerns
    .map(
      (c, i) =>
        `${i + 1}. id=${c.id} | title: ${c.normalizedTitle || c.title} | customer said: ${(
          c.normalizedCustomerReport ||
          c.customerReport ||
          ""
        ).slice(0, 300)}`,
    )
    .join("\n");

  try {
    const result = await runJsonCompletion({
      system:
        "You group automotive customer concerns that describe the SAME underlying problem on the same vehicle. " +
        "Be conservative: only group them when the same component AND the same symptom are described, including across languages " +
        "(e.g. 'passenger window does not work' and 'el vidrio del pasajero no baja'). " +
        "Do NOT group concerns that merely involve the same system (brakes noise vs brake pedal feel are separate). " +
        "Never invent a concern, a cause or a symptom. " +
        'Respond with JSON only: {"groups":[{"keep_id":string,"duplicate_ids":[string],"reason":string}]}. ' +
        'If nothing is a duplicate, respond {"groups":[]}.',
      user: list.slice(0, 4000),
      maxOutputTokens: 500,
      temperature: 0,
    });
    const parsed = parseJsonObject(result.text);
    const groups = Array.isArray(parsed['groups']) ? (parsed['groups'] as any[]) : [];
    const ids = new Set(concerns.map((c) => c.id));
    return groups
      .map((g) => ({
        keep: String(g?.keep_id ?? ""),
        duplicates: (Array.isArray(g?.duplicate_ids) ? g.duplicate_ids : [])
          .map((v: unknown) => String(v))
          .filter((v: string) => ids.has(v)),
        reason: String(g?.reason ?? "Describes the same underlying problem."),
      }))
      .filter((g) => ids.has(g.keep) && g.duplicates.some((d: string) => d !== g.keep));
  } catch {
    return [];
  }
}

/**
 * Normalizes (and, once, de-duplicates) the concerns of one job.
 *
 * Idempotent and cheap after the first run: a concern with `normalized_at` set
 * is skipped, so opening a job costs nothing.
 */
export async function normalizeConcerns(
  client: Client,
  requestId: string,
  concerns: ConcernRow[],
  language: string | null,
): Promise<ConcernRow[]> {
  const pending = concerns.filter((c) => !c.normalizedAt);
  if (!pending.length) return concerns;

  for (const concern of pending.slice(0, 12)) {
    await normalizeConcern(client, concern, language);
  }

  let refreshed = await listConcerns(client, requestId);
  if (!refreshed.length) refreshed = concerns;

  // Deduplicate only the first time, on the normalized English wording.
  const active = refreshed.filter((c) => !c.mergedIntoId);
  const groups = await findDuplicateGroups(active);
  for (const group of groups) {
    const keeper = active.find((c) => c.id === group.keep);
    if (!keeper) continue;
    for (const duplicateId of group.duplicates) {
      if (duplicateId === keeper.id) continue;
      const duplicate = active.find((c) => c.id === duplicateId);
      if (!duplicate) continue;
      try {
        await client
          .from("job_concerns")
          .update({ merged_into_id: keeper.id })
          .eq("id", duplicate.id);
        await client
          .from("job_concerns")
          .update({
            // The duplicate's original wording is preserved as supporting
            // customer-reported context, never discarded.
            merged_reports: [
              ...keeper.mergedReports,
              {
                title: duplicate.title,
                original: duplicate.customerReport,
                english: duplicate.normalizedCustomerReport,
                reason: group.reason,
              },
            ],
          })
          .eq("id", keeper.id);
      } catch {
        /* merge is best-effort */
      }
    }
  }

  const final = await listConcerns(client, requestId);
  return final.length ? final : refreshed;
}
