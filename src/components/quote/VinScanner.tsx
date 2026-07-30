import { useCallback, useEffect, useRef, useState } from "react";
import { Flashlight, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { extractVin, getBarcodeDetectorCtor, VIN_BARCODE_FORMATS } from "@/lib/vin-scan";

type Phase = "starting" | "scanning" | "error";

const UNAVAILABLE = "Camera scanning isn't available. Enter your VIN manually instead.";

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
  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const stopCamera = useCallback(() => {
    stoppedRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let raf = 0;
    let zxingReader: { decodeFromCanvas: (c: HTMLCanvasElement) => { getText(): string } } | null =
      null;
    const canvas = document.createElement("canvas");

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stoppedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          await video.play().catch(() => undefined);
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorchAvailable(Boolean(caps.torch));
        setPhase("scanning");

        const DetectorCtor = getBarcodeDetectorCtor();
        const detector = DetectorCtor
          ? new DetectorCtor({ formats: [...VIN_BARCODE_FORMATS] })
          : null;
        if (!detector) {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          zxingReader = new BrowserMultiFormatReader() as unknown as typeof zxingReader;
        }

        let last = 0;
        const tick = async (now: number) => {
          if (stoppedRef.current) return;
          if (now - last > 220) {
            last = now;
            const v = videoRef.current;
            if (v && v.videoWidth > 0) {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              const ctx = canvas.getContext("2d");
              ctx?.drawImage(v, 0, 0, canvas.width, canvas.height);
              let text: string | null = null;
              try {
                if (detector) {
                  const found = await detector.detect(v);
                  text = found[0]?.rawValue ?? null;
                } else if (zxingReader) {
                  text = zxingReader.decodeFromCanvas(canvas).getText();
                }
              } catch {
                text = null;
              }
              const vin = text ? extractVin(text) : null;
              if (vin) {
                stopCamera();
                onDetected(vin);
                return;
              }
            }
          }
          raf = requestAnimationFrame((t) => void tick(t));
        };
        raf = requestAnimationFrame((t) => void tick(t));
      } catch (err) {
        const name = (err as { name?: string })?.name;
        setPhase("error");
        setMessage(
          name === "NotAllowedError" || name === "SecurityError"
            ? UNAVAILABLE
            : UNAVAILABLE,
        );
      }
    }

    void start();
    return () => {
      cancelAnimationFrame(raf);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] } as MediaTrackConstraints);
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
              <div className="relative aspect-[3/1.4] w-full rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
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
              Usually on the driver's door jamb or the dashboard label.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
