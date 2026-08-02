/**
 * VIN barcode scanning helpers (browser-only, no network, no uploads).
 *
 * Detection happens entirely on-device: the native `BarcodeDetector` when the
 * browser exposes it AND actually supports 1D VIN symbologies, otherwise a
 * lazily-imported ZXing decoder (iOS Safari). Nothing is captured, stored or
 * transmitted.
 */

import { VIN_LENGTH } from "./vin";

/**
 * Symbologies used on VIN / door-jamb labels. Code 39 (often with the `I...I`
 * delimiters) and Code 128 cover virtually every factory VIN label; the 2D
 * formats cover newer service labels.
 */
export const VIN_BARCODE_FORMATS = [
  "code_39",
  "code_128",
  "code_93",
  "itf",
  "data_matrix",
  "pdf417",
  "qr_code",
] as const;

/** 1D formats that must be present for the native detector to be worth using. */
const REQUIRED_1D = ["code_39", "code_128"];

const VIN_CHARS = /^[A-HJ-NPR-Z0-9]+$/; // no I, O or Q

/**
 * Pulls a valid 17-character VIN out of raw barcode text. Code 39 VIN labels
 * often wrap the value in `I...I` delimiters or prefix an ISO 3779 marker.
 */
export function extractVin(raw: string): string | null {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!cleaned) return null;

  const candidates = [cleaned];
  if (cleaned.length === VIN_LENGTH + 1 && cleaned.startsWith("I")) candidates.push(cleaned.slice(1));
  if (cleaned.length === VIN_LENGTH + 2 && cleaned.startsWith("I") && cleaned.endsWith("I"))
    candidates.push(cleaned.slice(1, -1));

  for (const candidate of candidates) {
    if (isVinShape(candidate)) return candidate;
  }
  // Sliding window for labels that encode extra data around the VIN.
  for (let i = 0; i + VIN_LENGTH <= cleaned.length; i++) {
    const slice = cleaned.slice(i, i + VIN_LENGTH);
    if (isVinShape(slice)) return slice;
  }
  return null;
}

function isVinShape(value: string) {
  return value.length === VIN_LENGTH && VIN_CHARS.test(value);
}

type BarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): {
    detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
  };
  getSupportedFormats?: () => Promise<string[]>;
};

export function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

/** Raw text decoder over a canvas frame. Returns null when nothing decodes. */
export type FrameDecoder = (canvas: HTMLCanvasElement) => Promise<string | null>;

/**
 * Builds the best available frame decoder.
 *
 * Native `BarcodeDetector` is used only with the formats the browser reports as
 * supported, and only when the 1D VIN formats are among them — constructing it
 * with unsupported formats throws, and a QR-only detector can never read a VIN
 * label. Everything else falls back to ZXing configured for 1D VIN symbologies
 * with `TRY_HARDER`, which is what actually makes door-jamb labels decode.
 */
export async function createFrameDecoder(): Promise<FrameDecoder> {
  const Ctor = getBarcodeDetectorCtor();
  if (Ctor) {
    try {
      const supported = (await Ctor.getSupportedFormats?.()) ?? [];
      const formats = VIN_BARCODE_FORMATS.filter((f) => supported.includes(f));
      if (REQUIRED_1D.every((f) => formats.includes(f as (typeof VIN_BARCODE_FORMATS)[number]))) {
        const detector = new Ctor({ formats: [...formats] });
        return async (canvas) => {
          try {
            const found = await detector.detect(canvas);
            return found[0]?.rawValue ?? null;
          } catch {
            return null;
          }
        };
      }
    } catch {
      // Fall through to ZXing.
    }
  }

  const [{ HTMLCanvasElementLuminanceSource }, zxing] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const {
    MultiFormatReader,
    DecodeHintType,
    BarcodeFormat,
    BinaryBitmap,
    HybridBinarizer,
  } = zxing;

  const hints = new Map<number, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_93,
    BarcodeFormat.ITF,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.PDF_417,
    BarcodeFormat.QR_CODE,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.ASSUME_GS1, false);

  const reader = new MultiFormatReader();
  reader.setHints(hints as never);

  return async (canvas) => {
    const source = new HTMLCanvasElementLuminanceSource(canvas);
    // Straight, inverted (white-on-black labels) and rotated (vertical labels).
    const variants = [
      () => source,
      () => source.invert(),
      () => source.rotateCounterClockwise(),
    ];
    for (const make of variants) {
      try {
        const bitmap = new BinaryBitmap(new HybridBinarizer(make() as never));
        const result = reader.decode(bitmap);
        const text = result?.getText?.();
        if (text) return text;
      } catch {
        // NotFoundException per variant is normal.
      } finally {
        reader.reset();
      }
    }
    return null;
  };
}

/** A crop rectangle in source-image pixels. */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Maps a rectangle drawn on screen over an `object-cover` video back into raw
 * frame pixels, so we decode exactly what the user framed in the guide box.
 */
export function coverCropRect(
  frameW: number,
  frameH: number,
  viewW: number,
  viewH: number,
  box: Rect,
): Rect {
  const scale = Math.max(viewW / frameW, viewH / frameH);
  const offsetX = (viewW - frameW * scale) / 2;
  const offsetY = (viewH - frameH * scale) / 2;
  return {
    x: (box.x - offsetX) / scale,
    y: (box.y - offsetY) / scale,
    w: box.w / scale,
    h: box.h / scale,
  };
}

export function clampRect(rect: Rect, frameW: number, frameH: number): Rect {
  const x = Math.max(0, Math.min(frameW - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(frameH - 1, Math.round(rect.y)));
  return {
    x,
    y,
    w: Math.max(8, Math.min(frameW - x, Math.round(rect.w))),
    h: Math.max(8, Math.min(frameH - y, Math.round(rect.h))),
  };
}

/** Expands a rect around its centre by `factor`, clamped to the frame. */
export function expandRect(rect: Rect, factor: number, frameW: number, frameH: number): Rect {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const w = rect.w * factor;
  const h = rect.h * factor;
  return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h }, frameW, frameH);
}

const scratch = typeof document === "undefined" ? null : document.createElement("canvas");

/**
 * Tries to read a VIN out of an image source across several crops and scales.
 *
 * Thin 1D VIN bars need pixels: small crops get upscaled before decoding, and
 * every crop is tried in order so the tight guide-box region (highest effective
 * resolution) wins before wider fallbacks.
 */
export async function findVinInSource(
  decode: FrameDecoder,
  source: CanvasImageSource,
  frameW: number,
  frameH: number,
  rects: Rect[],
): Promise<string | null> {
  if (!scratch) return null;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  for (const raw of rects) {
    const rect = clampRect(raw, frameW, frameH);
    // Upscale narrow crops; downscale enormous ones to keep decoding fast.
    const scales = rect.w < 1200 ? [Math.min(3, 1400 / rect.w), 1] : [1, 0.6];
    for (const scale of scales) {
      const w = Math.max(16, Math.round(rect.w * scale));
      const h = Math.max(16, Math.round(rect.h * scale));
      if (w > 4000 || h > 4000) continue;
      scratch.width = w;
      scratch.height = h;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
      let text: string | null = null;
      try {
        text = await decode(scratch);
      } catch {
        text = null;
      }
      if (text) {
        const vin = extractVin(text);
        if (vin) return vin;
      }
    }
  }
  return null;
}

/** True when this browser can plausibly open a camera for scanning. */
export function isVinScanAvailable(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!window.isSecureContext) return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Decodes a VIN from a still photo (camera capture or gallery pick). */
export async function scanVinFromFile(file: File): Promise<string | null> {
  const decode = await createFrameDecoder();
  const bitmap = await loadImage(file);
  const w = "width" in bitmap ? bitmap.width : 0;
  const h = "height" in bitmap ? bitmap.height : 0;
  if (!w || !h) return null;
  return findVinInSource(decode, bitmap as CanvasImageSource, w, h, [
    { x: 0, y: h * 0.34, w, h: h * 0.32 },
    { x: 0, y: 0, w, h },
    { x: w * 0.1, y: h * 0.25, w: w * 0.8, h: h * 0.5 },
  ]);
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

