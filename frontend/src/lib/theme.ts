export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function applyTheme(mode: ThemeMode) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = mode === "dark" || (mode === "system" && systemDark);
  document.documentElement.classList.toggle("dark", isDark);
}

export function setTheme(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  applyTheme(mode);
}

export type ColorTheme = "forest" | "ocean" | "sunset" | "grape" | "punk";

export const COLOR_THEMES: { value: ColorTheme; label: string; swatch: string }[] = [
  { value: "forest", label: "Forest", swatch: "#1b7a4d" },
  { value: "ocean", label: "Ocean", swatch: "#1d6fa5" },
  { value: "sunset", label: "Sunset", swatch: "#e4572e" },
  { value: "grape", label: "Grape", swatch: "#8e44ad" },
  { value: "punk", label: "Punk", swatch: "#d7263d" },
];

const COLOR_THEME_KEY = "colorTheme";

export function getStoredColorTheme(): ColorTheme {
  const stored = localStorage.getItem(COLOR_THEME_KEY);
  return COLOR_THEMES.some((t) => t.value === stored) ? (stored as ColorTheme) : "forest";
}

export function applyColorTheme(theme: ColorTheme) {
  document.documentElement.dataset.theme = theme;
}

export function setColorTheme(theme: ColorTheme) {
  localStorage.setItem(COLOR_THEME_KEY, theme);
  applyColorTheme(theme);
}

