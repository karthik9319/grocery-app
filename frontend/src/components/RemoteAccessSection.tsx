import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, Globe } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button, Spinner, Switch } from "@/components/ui";

export function RemoteAccessSection() {
  const queryClient = useQueryClient();

  const { data: tunnel } = useQuery({
    queryKey: ["tunnel-status"],
    queryFn: api.tunnelStatus,
    refetchInterval: 2000,
  });
  const startTunnel = useMutation({
    mutationFn: api.startTunnel,
    onSuccess: (res) => {
      queryClient.setQueryData(["tunnel-status"], res);
      if (res.error) toast.error(res.error);
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not start the tunnel.";
      toast.error(message);
    },
  });
  const stopTunnel = useMutation({
    mutationFn: api.stopTunnel,
    onSuccess: (res) => queryClient.setQueryData(["tunnel-status"], res),
  });

  function copyTunnelUrl() {
    if (!tunnel?.url) return;
    navigator.clipboard.writeText(tunnel.url);
    toast.success("URL copied to clipboard");
  }

  return (
    <details className="group rounded-2xl" open>
      <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface">
        <Globe className="h-[18px] w-[18px] text-subtle" />
        Remote Access
        <ChevronDown className="ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 px-3 pb-3 pt-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-content">Cloudflare Tunnel</p>
            <p className="text-xs text-muted">
              {tunnel?.running ? "Reachable from anywhere" : "Running locally only"}
            </p>
          </div>
          <Switch
            checked={tunnel?.running ?? false}
            onCheckedChange={(checked) =>
              checked ? startTunnel.mutate() : stopTunnel.mutate()
            }
            disabled={startTunnel.isPending || stopTunnel.isPending}
          />
        </div>

        {tunnel?.running && !tunnel.url && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-solid p-2.5 text-xs text-muted">
            <Spinner className="h-4 w-4 shrink-0" />
            Starting tunnel… this can take about 10 seconds.
          </div>
        )}

        {tunnel?.url && (
          <div className="space-y-1.5 rounded-xl border border-line bg-surface-solid p-2.5">
            <p className="break-all font-mono text-xs font-bold text-content">{tunnel.url}</p>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1 justify-center" onClick={copyTunnelUrl}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <a href={tunnel.url} target="_blank" rel="noreferrer" className="flex-1">
                <Button variant="outline" size="sm" className="w-full justify-center">
                  Open
                </Button>
              </a>
            </div>
            <p className="text-xs text-subtle">
              Anyone with this link can use the app - only share it with people you trust.
              A new link is generated each time this is turned on.
            </p>
          </div>
        )}

        {tunnel?.error && !tunnel.running && (
          <p className="text-xs text-red-500">{tunnel.error}</p>
        )}
      </div>
    </details>
  );
}
