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
      "bg-gradient-to-b from-brand-400 to-brand-600 text-white hover:from-brand-500 hover:to-brand-700 shadow-glow hover:-translate-y-0.5",
    outline:
      "glass text-content hover:border-brand-300 hover:-translate-y-0.5",
    ghost: "text-muted hover:bg-surface hover:text-content",
    danger: "bg-red-500/10 text-red-500 dark:text-red-300 hover:bg-red-500/20 border border-red-500/20",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    icon: "h-9 w-9",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
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
        "glass rounded-2xl text-content shadow-soft transition-all duration-200",
        interactive && "card-hover hover:shadow-medium hover:border-brand-300/60",
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
    neutral: "bg-content/5 text-muted ring-1 ring-line",
    orange: "bg-orange-500/15 text-orange-600 dark:text-orange-300 ring-1 ring-orange-500/30",
    red: "bg-red-500/15 text-red-600 dark:text-red-300 ring-1 ring-red-500/30",
    brand: "bg-brand-500/15 text-brand-700 dark:text-brand-300 ring-1 ring-brand-500/30",
    veg: "bg-veg-500/15 text-veg-600 dark:text-veg-500 ring-1 ring-veg-500/30",
    household: "bg-household-500/15 text-household-600 dark:text-household-500 ring-1 ring-household-500/30",
    snack: "bg-snack-500/15 text-snack-600 dark:text-snack-200 ring-1 ring-snack-500/30",
    accent: "bg-accent-500/15 text-accent-600 dark:text-accent-200 ring-1 ring-accent-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
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
        "h-10 w-full rounded-xl border border-line bg-surface-solid px-3 text-sm text-content placeholder:text-subtle outline-none transition-shadow focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400",
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
        "w-full rounded-xl border border-line bg-surface-solid px-3 py-2 text-sm text-content placeholder:text-subtle outline-none transition-shadow focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400",
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
        "h-5 w-5 shrink-0 rounded-md border border-line bg-surface-solid data-[state=checked]:bg-brand-500 data-[state=checked]:border-brand-500 flex items-center justify-center transition-colors cursor-pointer",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "w-10 h-6 rounded-full bg-content/15 data-[state=checked]:bg-brand-500 relative transition-colors cursor-pointer outline-none",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
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
          "h-10 w-full inline-flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-solid px-3 text-sm text-content outline-none focus:ring-2 focus:ring-brand-400/40 cursor-pointer",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 text-subtle" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="overflow-hidden rounded-xl border border-line bg-surface-solid text-content shadow-lifted z-50">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center rounded-lg px-3 py-2 text-sm outline-none cursor-pointer data-[highlighted]:bg-brand-500/10 data-[state=checked]:font-semibold"
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface py-12 text-center">
      {icon && <div className="text-3xl mb-1 opacity-70">{icon}</div>}
      <p className="font-medium text-content">{title}</p>
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
