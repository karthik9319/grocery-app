import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as LabelPrimitive from "@radix-ui/react-label";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
}) {
  const variants: Record<string, string> = {
    default:
      "bg-theme-500 text-white border-[3px] border-content shadow-[4px_4px_0_var(--line)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--line)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
    outline:
      "bg-surface-solid text-content border-[3px] border-content shadow-[4px_4px_0_var(--line)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--line)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
    ghost: "text-muted border-[3px] border-transparent hover:bg-surface hover:text-content",
    danger:
      "bg-red-500 text-white border-[3px] border-content shadow-[4px_4px_0_var(--line)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--line)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    icon: "h-9 w-9",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "glass rounded-2xl text-content shadow-[4px_4px_0_var(--line)] transition-all duration-150",
        interactive && "card-hover cursor-pointer hover:shadow-[6px_6px_0_var(--line)]",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  color = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  color?: "neutral" | "orange" | "red" | "brand" | "veg" | "household" | "snack" | "accent";
}) {
  const colors: Record<string, string> = {
    neutral: "bg-surface-solid text-content",
    orange: "bg-veg-200 text-content",
    red: "bg-red-400 text-content",
    brand: "bg-theme-200 text-content",
    veg: "bg-veg-200 text-content",
    household: "bg-household-200 text-content",
    snack: "bg-snack-200 text-content",
    accent: "bg-accent-200 text-content",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border-2 border-content px-2.5 py-1 text-xs font-bold shadow-[2px_2px_0_var(--line)]",
        colors[color],
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border-[3px] border-content bg-surface-solid px-3 text-sm font-semibold text-content placeholder:text-subtle placeholder:font-normal outline-none transition-all focus:-translate-x-0.5 focus:-translate-y-0.5 focus:shadow-[3px_3px_0_var(--line)]",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border-[3px] border-content bg-surface-solid px-3 py-2 text-sm font-semibold text-content placeholder:text-subtle placeholder:font-normal outline-none transition-all focus:-translate-x-0.5 focus:-translate-y-0.5 focus:shadow-[3px_3px_0_var(--line)]",
        className
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-sm font-medium text-content mb-1 block", className)}
      {...props}
    />
  );
}

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "h-5 w-5 shrink-0 rounded-md border-2 border-content bg-surface-solid data-[state=checked]:bg-theme-500 flex items-center justify-center transition-colors cursor-pointer",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "w-10 h-6 rounded-full border-2 border-content bg-surface-solid data-[state=checked]:bg-theme-500 relative transition-colors cursor-pointer outline-none",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full border-2 border-content bg-surface-solid transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-white" />
    </SwitchPrimitive.Root>
  );
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "h-10 w-full inline-flex items-center justify-between gap-2 rounded-xl border-[3px] border-content bg-surface-solid px-3 text-sm font-semibold text-content outline-none cursor-pointer transition-all focus:-translate-x-0.5 focus:-translate-y-0.5 focus:shadow-[3px_3px_0_var(--line)]",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 text-subtle" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="overflow-hidden rounded-xl border-[3px] border-content bg-surface-solid text-content shadow-[6px_6px_0_var(--line)] z-50">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center rounded-lg px-3 py-2 text-sm font-semibold outline-none cursor-pointer data-[highlighted]:bg-brand-200 data-[state=checked]:font-extrabold"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-[3px] border-dashed border-content bg-surface-solid py-12 text-center">
      {icon && <div className="text-3xl mb-1 opacity-70">{icon}</div>}
      <p className="font-bold text-content">{title}</p>
      {description && <p className="text-sm text-muted max-w-sm">{description}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 rounded-full border-2 border-brand-500/25 border-t-brand-500 animate-spin",
        className
      )}
    />
  );
}
