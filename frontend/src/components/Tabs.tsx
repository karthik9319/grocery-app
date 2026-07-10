import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "glass inline-flex items-center gap-1 rounded-2xl p-1.5 overflow-x-auto shadow-soft",
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
        "whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold text-muted transition-all duration-200 cursor-pointer hover:text-brand-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-brand-500 data-[state=active]:via-brand-600 data-[state=active]:to-household-500 data-[state=active]:text-white data-[state=active]:shadow-glow data-[state=active]:scale-[1.03]",
        className
      )}
      {...props}
    />
  );
}
