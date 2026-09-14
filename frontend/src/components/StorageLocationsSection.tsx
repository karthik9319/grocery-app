import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button, EmptyState, Input } from "@/components/ui";

export function StorageLocationsSection() {
  const queryClient = useQueryClient();

  const { data: storageLocations } = useQuery({
    queryKey: ["storage-locations"],
    queryFn: api.storageLocations,
  });
  const [newLocName, setNewLocName] = useState("");
  const [newLocIcon, setNewLocIcon] = useState("📦");
  const [editingLocId, setEditingLocId] = useState<number | null>(null);
  const [editLocName, setEditLocName] = useState("");
  const [editLocIcon, setEditLocIcon] = useState("");

  const invalidateLocations = () => {
    queryClient.invalidateQueries({ queryKey: ["storage-locations"] });
    queryClient.invalidateQueries({ queryKey: ["meta"] });
  };

  const addLocation = useMutation({
    mutationFn: () => api.addStorageLocation(newLocName.trim(), newLocIcon.trim() || "📦"),
    onSuccess: () => {
      setNewLocName("");
      setNewLocIcon("📦");
      invalidateLocations();
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Couldn't add location.";
      toast.error(message);
    },
  });

  const updateLocation = useMutation({
    mutationFn: ({ id, name, icon }: { id: number; name: string; icon: string }) =>
      api.updateStorageLocation(id, name, icon),
    onSuccess: () => {
      setEditingLocId(null);
      invalidateLocations();
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Couldn't update location.";
      toast.error(message);
    },
  });

  const deleteLocation = useMutation({
    mutationFn: (id: number) => api.deleteStorageLocation(id),
    onSuccess: () => invalidateLocations(),
  });

  return (
    <details className="group rounded-2xl">
      <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface">
        <MapPin className="h-[18px] w-[18px] text-subtle" />
        Storage Locations
        <ChevronDown className="ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 px-3 pb-3 pt-2">
        <p className="text-xs text-muted">
          Customize the options offered when tagging an item's storage location
          (Fridge/Freezer/Pantry/etc.). Deleting one just removes it from the list -
          items already tagged with it keep showing that label.
        </p>
        <div className="space-y-1.5">
          {storageLocations?.map((loc) =>
            editingLocId === loc.id ? (
              <div
                key={loc.id}
                className="flex items-center gap-1.5 rounded-xl border border-line bg-surface-solid p-1.5"
              >
                <Input
                  value={editLocIcon}
                  onChange={(e) => setEditLocIcon(e.target.value)}
                  className="h-8 w-12 text-center"
                  maxLength={4}
                />
                <Input
                  value={editLocName}
                  onChange={(e) => setEditLocName(e.target.value)}
                  className="h-8 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editLocName.trim()) {
                      e.preventDefault();
                      updateLocation.mutate({
                        id: loc.id,
                        name: editLocName.trim(),
                        icon: editLocIcon.trim() || "📦",
                      });
                    }
                  }}
                />
                <button
                  onClick={() =>
                    updateLocation.mutate({
                      id: loc.id,
                      name: editLocName.trim(),
                      icon: editLocIcon.trim() || "📦",
                    })
                  }
                  disabled={!editLocName.trim() || updateLocation.isPending}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-green-600 hover:bg-theme-200 cursor-pointer disabled:opacity-40"
                  aria-label="Save"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setEditingLocId(null)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-subtle hover:bg-theme-200 cursor-pointer"
                  aria-label="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div
                key={loc.id}
                className="flex items-center gap-2 rounded-xl border border-line bg-surface-solid p-2 text-sm"
              >
                <span className="text-base">{loc.icon}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-content">
                  {loc.name}
                </span>
                <button
                  onClick={() => {
                    setEditingLocId(loc.id);
                    setEditLocName(loc.name);
                    setEditLocIcon(loc.icon);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-content hover:bg-theme-200 cursor-pointer"
                  aria-label={`Edit ${loc.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteLocation.mutate(loc.id)}
                  disabled={deleteLocation.isPending}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-red-500 hover:bg-red-500/10 cursor-pointer"
                  aria-label={`Delete ${loc.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          )}
          {!storageLocations?.length && <EmptyState icon="📍" title="No storage locations yet" />}
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <Input
            value={newLocIcon}
            onChange={(e) => setNewLocIcon(e.target.value)}
            placeholder="📦"
            className="h-9 w-12 text-center"
            maxLength={4}
          />
          <Input
            value={newLocName}
            onChange={(e) => setNewLocName(e.target.value)}
            placeholder="e.g. Garage"
            className="h-9 flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newLocName.trim()) {
                e.preventDefault();
                addLocation.mutate();
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!newLocName.trim() || addLocation.isPending}
            onClick={() => addLocation.mutate()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </details>
  );
}
