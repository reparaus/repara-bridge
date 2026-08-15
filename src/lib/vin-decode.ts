/**
 * ZXing WASM decode core, shared by the main thread and the scan worker.
 *
 * The WASM binary is bundled with the app (no runtime CDN fetch), so scanning
 * works offline and no frame ever leaves the device.
 */
import type { ReaderOptions } from "zxing-wasm/reader";
// Vite resolves this to a hashed asset served from our own origin.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

/**
 * Tuned for factory VIN labels: long, thin Code 39 (often `I…I` delimited) and
 * Code 128, plus the 2D formats on newer service labels. `tryHarder` /
 * `tryRotate` / `tryInvert` let the engine handle tilted and white-on-black
 * labels itself, and `minLineCount: 2` keeps false positives away.
 */
export const readerOptions: ReaderOptions = {
  formats: ["Code39", "Code128", "Code93", "ITF", "DataMatrix", "PDF417", "QRCode"],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  binarizer: "LocalAverage",
  minLineCount: 2,
  maxNumberOfSymbols: 4,
  textMode: "Plain",
};

let ready: Promise<typeof import("zxing-wasm/reader")> | null = null;

async function loadEngine() {
  if (!ready) {
    ready = (async () => {
      const mod = await import("zxing-wasm/reader");
      mod.prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith(".wasm") ? wasmUrl : `${prefix}${path}`,
        },
      });
      return mod;
    })();
  }
  return ready;
}

/** Warms the WASM module so the first frame isn't spent compiling. */
export async function warmDecoder(): Promise<void> {
  await loadEngine();
}

/** Decodes raw pixels, returning the first non-empty barcode text. */
export async function decodeImageData(
  image: ImageData,
  options: ReaderOptions = readerOptions,
): Promise<string | null> {
  const { readBarcodes } = await loadEngine();
  const results = await readBarcodes(image, options);
  for (const result of results) {
    const text = result.text?.trim();
    if (text) return text;
  }
  return null;
}
