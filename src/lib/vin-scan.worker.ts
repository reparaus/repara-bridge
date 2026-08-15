/// <reference lib="webworker" />
/**
 * VIN barcode decode worker.
 *
 * Runs the ZXing WASM engine off the main thread so the camera preview keeps a
 * full frame rate while frames are being decoded. Everything stays on-device.
 */
import { readerOptions, decodeImageData } from "./vin-decode";

type Job = { id: number; image: ImageData };

self.onmessage = async (event: MessageEvent<Job>) => {
  const { id, image } = event.data;
  let text: string | null = null;
  try {
    text = await decodeImageData(image, readerOptions);
  } catch {
    text = null;
  }
  (self as unknown as Worker).postMessage({ id, text });
};
