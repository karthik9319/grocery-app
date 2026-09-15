/**
 * Daily meal-plan reminder.
 *
 * Best-effort, client-side only - no server push. This app's dev-mode service worker is
 * deliberately disabled (see vite.config.ts), and even the production build's service
 * worker can't guarantee a notification fires while the app/tab isn't open. This checks
 * a stored "already shown today" flag and the target time every time it's called (see
 * App.tsx, which calls it on load and on an interval while the app is open), and only
 * ever fires once per day, on whichever open tab notices it's time first.
 */
const ENABLED_KEY = "dailyReminderEnabled";
const TIME_KEY = "dailyReminderTime"; // "HH:MM", 24h, local time
const LAST_SHOWN_KEY = "dailyReminderLastShown"; // "YYYY-MM-DD", local calendar date
export const DEFAULT_REMINDER_TIME = "17:00";

const MEAL_SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner", "extra"];

export function isReminderEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === "true";
}

export function getReminderTime(): string {
  return localStorage.getItem(TIME_KEY) || DEFAULT_REMINDER_TIME;
}

export function setReminderTime(time: string): void {
  localStorage.setItem(TIME_KEY, time);
}

/** Requests notification permission (must be called from a user gesture) and, if
 * granted, turns the reminder on. Returns false if permission was denied or the
 * Notification API isn't available at all. */
export async function enableReminder(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return false;
  localStorage.setItem(ENABLED_KEY, "true");
  return true;
}

export function disableReminder(): void {
  localStorage.setItem(ENABLED_KEY, "false");
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Call periodically (on load + interval) while the app is open. Shows a one-time-per-
 * day notification summarizing today's meal plan, once the configured time has passed -
 * skipped entirely if nothing's planned today, so it never nags with an empty message. */
export async function checkAndShowDailyReminder(): Promise<void> {
  if (!isReminderEnabled()) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  const todayKey = localDateStr(now);
  if (localStorage.getItem(LAST_SHOWN_KEY) === todayKey) return;

  const [hours, minutes] = getReminderTime().split(":").map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (now < target) return;

  try {
    const res = await fetch(`/api/meal-plan?start=${todayKey}&end=${todayKey}`);
    if (!res.ok) return;
    const entries: { meal_slot: string; title: string }[] = await res.json();
    if (entries.length === 0) return;

    const bySlot = new Map<string, string[]>();
    for (const e of entries) {
      if (!bySlot.has(e.meal_slot)) bySlot.set(e.meal_slot, []);
      bySlot.get(e.meal_slot)!.push(e.title);
    }
    const lines = MEAL_SLOT_ORDER.filter((slot) => bySlot.has(slot)).map(
      (slot) => `${slot[0].toUpperCase()}${slot.slice(1)}: ${bySlot.get(slot)!.join(", ")}`
    );

    const notification = new Notification("🍽️ Today's Meal Plan", {
      body: lines.join("\n"),
      icon: "/pwa-192.png",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    localStorage.setItem(LAST_SHOWN_KEY, todayKey);
  } catch {
    // Network error - leave "last shown" untouched so the next periodic check retries.
  }
}
