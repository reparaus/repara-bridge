import { useCallback, useEffect, useRef, useState } from "react";
import { Flashlight, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createFrameDecoder, extractVin } from "@/lib/vin-scan";

type Phase = "starting" | "scanning" | "error";

const UNAVAILABLE = "Camera scanning isn't available. Enter your VIN manually instead.";
const NOT_A_VIN = "Barcode detected, but it does not appear to be a valid 17-character VIN.";
const TIPS =
  "Move closer, keep the whole barcode inside the frame, hold steady and add light. The driver-door jamb label usually scans best.";

/** Fraction of the frame we crop and decode — matches the on-screen guide box. */
const ROI = { w: 0.92, h: 0.32 };

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
  const streamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);
  const doneRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const stopCamera = useCallback(() => {
    stoppedRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  useEffect(() => {
    // Re-arm after StrictMode's dev double-invoke cleanup.
    stoppedRef.current = false;
    doneRef.current = false;
    let timer: number | undefined;
    let hintTimer: number | undefined;
    const canvas = document.createElement("canvas");

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // High resolution matters: a VIN barcode is thin and wide.
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
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

        const tick = async () => {
          if (stoppedRef.current || doneRef.current) return;
          const v = videoRef.current;
          if (v && v.videoWidth > 0) {
            const cw = Math.round(v.videoWidth * ROI.w);
            const ch = Math.round(v.videoHeight * ROI.h);
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            ctx?.drawImage(
              v,
              Math.round((v.videoWidth - cw) / 2),
              Math.round((v.videoHeight - ch) / 2),
              cw,
              ch,
              0,
              0,
              cw,
              ch,
            );
            let text: string | null = null;
            try {
              text = await decode(canvas);
            } catch {
              text = null;
            }
            if (text) {
              const vin = extractVin(text);
              if (vin) {
                doneRef.current = true; // callback fires exactly once
                stopCamera();
                onDetected(vin);
                return;
              }
              setHint(NOT_A_VIN); // keep scanning
            }
          }
          timer = window.setTimeout(() => void tick(), 130);
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
              <Button type="button" className="h-11 w-full rounded-xl" onClick={() => close("unavailable")}>
                Enter VIN manually
              </Button>
            </div>
          ) : (
            <div className="w-full max-w-sm">
              <div className="relative aspect-[3/1.1] w-full rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
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
