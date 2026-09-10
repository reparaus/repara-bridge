/**
 * ZXing WASM decode core, shared by the main thread and the scan worker.
 *
 * The WASM binary is served from our own origin (`public/wasm/`) and fetched by
 * URL at runtime — never imported into a bundle — so scanning stays client-only
 * and no frame ever leaves the device.
 */
import type { ReaderOptions } from "zxing-wasm/reader";

/** Same-origin path to the decoder binary shipped in `public/wasm/`. */
const WASM_URL = "/wasm/zxing_reader.wasm";


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
            path.endsWith(".wasm") ? WASM_URL : `${prefix}${path}`,
        },
      });
      return mod;
    })().catch((error) => {
      // A transient mobile fetch/compile failure must not poison every later
      // scan attempt for the lifetime of the page.
      ready = null;
      throw error;
    });
  }
  return ready;
}

/** Clears a failed/unstable WASM instance so the next frame can initialize it. */
export async function resetDecoder(): Promise<void> {
  ready = null;
  try {
    const mod = await import("zxing-wasm/reader");
    mod.purgeZXingModule();
  } catch {
    // The next load still gets a clean attempt through our local promise cache.
  }
}

/** Warms the WASM module so the first frame isn't spent compiling. */
export async function warmDecoder(): Promise<void> {
  await loadEngine();
}

/**
 * Decodes raw pixels, returning every non-empty barcode payload together.
 * Door-jamb labels commonly contain several barcodes; returning only the first
 * meant an unrelated part/production code could hide the VIN beside it.
 */
export async function decodeImageData(
  image: ImageData,
  options: ReaderOptions = readerOptions,
): Promise<string | null> {
  try {
    const { readBarcodes } = await loadEngine();
    const results = await readBarcodes(image, options);
    const texts = results.map((result) => result.text?.trim()).filter(Boolean);
    return texts.length ? texts.join("\n") : null;
  } catch (error) {
    await resetDecoder();
    throw error;
  }
}
