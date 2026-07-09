import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl bg-neutral-100/70 p-1 overflow-x-auto",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium text-neutral-500 transition-all cursor-pointer data-[state=active]:bg-white data-[state=active]:text-brand-700 data-[state=active]:shadow-soft",
        className
      )}
      {...props}
    />
  );
}
