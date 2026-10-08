/**
 * Repara AI — provider abstraction (SERVER ONLY).
 *
 * This is the ONLY module in the application that knows which AI vendor is in
 * use. Everything else (customer intake, admin card, database schema, stored AI
 * data) talks to `runJsonCompletion()` and never to a vendor API.
 *
 * Switching providers later is configuration, not a rewrite:
 *
 *   AI_PROVIDER = gemini | openai | openai-compatible     (default: gemini)
 *   AI_MODEL    = provider model id                        (optional override)
 *   AI_API_KEY  = credential for the selected provider (GEMINI_API_KEY for gemini)
 *   AI_BASE_URL = base URL for `openai-compatible` only
 */

export type ReparaAiProviderId = "gemini" | "openai" | "openai-compatible";

export type JsonCompletionRequest = {
  system: string;
  user: string;
  /** Hard cap on generated tokens — always set, for cost control. */
  maxOutputTokens?: number;
  temperature?: number;
};

export type JsonCompletionResult = {
  /** Raw model text. Callers validate it before storing or rendering. */
  text: string;
  provider: ReparaAiProviderId;
  model: string;
};

/** Thrown for every provider failure so callers can degrade gracefully. */
export class ReparaAiError extends Error {
  constructor(
    message: string,
    readonly kind: "unconfigured" | "rate_limited" | "no_credits" | "provider" | "unreadable",
  ) {
    super(message);
    this.name = "ReparaAiError";
  }
}

type ProviderConfig = {
  id: ReparaAiProviderId;
  url: string;
  model: string;
  headers: Record<string, string>;
  /** OpenAI reasoning-era models reject `max_tokens`. */
  outputTokenField: "max_tokens" | "max_completion_tokens";
};

const DEFAULTS: Record<ReparaAiProviderId, { baseUrl: string; model: string }> = {
  // Google's OpenAI-compatible endpoint; 3.8 Flash is the current stable Flash model.
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  "openai-compatible": { baseUrl: "", model: "" },
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function resolveProviderId(): ReparaAiProviderId {
  const raw = env("AI_PROVIDER").toLowerCase();
  if (raw === "gemini" || raw === "google") return "gemini";
  if (raw === "openai") return "openai";
  if (raw === "openai-compatible" || raw === "custom" || raw === "compatible")
    return "openai-compatible";
  return "gemini";
}

/** Resolves provider + credentials at call time (env is injected per request). */
function resolveConfig(): ProviderConfig {
  const id = resolveProviderId();
  const model = env("AI_MODEL") || DEFAULTS[id].model;

  if (id === "gemini") {
    const key = env("GEMINI_API_KEY") || env("AI_API_KEY");
    if (!key) throw new ReparaAiError("AI is not configured.", "unconfigured");
    return {
      id,
      url: `${DEFAULTS.gemini.baseUrl}/chat/completions`,
      model,
      headers: { authorization: `Bearer ${key}` },
      outputTokenField: "max_tokens",
    };
  }

  const key = env("AI_API_KEY") || env("OPENAI_API_KEY");
  if (!key) throw new ReparaAiError("AI is not configured.", "unconfigured");

  const base =
    id === "openai"
      ? env("AI_BASE_URL") || DEFAULTS.openai.baseUrl
      : env("AI_BASE_URL");
  if (!base) throw new ReparaAiError("AI is not configured (AI_BASE_URL missing).", "unconfigured");
  if (!model) throw new ReparaAiError("AI is not configured (AI_MODEL missing).", "unconfigured");

  return {
    id,
    url: `${base.replace(/\/$/, "")}/chat/completions`,
    model,
    headers: { authorization: `Bearer ${key}` },
    outputTokenField: /^(o\d|gpt-5)/i.test(model) ? "max_completion_tokens" : "max_tokens",
  };
}

/** True when an AI provider is configured — used to hide AI UI cleanly. */
export function isAiConfigured(): boolean {
  try {
    resolveConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * One JSON-mode chat completion through the configured provider.
 *
 * The request body stays inside the OpenAI-compatible subset every supported
 * provider accepts, so a provider swap needs no call-site changes.
 */
export async function runJsonCompletion(
  request: JsonCompletionRequest,
): Promise<JsonCompletionResult> {
  const config = resolveConfig();

  const body: Record<string, unknown> = {
    model: config.model,
    temperature: request.temperature ?? 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user.slice(0, 8000) },
    ],
  };
  body[config.outputTokenField] = request.maxOutputTokens ?? 900;

  let res: Response;
  try {
    res = await fetch(config.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...config.headers },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // Never echo the runtime's message: some runtimes include request headers
    // (and therefore the API key) in fetch errors.
    console.error("[repara-ai] request failed", config.id, (error as Error)?.name ?? "Error");
    throw new ReparaAiError("AI service unreachable.", "provider");
  }

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 429) throw new ReparaAiError("AI rate limit reached — try again in a moment.", "rate_limited");
    if (res.status === 402) throw new ReparaAiError("AI credits are exhausted.", "no_credits");
    console.error("[repara-ai] provider error", config.id, res.status, text.slice(0, 300));
    throw new ReparaAiError("The AI service returned an error.", "provider");
  }

  let content = "";
  try {
    content = JSON.parse(text)?.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new ReparaAiError("The AI service returned an unreadable response.", "unreadable");
  }
  if (!content.trim()) throw new ReparaAiError("The AI service returned nothing.", "unreadable");

  return { text: content, provider: config.id, model: config.model };
}

/** Strips code fences and parses a JSON object out of model text. */
export function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new ReparaAiError("The AI response was not valid JSON.", "unreadable");
}
