import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MealSlot } from "@/types";
import { Input } from "@/components/ui";

export function MealTitleAutocomplete({
  slot,
  value,
  onChange,
}: {
  slot: MealSlot;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: history } = useQuery({
    queryKey: ["meal-history", slot],
    queryFn: () => api.mealPlanHistory(slot),
  });

  const q = value.trim().toLowerCase();
  const matches = q.length >= 1 ? (history ?? []).filter((h) => h.title.toLowerCase().includes(q)).slice(0, 6) : [];
  const showList = open && matches.length > 0;

  return (
    <div className="relative">
      <Input
        placeholder="e.g. Spaghetti Bolognese"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a click on a suggestion registers before the list unmounts.
          blurTimeout.current = setTimeout(() => setOpen(false), 150);
        }}
      />
      {showList && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface-solid shadow-md">
          {matches.map((h) => (
            <button
              key={h.title}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurTimeout.current) clearTimeout(blurTimeout.current);
                onChange(h.title);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-content hover:bg-surface cursor-pointer"
            >
              <span>{h.title}</span>
              <span className="text-xs font-medium text-subtle">{h.times_used}x</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
