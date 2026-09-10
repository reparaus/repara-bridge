/// <reference lib="webworker" />
/**
 * VIN barcode decode worker.
 *
 * Runs the ZXing WASM engine off the main thread so the camera preview keeps a
 * full frame rate while frames are being decoded. Everything stays on-device.
 */
import { readerOptions, decodeImageData } from "./vin-decode";

type Job = { id: number; width: number; height: number; pixels: ArrayBuffer };

self.onmessage = async (event: MessageEvent<Job>) => {
  const { id, width, height, pixels } = event.data;
  try {
    const image = new ImageData(new Uint8ClampedArray(pixels), width, height);
    const text = await decodeImageData(image, readerOptions);
    self.postMessage({ id, text });
  } catch (error) {
    // A decoder/WASM startup failure is not the same as a frame with no barcode.
    // Tell the caller to abandon this worker and retry on the main thread.
    const message = error instanceof Error ? error.message : "VIN decoder failed";
    self.postMessage({ id, text: null, error: message });
  }
};
