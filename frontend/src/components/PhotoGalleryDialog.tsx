import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Item } from "@/types";
import { api } from "@/lib/api";
import { cn, imageUrl } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/Dialog";
import { EmptyState } from "@/components/ui";

/** Read-only lightbox/carousel for viewing an item's cover photo + all extra gallery
 * photos together - clicking an ItemCard's thumbnail opens this, separate from the
 * Edit dialog's photo MANAGEMENT section (upload/delete/set-cover). */
export function PhotoGalleryDialog({
  item,
  open,
  onOpenChange,
}: {
  item: Item;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const photosQuery = useQuery({
    queryKey: ["item-photos", item.id],
    queryFn: () => api.itemPhotos(item.id),
    enabled: open,
  });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const galleryPaths = (photosQuery.data ?? []).map((p) => p.image_path);
  const allPaths = item.image_path
    ? [item.image_path, ...galleryPaths.filter((p) => p !== item.image_path)]
    : galleryPaths;

  const current = allPaths[index];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={item.title}>
        {allPaths.length === 0 ? (
          <EmptyState icon="🖼️" title="No photos for this item yet" />
        ) : (
          <div className="space-y-3">
            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 border-content bg-surface-solid">
              <img
                src={imageUrl(current) ?? undefined}
                alt={item.title}
                className="h-full w-full object-contain"
              />
              {allPaths.length > 1 && (
                <>
                  <button
                    onClick={() => setIndex((i) => (i - 1 + allPaths.length) % allPaths.length)}
                    className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border-2 border-content bg-surface-solid text-content hover:bg-theme-200 cursor-pointer"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setIndex((i) => (i + 1) % allPaths.length)}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border-2 border-content bg-surface-solid text-content hover:bg-theme-200 cursor-pointer"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
            {allPaths.length > 1 && (
              <div className="flex items-center justify-center gap-1.5">
                {allPaths.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    aria-label={`Photo ${i + 1}`}
                    className={cn(
                      "h-2.5 w-2.5 rounded-full border-2 border-content cursor-pointer",
                      i === index ? "bg-theme-500" : "bg-surface-solid"
                    )}
                  />
                ))}
              </div>
            )}
            <p className="text-center text-xs text-subtle">
              {index + 1} / {allPaths.length}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
