import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/Dialog";
import { Button, Input } from "@/components/ui";

/**
 * Camera-based barcode scanner. Uses ZXing over getUserMedia, which works on iOS Safari
 * and Android/desktop Chrome alike (unlike the native BarcodeDetector API, which iOS
 * doesn't support). getUserMedia requires a secure context, so this works on localhost
 * and over the HTTPS Cloudflare tunnel, but not over plain-HTTP LAN. A manual-entry
 * fallback is always available so a missing/blocked camera never blocks the flow.
 */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStarting(true);

    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, controls) => {
        controlsRef.current = controls;
        if (result) {
          controls.stop();
          onDetected(result.getText());
        }
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStarting(false);
        setError(
          "Couldn't access the camera. Grant camera permission, or type the barcode number below."
        );
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Scan a barcode">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border-[3px] border-content bg-black">
            <video ref={videoRef} className="h-56 w-full object-cover" muted playsInline />
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/70" />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <p className="text-xs text-subtle">
            Point the camera at a product barcode. Or enter the number manually:
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const code = manualCode.trim();
              if (code) onDetected(code);
            }}
          >
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="e.g. 0123456789012"
              inputMode="numeric"
            />
            <Button type="submit" variant="outline" disabled={!manualCode.trim()}>
              Look up
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
