# Fix the VIN barcode scanner (iPhone Safari)

The scanner currently uses the pure-JavaScript ZXing decoder. For long, thin Code 39 VIN labels on iOS it is the weak link: it only samples a few rows per image, chokes on slight tilt, and each attempt runs on the main thread so live frames go stale. Result: nothing ever locks on.

## What changes

1. **Replace the decoder with WASM ZXing** (`zxing-wasm`) — the same C++ engine used by native apps. Configured for Code 39 / Code 128 / Code 93 / ITF / Data Matrix / PDF417, with `tryHarder`, `tryRotate`, and `tryInvert` enabled so tilted and white-on-black labels decode.
2. **Move decoding off the main thread** into a Web Worker, so the camera preview stays at full frame rate and each frame is fresh. One decode in flight at a time, next frame grabbed as soon as the previous returns.
3. **Better frames on iOS Safari**: capture through `ImageBitmap`/`OffscreenCanvas` at native resolution, keep the guide-box crop plus one wide fallback, drop the wasteful 8-variant × 3-scale loop (the WASM engine handles rotation/inversion internally).
4. **Focus and light**: tap-to-focus on the preview, auto-torch toggle offer in low light, and continuous autofocus re-applied after the stream settles (iOS drops the constraint on first play).
5. **Keep the manual paths intact**: Capture button (full-res still) and Photo picker both route through the same WASM decoder, so if live scanning still misses, a photo will read.
6. **Visible feedback**: guide box flashes green on a decode; a small live counter shows frames scanned so it is obvious the loop is actually running instead of silently idle.

No changes to the quote flow, steps, styling, or database.

## Verification

- Automated run against the mobile viewport with a generated Code 39 VIN label (`1HGCM82633A004352`) proving both the live loop and the photo path decode it.
- Confirm the decoder loads in the worker without blocking the preview, and that no external barcode UI is triggered (native `BarcodeDetector` stays disabled).

## Technical notes

- `src/lib/vin-scan.ts` — swap `createFrameDecoder` to a worker-backed `zxing-wasm` reader; keep `extractVin`, crop helpers, and `scanVinFromFile` signatures so callers are untouched.
- New `src/lib/vin-scan.worker.ts` — receives cropped `ImageData`, returns decoded text.
- `src/components/quote/VinScanner.tsx` — frame pump via `requestAnimationFrame` + in-flight guard, tap-to-focus handler, success flash.
- WASM asset is bundled locally (no CDN fetch at runtime).

## Manual action from you

None. After this ships, test on iPhone Safari at `/quote` → Vehicle step → Scan VIN, pointing at the door-jamb barcode.
