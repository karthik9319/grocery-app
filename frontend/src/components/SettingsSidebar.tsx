import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, Settings as SettingsIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Input, Label } from "@/components/ui";

export function SettingsSidebar() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [countThreshold, setCountThreshold] = useState(2);
  const [weightThreshold, setWeightThreshold] = useState(200);

  useEffect(() => {
    if (settings) {
      setCountThreshold(settings.count_threshold);
      setWeightThreshold(settings.weight_threshold);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      api.updateSettings({ count_threshold: countThreshold, weight_threshold: weightThreshold }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  return (
    <div className="space-y-1">
      <details className="group rounded-2xl">
        <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface">
          <SettingsIcon className="h-[18px] w-[18px] text-subtle" />
          Settings
          <ChevronDown className="ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 px-3 pb-3 pt-2">
          <div>
            <Label className="text-xs">Alert threshold — counts</Label>
            <Input
              type="number"
              value={countThreshold}
              onChange={(e) => setCountThreshold(parseFloat(e.target.value) || 0)}
              onBlur={() => save.mutate()}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">Alert threshold — grams</Label>
            <Input
              type="number"
              value={weightThreshold}
              onChange={(e) => setWeightThreshold(parseFloat(e.target.value) || 0)}
              onBlur={() => save.mutate()}
              className="h-9"
            />
          </div>
        </div>
      </details>

      <a href={api.exportCsvUrl()} download="inventory_backup.csv" className="block">
        <Button variant="ghost" size="sm" className="w-full justify-start px-3 text-muted">
          <Download className="h-[18px] w-[18px] text-subtle" /> Export CSV
        </Button>
      </a>
    </div>
  );
}
