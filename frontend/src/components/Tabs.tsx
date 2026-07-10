import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "glass inline-flex items-center gap-1 rounded-2xl p-1.5 overflow-x-auto shadow-[4px_4px_0_var(--line)]",
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
        "whitespace-nowrap rounded-xl border-[3px] border-transparent px-4 py-2.5 text-sm font-bold text-muted transition-all duration-150 cursor-pointer hover:text-content data-[state=active]:border-content data-[state=active]:bg-theme-500 data-[state=active]:text-white data-[state=active]:shadow-[3px_3px_0_var(--line)] data-[state=active]:-translate-y-0.5",
        className
      )}
      {...props}
    />
  );
}
