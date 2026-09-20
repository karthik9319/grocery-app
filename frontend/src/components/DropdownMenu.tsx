import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[180px] overflow-hidden rounded-xl border border-line bg-surface-solid p-1 shadow-xl data-[state=open]:animate-fade-in",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-content outline-none data-[highlighted]:bg-theme-200 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40",
        danger && "text-red-500 data-[highlighted]:bg-red-500/10",
        className
      )}
      {...props}
    />
  );
}
