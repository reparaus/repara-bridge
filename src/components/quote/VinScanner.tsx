import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Flashlight, Image as ImageIcon, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  clampRect,
  coverCropRect,
  createFrameDecoder,
  expandRect,
  findVinInSource,
  scanVinFromFile,
  type FrameDecoder,
  type Rect,
} from "@/lib/vin-scan";

type Phase = "starting" | "scanning" | "error";

const UNAVAILABLE = "Camera scanning isn't available. Enter your VIN manually instead.";
const NO_VIN_IN_PHOTO =
  "We couldn't read a VIN in that photo. Get closer so the barcode fills the width, then try again.";
const TIPS =
  "Move closer, keep the whole barcode inside the frame, hold steady and add light. The driver-door jamb label usually scans best.";

/**
 * Full-screen VIN barcode scanner. All decoding happens on-device; no frame
 * ever leaves the browser and nothing is stored.
 */
export function VinScanner({
  onDetected,
  onClose,
}: {
  onDetected: (vin: string) => void;
  onClose: (reason?: "cancel" | "unavailable") => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<FrameDecoder | null>(null);
  const stoppedRef = useRef(false);
  const doneRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  const stopCamera = useCallback(() => {
    stoppedRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const finish = useCallback(
    (vin: string) => {
      if (doneRef.current) return;
      doneRef.current = true; // callback fires exactly once
      stopCamera();
      onDetected(vin);
    },
    [onDetected, stopCamera],
  );

  /**
   * Crops to decode, tightest first. The guide box is mapped back into raw
   * frame pixels so we read exactly what the user framed — the video is
   * `object-cover`, so a fixed slice of the frame is not what's on screen.
   */
  const cropsForFrame = useCallback((frameW: number, frameH: number): Rect[] => {
    const video = videoRef.current;
    const guide = guideRef.current;
    const fallback: Rect[] = [
      { x: frameW * 0.04, y: frameH * 0.34, w: frameW * 0.92, h: frameH * 0.32 },
      { x: 0, y: 0, w: frameW, h: frameH },
    ];
    if (!video || !guide) return fallback;
    const v = video.getBoundingClientRect();
    const g = guide.getBoundingClientRect();
    if (!v.width || !v.height || !g.width || !g.height) return fallback;
    const box = coverCropRect(frameW, frameH, v.width, v.height, {
      x: g.left - v.left,
      y: g.top - v.top,
      w: g.width,
      h: g.height,
    });
    const tight = clampRect(box, frameW, frameH);
    return [tight, expandRect(tight, 1.6, frameW, frameH), { x: 0, y: 0, w: frameW, h: frameH }];
  }, []);

  useEffect(() => {
    // Re-arm after StrictMode's dev double-invoke cleanup.
    stoppedRef.current = false;
    doneRef.current = false;
    let timer: number | undefined;
    let hintTimer: number | undefined;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // High resolution matters: a VIN barcode is thin and wide.
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 2560 },
            height: { ideal: 1440 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
        if (stoppedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as {
          torch?: boolean;
          focusMode?: string[];
        };
        setTorchAvailable(Boolean(caps.torch));
        // Continuous autofocus where the browser allows it (best-effort).
        if (caps.focusMode?.includes("continuous")) {
          await track
            ?.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as unknown as MediaTrackConstraints)
            .catch(() => undefined);
        }

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          await video.play().catch(() => undefined);
        }
        setPhase("scanning");
        hintTimer = window.setTimeout(() => setHint(TIPS), 8000);

        const decode = await createFrameDecoder();
        decoderRef.current = decode;

        const tick = async () => {
          if (stoppedRef.current || doneRef.current) return;
          const v = videoRef.current;
          if (v && v.videoWidth > 0) {
            const fw = v.videoWidth;
            const fh = v.videoHeight;
            const vin = await findVinInSource(decode, v, fw, fh, cropsForFrame(fw, fh));
            if (vin) {
              finish(vin);
              return;
            }
          }
          timer = window.setTimeout(() => void tick(), 90);
        };
        void tick();
      } catch (err) {
        const name = (err as { name?: string })?.name;
        setPhase("error");
        setMessage(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera access was blocked. Allow camera access in your browser settings, or enter your VIN manually."
            : UNAVAILABLE,
        );
      }
    }

    void start();
    return () => {
      if (timer) clearTimeout(timer);
      if (hintTimer) clearTimeout(hintTimer);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn }],
      } as unknown as MediaTrackConstraints);
      setTorchOn((t) => !t);
    } catch {
      setTorchAvailable(false);
    }
  }

  /**
   * Full-resolution still capture. A photo is far sharper than a preview frame,
   * so this is the reliable path when live scanning can't lock on.
   */
  async function captureStill() {
    const video = videoRef.current;
    const decode = decoderRef.current;
    if (!video || !decode || busy || doneRef.current) return;
    setBusy(true);
    setHint("Reading photo…");
    try {
      const fw = video.videoWidth;
      const fh = video.videoHeight;
      const vin = await findVinInSource(decode, video, fw, fh, [
        ...cropsForFrame(fw, fh),
        { x: 0, y: fh * 0.2, w: fw, h: fh * 0.6 },
      ]);
      if (vin) {
        finish(vin);
        return;
      }
      setHint(NO_VIN_IN_PHOTO);
    } finally {
      setBusy(false);
    }
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setHint("Reading photo…");
    try {
      const vin = await scanVinFromFile(file);
      if (vin) {
        finish(vin);
        return;
      }
      setHint(NO_VIN_IN_PHOTO);
    } catch {
      setHint(NO_VIN_IN_PHOTO);
    } finally {
      setBusy(false);
    }
  }

  function close(reason: "cancel" | "unavailable") {
    stopCamera();
    onClose(reason);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="absolute inset-0 size-full object-cover"
      />

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex items-center justify-between p-4">
          <Button
            type="button"
            variant="secondary"
            className="h-11 rounded-xl"
            onClick={() => close("cancel")}
          >
            <X className="mr-2 size-4" /> Cancel
          </Button>
          {torchAvailable && (
            <Button
              type="button"
              variant={torchOn ? "default" : "secondary"}
              className="h-11 rounded-xl"
              onClick={() => void toggleTorch()}
            >
              <Flashlight className="size-4" />
              <span className="sr-only">Toggle flashlight</span>
            </Button>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center px-6">
          {phase === "error" ? (
            <div className="surface-panel max-w-sm space-y-4 p-5 text-center">
              <p className="text-sm">{message ?? UNAVAILABLE}</p>
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void onPickPhoto(e.target.files?.[0])}
                />
                <span className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium">
                  <ImageIcon className="size-4" /> Use a photo instead
                </span>
              </label>
              <Button type="button" className="h-11 w-full rounded-xl" onClick={() => close("unavailable")}>
                Enter VIN manually
              </Button>
            </div>
          ) : (
            <div className="w-full max-w-sm">
              <div
                ref={guideRef}
                className="relative aspect-[3/1.1] w-full rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              >
                <span className="absolute inset-x-6 top-1/2 h-px bg-white/70" />
              </div>
            </div>
          )}
        </div>

        {phase !== "error" && (
          <div className="p-6 pb-10 text-center">
            <p className="text-sm font-medium text-white">
              {phase === "starting" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Starting camera…
                </span>
              ) : (
                "Point your camera at the VIN barcode"
              )}
            </p>
            <p className="mt-1 text-xs text-white/70">
              {hint ?? "Usually on the driver's door jamb or the dashboard label."}
            </p>

            {phase === "scanning" && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 rounded-xl"
                  disabled={busy}
                  onClick={() => void captureStill()}
                >
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Camera className="mr-2 size-4" />}
                  Capture
                </Button>
                <label>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void onPickPhoto(e.target.files?.[0])}
                  />
                  <span className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-medium text-white backdrop-blur">
                    <ImageIcon className="size-4" /> Photo
                  </span>
                </label>
              </div>
            )}

            <button
              type="button"
              onClick={() => close("cancel")}
              className="mt-4 text-xs font-medium text-white underline underline-offset-4"
            >
              Enter VIN manually instead
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
