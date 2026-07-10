import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  className,
  children,
  title,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[3px] border-content bg-surface-solid p-6 shadow-[8px_8px_0_var(--line)] focus:outline-none max-h-[85vh] overflow-y-auto",
          className
        )}
        {...props}
      >
        <div className="rainbow-bar absolute inset-x-0 top-0 h-2 rounded-t-[13px]" aria-hidden />
        <div className="flex items-center justify-between mb-4">
          <DialogPrimitive.Title className="font-display text-lg text-content">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="rounded-lg border-2 border-content p-1 hover:bg-surface text-content cursor-pointer">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogClose = DialogPrimitive.Close;
