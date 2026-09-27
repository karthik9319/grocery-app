import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Download, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const OFFLINE_COPY_KEY = "pantry-shopping-offline-copy";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function InstallOfflineSection() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const finish = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", finish);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", finish);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") toast.success("Pantry Pilot installed");
    setInstallPrompt(null);
  }

  async function verifyOffline() {
    setChecking(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const hasCopy = Boolean(localStorage.getItem(OFFLINE_COPY_KEY));
      if (registration?.active && hasCopy) {
        toast.success("Offline-ready: the app shell and shopping list are saved here.", { icon: "✅" });
      } else if (registration?.active) {
        toast.info("The app opens offline. Open Shopping once to save a list copy.");
      } else {
        toast.warning("Offline install is available from the production build, not the development preview.");
      }
    } catch {
      toast.error("Could not verify offline readiness in this browser.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <details className="group rounded-2xl" open>
      <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface">
        <WifiOff className="h-[18px] w-[18px] text-subtle" />
        Install & offline use
        {installed && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Installed
          </span>
        )}
        <ChevronDown className={installed ? "h-4 w-4 text-subtle transition-transform group-open:rotate-180" : "ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180"} />
      </summary>
      <div className="space-y-3 px-3 pb-3 pt-2">
        <p className="text-xs leading-5 text-muted">
          Install Pantry Pilot on your phone for an app-like icon and reliable access to your saved shopping list at the store.
        </p>
        <div className="flex flex-wrap gap-2">
          {installPrompt && !installed && (
            <Button size="sm" onClick={install}>
              <Download className="h-4 w-4" /> Install app
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={verifyOffline} disabled={checking}>
            <RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Verify offline
          </Button>
        </div>
        {!installPrompt && !installed && (
          <p className="rounded-xl border border-line bg-surface-solid p-3 text-xs text-muted">
            On iPhone, use <strong>Share → Add to Home Screen</strong>. On Android or desktop, open the browser menu and choose <strong>Install app</strong>.
          </p>
        )}
      </div>
    </details>
  );
}
