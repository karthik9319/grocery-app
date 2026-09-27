import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { Button, Card } from "@/components/ui";
import { formatMoney, formatQuantity } from "@/lib/utils";

export function ShoppingTripHistory({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();
  const { data: trips } = useQuery({ queryKey: ["shopping-trips"], queryFn: () => api.shoppingTrips(20) });
  const tripList = Array.isArray(trips) ? trips : [];
  const repeatTrip = useMutation({
    mutationFn: (tripId: number) => api.repeatShoppingTrip(tripId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      toast.success(`Added ${result.added} trip item(s) back to your list`, { icon: "🛍️" });
    },
  });

  if (!tripList.length) return null;

  return (
    <Card className="overflow-hidden print:hidden">
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-content">
          <History className="h-4 w-4 text-theme-600 dark:text-theme-400" />
          Past shopping trips
          <span className="text-xs font-normal text-subtle">{tripList.length}</span>
          <ChevronDown className="ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="divide-y divide-line border-t border-line">
          {tripList.map((trip) => (
            <div key={trip.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-content">
                    {trip.store || "Any store"} · {new Date(trip.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                  <p className="text-xs text-subtle">
                    {trip.items.length} {trip.items.length === 1 ? "item" : "items"}
                    {trip.total_spend > 0 ? ` · ${formatMoney(trip.total_spend)}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => repeatTrip.mutate(trip.id)}
                  disabled={repeatTrip.isPending}
                >
                  <RotateCcw className="h-4 w-4" /> Repeat trip
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {trip.items.map((item) => (
                  <span
                    key={item.id}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-muted"
                  >
                    {item.category ? meta.icons[item.category] : "🛒"} {item.title} · {formatQuantity(item.quantity, item.unit)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
