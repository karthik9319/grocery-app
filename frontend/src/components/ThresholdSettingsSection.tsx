import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  disableReminder,
  enableReminder,
  getReminderTime,
  isReminderEnabled,
  setReminderTime,
} from "@/lib/dailyReminder";
import { Input, Label, Switch } from "@/components/ui";

export function ThresholdSettingsSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [countThreshold, setCountThreshold] = useState(2);
  const [weightThreshold, setWeightThreshold] = useState(200);
  const [reminderOn, setReminderOn] = useState(isReminderEnabled());
  const [reminderTime, setReminderTimeState] = useState(getReminderTime());

  useEffect(() => {
    if (settings) {
      setCountThreshold(settings.count_threshold);
      setWeightThreshold(settings.weight_threshold);
    }
  }, [settings]);

  async function handleReminderToggle(checked: boolean) {
    if (checked) {
      const ok = await enableReminder();
      if (!ok) {
        toast.error("Notifications are blocked - allow them for this site in your browser settings.");
        return;
      }
      setReminderOn(true);
    } else {
      disableReminder();
      setReminderOn(false);
    }
  }

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
        <div className="border-t border-line pt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-content">Daily meal reminder</p>
              <p className="text-xs text-muted">
                A notification with today's meal plan, once a day - only while the app is
                open (no background push).
              </p>
            </div>
            <Switch checked={reminderOn} onCheckedChange={handleReminderToggle} />
          </div>
          {reminderOn && (
            <div className="mt-2">
              <Label className="text-xs">Remind me at</Label>
              <Input
                type="time"
                value={reminderTime}
                onChange={(e) => {
                  setReminderTimeState(e.target.value);
                  setReminderTime(e.target.value);
                }}
                className="h-9"
              />
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
