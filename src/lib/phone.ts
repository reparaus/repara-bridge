/**
 * Phone normalization shared by the browser and server. Returns an E.164
 * number (+15551234567) or null when the input can't be delivered to safely.
 * Numbers without a country code are treated as US/Canada (+1).
 */
export function toE164(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10 && /^[2-9]\d{2}[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && /^1[2-9]\d{2}[2-9]/.test(digits)) return `+${digits}`;
  return null;
}

/** External channels a person can choose. In-app notifications are always on. */
export type NotifyChannel = "email" | "sms" | "both" | "in_app";
export const wantsSms = (c: string | null | undefined) => c === "sms" || c === "both" || c === "text";
export const wantsEmail = (c: string | null | undefined) => c === "email" || c === "both" || c === "call";
