import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Settings as SettingsIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, Input, Label } from "@/components/ui";

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
    <div className="space-y-5">
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-600">
          <SettingsIcon className="h-4 w-4" /> Settings
        </h3>
        <div className="space-y-3">
          <div>
            <Label>Low stock threshold — count items</Label>
            <Input
              type="number"
              value={countThreshold}
              onChange={(e) => setCountThreshold(parseFloat(e.target.value) || 0)}
              onBlur={() => save.mutate()}
            />
          </div>
          <div>
            <Label>Low stock threshold — vegetables (grams)</Label>
            <Input
              type="number"
              value={weightThreshold}
              onChange={(e) => setWeightThreshold(parseFloat(e.target.value) || 0)}
              onBlur={() => save.mutate()}
            />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-600">
          <Download className="h-4 w-4" /> Backup
        </h3>
        <a href={api.exportCsvUrl()} download="inventory_backup.csv">
          <Button variant="outline" className="w-full">
            Download inventory as CSV
          </Button>
        </a>
      </Card>
    </div>
  );
}
