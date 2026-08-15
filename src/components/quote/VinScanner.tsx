import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Flashlight, Image as ImageIcon, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
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
  const [frames, setFrames] = useState(0);
  const [found, setFound] = useState(false);


  const stopCamera = useCallback(() => {
    stoppedRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    decoderRef.current?.dispose?.();
    decoderRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  /**
   * Tap-to-focus. iOS Safari drops focus constraints after the first frames, so
   * a manual re-trigger is the reliable way to get a sharp barcode.
   */
  const refocus = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const caps = (track.getCapabilities?.() ?? {}) as { focusMode?: string[] };
    const modes = caps.focusMode ?? [];
    try {
      if (modes.includes("single-shot")) {
        await track.applyConstraints({
          advanced: [{ focusMode: "single-shot" }],
        } as unknown as MediaTrackConstraints);
      }
      if (modes.includes("continuous")) {
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" }],
        } as unknown as MediaTrackConstraints);
      }
    } catch {
      // Focus control is best-effort; iOS often exposes none of it.
    }
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
          zoom?: { min?: number; max?: number };
        };
        setTorchAvailable(Boolean(caps.torch));
        // Continuous autofocus where the browser allows it (best-effort).
        if (caps.focusMode?.includes("continuous")) {
          await track
            ?.applyConstraints({
              advanced: [{ focusMode: "continuous" }],
            } as unknown as MediaTrackConstraints)
            .catch(() => undefined);
        }
        // A small optical zoom gives long VIN bars more usable pixels without
        // forcing the customer to hold the phone uncomfortably close.
        const maxZoom = caps.zoom?.max;
        const minZoom = caps.zoom?.min ?? 1;
        if (typeof maxZoom === "number" && maxZoom > minZoom) {
          const zoom = Math.min(maxZoom, Math.max(minZoom, 1.5));
          await track
            ?.applyConstraints({ advanced: [{ zoom }] } as unknown as MediaTrackConstraints)
            .catch(() => undefined);
        }

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          await video.play().catch(() => undefined);
        }
        setPhase("scanning");
        hintTimer = window.setTimeout(() => setHint(t("vin.tips")), 8000);

        const decode = await createFrameDecoder();
        decoderRef.current = decode;

        // Frame pump: one decode in flight at a time, and the next frame is
        // grabbed as soon as the previous decode returns, so we always work on
        // fresh pixels instead of a queued backlog.
        const tick = async () => {
          if (stoppedRef.current || doneRef.current) return;
          const v = videoRef.current;
          if (v && v.videoWidth > 0 && v.readyState >= 2) {
            const fw = v.videoWidth;
            const fh = v.videoHeight;
            const vin = await findVinInSource(decode, v, fw, fh, cropsForFrame(fw, fh));
            if (vin) {
              setFound(true);
              finish(vin);
              return;
            }
            setFrames((n) => n + 1);
          }
          if (stoppedRef.current || doneRef.current) return;
          timer = window.setTimeout(() => void tick(), 0);
        };
        void tick();

      } catch (err) {
        const name = (err as { name?: string })?.name;
        setPhase("error");
        setMessage(
          name === "NotAllowedError" || name === "SecurityError"
            ? t("vin.blocked")
            : t("vin.unavailable"),
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
    setHint(t("vin.reading"));
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
      setHint(t("vin.noVinPhoto"));
    } finally {
      setBusy(false);
    }
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setHint(t("vin.reading"));
    try {
      const vin = await scanVinFromFile(file);
      if (vin) {
        finish(vin);
        return;
      }
      setHint(t("vin.noVinPhoto"));
    } catch {
      setHint(t("vin.noVinPhoto"));
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
            <X className="mr-2 size-4" /> {t("vin.cancel")}
          </Button>
          {torchAvailable && (
            <Button
              type="button"
              variant={torchOn ? "default" : "secondary"}
              className="h-11 rounded-xl"
              onClick={() => void toggleTorch()}
            >
              <Flashlight className="size-4" />
              <span className="sr-only">{t("vin.flashlight")}</span>
            </Button>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center px-6">
          {phase === "error" ? (
            <div className="surface-panel max-w-sm space-y-4 p-5 text-center">
              <p className="text-sm">{message ?? t("vin.unavailable")}</p>
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void onPickPhoto(e.target.files?.[0])}
                />
                <span className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium">
                  <ImageIcon className="size-4" /> {t("vin.usePhoto")}
                </span>
              </label>
              <Button
                type="button"
                className="h-11 w-full rounded-xl"
                onClick={() => close("unavailable")}
              >
                {t("vin.manual")}
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
                  <Loader2 className="size-4 animate-spin" /> {t("vin.starting")}
                </span>
              ) : (
                t("vin.point")
              )}
            </p>
            <p className="mt-1 text-xs text-white/70">{hint ?? t("vin.hint")}</p>

            {phase === "scanning" && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 rounded-xl"
                  disabled={busy}
                  onClick={() => void captureStill()}
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Camera className="mr-2 size-4" />
                  )}
                  {t("vin.capture")}
                </Button>
                <label>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void onPickPhoto(e.target.files?.[0])}
                  />
                  <span className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-medium text-white backdrop-blur">
                    <ImageIcon className="size-4" /> {t("vin.photo")}
                  </span>
                </label>
              </div>
            )}

            <Button
              type="button"
              variant="link"
              onClick={() => close("cancel")}
              className="mt-4 h-11 text-xs font-medium text-white underline underline-offset-4"
            >
              {t("vin.manualInstead")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
