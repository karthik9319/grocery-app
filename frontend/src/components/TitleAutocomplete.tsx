import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Suggestion } from "@/types";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";

/** A title text input with a dropdown of autocomplete suggestions - merges the user's own
 * previously-tracked item titles with a common-groceries keyword list from the backend.
 * Picking a suggestion also reports its guessed category via onSelectSuggestion. */
export function TitleAutocomplete({
  value,
  onChange,
  onBlur,
  onSelectSuggestion,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onSelectSuggestion?: (suggestion: Suggestion) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: suggestions } = useQuery({
    queryKey: ["suggestions", value.trim().toLowerCase()],
    queryFn: () => api.suggestTitles(value.trim()),
    enabled: value.trim().length >= 2,
    staleTime: 30_000,
  });

  const showList = open && value.trim().length >= 2 && (suggestions?.length ?? 0) > 0;

  function pick(s: Suggestion) {
    onChange(s.title);
    onSelectSuggestion?.(s);
    setOpen(false);
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        value={value}
        placeholder={placeholder}
        className="w-full"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a click on a suggestion registers before the list unmounts.
          blurTimeout.current = setTimeout(() => setOpen(false), 150);
          onBlur?.();
        }}
      />
      {showList && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-56 overflow-y-auto rounded-xl border-[3px] border-content bg-surface-solid shadow-[4px_4px_0_var(--line)]">
          {suggestions!.map((s) => (
            <button
              key={`${s.title}-${s.category}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurTimeout.current) clearTimeout(blurTimeout.current);
                pick(s);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-content hover:bg-surface cursor-pointer"
              )}
            >
              <span>{s.title}</span>
              <span className="text-xs font-medium text-subtle">{s.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
