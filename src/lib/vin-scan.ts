/**
 * VIN barcode scanning helpers (browser-only, no network, no uploads).
 *
 * Decoding runs on the ZXing WASM engine — the same C++ implementation native
 * apps use — inside a Web Worker when available. We intentionally do not use the
 * browser's native `BarcodeDetector`: some Android camera builds surface their
 * own barcode action UI over the page.
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

/** Non-sensitive scanner details for local development diagnostics. */
export function getVinScanDiagnostics() {
  return {
    decoder: "zxing-wasm/reader",
    formats: [...VIN_BARCODE_FORMATS],
    worker: typeof Worker !== "undefined",
  };
}

const VIN_CHARS = /^[A-HJ-NPR-Z0-9]+$/; // no I, O or Q

/**
 * Pulls a valid 17-character VIN out of raw barcode text. Code 39 VIN labels
 * often wrap the value in `I...I` delimiters or prefix an ISO 3779 marker.
 */
export function extractVin(raw: string): string | null {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!cleaned) return null;

  const candidates = [cleaned];
  if (cleaned.length === VIN_LENGTH + 1 && cleaned.startsWith("I"))
    candidates.push(cleaned.slice(1));
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

/** Raw text decoder over a frame's pixels. Returns null when nothing decodes. */
export type FrameDecoder = ((image: ImageData) => Promise<string | null>) & {
  dispose?: () => void;
};

/**
 * Builds a frame decoder backed by the ZXing WASM engine.
 *
 * Decoding happens in a Web Worker so grabbing and decoding frames never blocks
 * the camera preview (the previous main-thread decoder made live frames go
 * stale, which is why nothing ever locked on). If workers are unavailable the
 * same engine runs inline.
 */
export async function createFrameDecoder(): Promise<FrameDecoder> {
  // Samsung Internet has shipped several module-worker/WebAssembly regressions.
  // Keep its decoder on the main thread rather than presenting an apparently
  // active scanner whose worker silently fails every frame.
  const samsungBrowser =
    typeof navigator !== "undefined" && /SamsungBrowser\//i.test(navigator.userAgent);
  const worker = samsungBrowser ? null : createWorker();
  if (worker) {
    let seq = 0;
    let broken = false;
    let inline: ((image: ImageData) => Promise<string | null>) | null = null;
    const pending = new Map<
      number,
      { resolve: (text: string | null) => void; image: ImageData; timer: number }
    >();
    worker.onmessage = (
      event: MessageEvent<{ id: number; text: string | null; error?: string }>,
    ) => {
      const job = pending.get(event.data.id);
      if (job) {
        pending.delete(event.data.id);
        clearTimeout(job.timer);
        if (event.data.error) {
          broken = true;
          worker.terminate();
          void runInline(job.image).catch(() => null).then(job.resolve);
          return;
        }
        job.resolve(event.data.text ?? null);
      }
    };
    worker.onerror = () => {
      // Some Android/Samsung builds fail to instantiate the WASM module inside a
      // module worker. Rather than silently returning null forever (which looked
      // exactly like "the scanner does nothing"), fall back to the main thread.
      broken = true;
      pending.forEach((job) => {
        clearTimeout(job.timer);
        void runInline(job.image).catch(() => null).then(job.resolve);
      });
      pending.clear();
      worker.terminate();
    };
    const runInline = async (image: ImageData) => {
      if (!inline) {
        const { decodeImageData } = await import("./vin-decode");
        inline = (img) => decodeImageData(img);
      }
      return inline(image);
    };
    const decode: FrameDecoder = (image) => {
      if (broken) return runInline(image).catch(() => null);
      return new Promise<string | null>((resolve) => {
        const id = ++seq;
        const timer = window.setTimeout(() => {
          const job = pending.get(id);
          if (!job) return;
          pending.delete(id);
          broken = true;
          worker.terminate();
          void runInline(job.image).catch(() => null).then(job.resolve);
        }, 8000);
        pending.set(id, { resolve, image, timer });
        try {
          const pixels = image.data.buffer.slice(0);
          worker.postMessage({ id, width: image.width, height: image.height, pixels }, [pixels]);
        } catch {
          const job = pending.get(id);
          if (job) clearTimeout(job.timer);
          pending.delete(id);
          broken = true;
          worker.terminate();
          runInline(image)
            .catch(() => null)
            .then(resolve);
        }
      });
    };
    decode.dispose = () => {
      pending.forEach((job) => {
        clearTimeout(job.timer);
        job.resolve(null);
      });
      pending.clear();
      worker.terminate();
    };
    return decode;
  }

  const { decodeImageData, warmDecoder } = await import("./vin-decode");
  await warmDecoder();
  return (image) => decodeImageData(image);
}

/**
 * Decodes a VIN out of a still image file (native camera capture). Android
 * camera apps focus far better than a live preview frame, so this is the
 * reliable fallback when live scanning can't lock on.
 */
export async function scanVinFromFile(file: Blob): Promise<string | null> {
  let decode: FrameDecoder | null = null;
  try {
    decode = await createFrameDecoder();
    const bitmap = await createImageBitmap(file);
    const w = bitmap.width;
    const h = bitmap.height;
    const rects: Rect[] = [
      { x: 0, y: 0, w, h },
      { x: 0, y: h * 0.25, w, h: h * 0.5 },
      { x: w * 0.1, y: h * 0.3, w: w * 0.8, h: h * 0.4 },
    ];
    const vin = await findVinInSource(decode, bitmap, w, h, rects);
    bitmap.close?.();
    return vin;
  } catch {
    return null;
  } finally {
    decode?.dispose?.();
  }
}

function createWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./vin-scan.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }
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
 * Tries to read a VIN out of an image source across the given crops.
 *
 * Thin VIN bars need pixels, so a small crop is upscaled once before decoding;
 * the WASM engine handles rotation, inversion and downscaled passes itself, so
 * we no longer brute-force variants here (that only made frames go stale).
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
    // One upscale pass for narrow crops, then the crop at native resolution.
    // Avoid turning a soft mobile preview into a huge buffer. Samsung browsers
    // otherwise spend seconds copying and decoding each frame while the preview
    // misleadingly continues to move.
    const targetWidth =
      typeof navigator !== "undefined" && /SamsungBrowser\//i.test(navigator.userAgent)
        ? 1100
        : 1600;
    const upscale = rect.w < targetWidth ? Math.min(2, targetWidth / rect.w) : 1;
    const scales = upscale > 1.05 ? [upscale, 1] : [1];
    for (const scale of scales) {
      const w = Math.max(16, Math.round(rect.w * scale));
      const h = Math.max(16, Math.round(rect.h * scale));
      if (w > 4096 || h > 4096) continue;
      scratch.width = w;
      scratch.height = h;
      // High-quality interpolation preserves the edge shape of narrow bars when
      // an iPhone preview crop needs enlarging; nearest-neighbour introduced
      // blocky aliasing and was the concrete regression from the working path.
      ctx.imageSmoothingEnabled = scale > 1;
      if (scale > 1) ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
      let text: string | null = null;
      try {
        text = await decode(ctx.getImageData(0, 0, w, h));
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

