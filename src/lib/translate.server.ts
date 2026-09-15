/**
 * Technician-facing text normalization (SERVER ONLY).
 *
 * Customers write in their own language (`service_requests.preferred_language`).
 * Technicians and Repara AI read normalized English. The customer's ORIGINAL
 * wording is never overwritten — it stays in its own column/JSON and is shown
 * behind a "View original" action.
 *
 * Translations are cached in `content_translations` keyed by a hash of the
 * source text, so the same sentence is never paid for twice and opening a job
 * costs nothing once normalized.
 */

import { ReparaAiError, parseJsonObject, runJsonCompletion } from "@/lib/ai/provider.server";

type Client = { from: (table: string) => any };

/** Stable non-cryptographic hash — cache key only. */
function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ":" + value.length.toString(36);
}

/** Cheap heuristic: does this look like it needs translating at all? */
export function looksNonEnglish(text: string): boolean {
  const value = text.trim();
  if (value.length < 3) return false;
  if (/[¿¡áéíóúñü]/i.test(value)) return true;
  const words = value.toLowerCase().match(/[a-záéíóúñü]+/g) ?? [];
  if (!words.length) return false;
  const spanish = new Set([
    "el","la","los","las","de","del","que","no","se","un","una","por","para","con","esta","está",
    "cuando","hace","hacia","desde","pero","muy","mas","más","ruido","freno","frenos","motor",
    "puerta","ventana","vidrio","luz","aceite","llanta","llantas","carro","coche","camioneta",
    "prende","enciende","funciona","baja","sube","suena","huele","fuga","tablero","semana","dias","días",
  ]);
  const hits = words.filter((w) => spanish.has(w)).length;
  return hits >= 2 || hits / words.length > 0.25;
}

/**
 * Returns English text for technician display.
 *
 * - Already-English (or empty) text is returned untouched, with no AI call.
 * - A cached translation is reused.
 * - AI failures degrade to the original text rather than blocking the job.
 */
export async function normalizeToEnglish(
  client: Client,
  original: string | null | undefined,
  options: { language?: string | null } = {},
): Promise<{ text: string; translated: boolean; original: string }> {
  const source = String(original ?? "").trim();
  const declared = (options.language ?? "").toLowerCase();
  const fallback = { text: source, translated: false, original: source };
  if (!source) return fallback;
  if (declared.startsWith("en") && !looksNonEnglish(source)) return fallback;
  if (!declared && !looksNonEnglish(source)) return fallback;

  const key = hash(source);
  try {
    const { data } = await client
      .from("content_translations")
      .select("translated_text")
      .eq("source_hash", key)
      .eq("target_language", "en")
      .maybeSingle();
    const cached = data?.translated_text ? String(data.translated_text) : "";
    if (cached) return { text: cached, translated: true, original: source };
  } catch {
    /* cache miss / table not present yet — fall through to a live translation */
  }

  let translated = "";
  try {
    const result = await runJsonCompletion({
      system:
        "You translate automotive service text into clear American English for a professional technician. " +
        "Translate faithfully. Do NOT add symptoms, causes, measurements, diagnoses or advice that are not in the source. " +
        "Keep automotive terminology natural (e.g. 'el vidrio no baja' → 'the window will not go down'). " +
        'Respond with JSON only: {"english": string, "detected_language": string}',
      user: source.slice(0, 3000),
      maxOutputTokens: 500,
      temperature: 0,
    });
    const parsed = parseJsonObject(result.text);
    translated = String(parsed['english'] ?? "").trim();
    if (translated) {
      try {
        await client.from("content_translations").upsert(
          {
            source_hash: key,
            source_language: declared || "auto",
            target_language: "en",
            original_text: source.slice(0, 8000),
            translated_text: translated.slice(0, 8000),
            detected_language: String(parsed['detected_language'] ?? "") || null,
            provider: result.provider,
          },
          { onConflict: "source_hash,target_language" },
        );
      } catch {
        /* caching is best-effort */
      }
    }
  } catch (error) {
    if (!(error instanceof ReparaAiError)) console.error("[translate] failed", error);
    return fallback;
  }

  return translated
    ? { text: translated, translated: true, original: source }
    : fallback;
}

/** Normalizes many strings, reusing the cache and skipping English ones. */
export async function normalizeMany(
  client: Client,
  values: (string | null | undefined)[],
  options: { language?: string | null } = {},
): Promise<string[]> {
  const out: string[] = [];
  for (const value of values) {
    const result = await normalizeToEnglish(client, value, options);
    out.push(result.text);
  }
  return out;
}
