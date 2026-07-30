/**
 * VIN barcode scanning helpers (browser-only, no network, no uploads).
 *
 * Detection happens entirely on-device: the native `BarcodeDetector` when the
 * browser exposes it (Chrome/Android), otherwise a lazily-imported ZXing
 * decoder (iOS Safari). Nothing is captured, stored or transmitted.
 */

import { VIN_LENGTH } from "./vin";

/** Barcode symbologies used on VIN / door-jamb labels. */
export const VIN_BARCODE_FORMATS = [
  "code_39",
  "code_128",
  "data_matrix",
  "pdf417",
  "qr_code",
  "itf",
] as const;

const VIN_CHARS = /[A-HJ-NPR-Z0-9]/;

/**
 * Pulls a valid 17-character VIN out of raw barcode text. Code 39 VIN labels
 * often wrap the value in `I...I` delimiters or prefix an ISO 3779 marker.
 */
export function extractVin(raw: string): string | null {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!cleaned) return null;

  const candidates = [cleaned];
  if (cleaned.length === VIN_LENGTH + 1 && cleaned.startsWith("I")) candidates.push(cleaned.slice(1));

  for (const candidate of candidates) {
    if (candidate.length === VIN_LENGTH && isVinShape(candidate)) return candidate;
  }
  // Sliding window for labels that encode extra data around the VIN.
  for (let i = 0; i + VIN_LENGTH <= cleaned.length; i++) {
    const slice = cleaned.slice(i, i + VIN_LENGTH);
    if (isVinShape(slice)) return slice;
  }
  return null;
}

function isVinShape(value: string) {
  return value.length === VIN_LENGTH && [...value].every((c) => VIN_CHARS.test(c));
}

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
};

export function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

/** True when this browser can plausibly open a camera for scanning. */
export function isVinScanAvailable(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!window.isSecureContext) return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}
