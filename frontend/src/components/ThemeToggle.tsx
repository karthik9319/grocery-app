import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  COLOR_THEMES,
  getStoredColorTheme,
  getStoredTheme,
  setColorTheme,
  setTheme,
  type ColorTheme,
  type ThemeMode,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getStoredTheme);
  const [color, setColor] = useState<ColorTheme>(getStoredColorTheme);

  function choose(next: ThemeMode) {
    setMode(next);
    setTheme(next);
  }

  function chooseColor(next: ColorTheme) {
    setColor(next);
    setColorTheme(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 rounded-xl border-[3px] border-content bg-surface-solid p-1">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              onClick={() => choose(opt.value)}
              className={cn(
                "flex h-7 flex-1 items-center justify-center rounded-lg transition-colors cursor-pointer",
                active ? "bg-theme-400 text-white" : "text-muted hover:bg-surface hover:text-content"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 rounded-xl border-[3px] border-content bg-surface-solid px-2 py-1.5">
        {COLOR_THEMES.map((t) => {
          const active = color === t.value;
          return (
            <button
              key={t.value}
              type="button"
              title={t.label}
              onClick={() => chooseColor(t.value)}
              className={cn(
                "h-5 w-5 shrink-0 rounded-full border-2 transition-transform cursor-pointer",
                active ? "scale-110 border-content" : "border-content/40 hover:scale-105"
              )}
              style={{ backgroundColor: t.swatch }}
            />
          );
        })}
      </div>
    </div>
  );
}

