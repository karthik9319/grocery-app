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
      "bg-brand-500 text-white hover:bg-brand-600 shadow-soft hover:shadow-medium",
    outline:
      "border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700",
    ghost: "hover:bg-neutral-100 text-neutral-600",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    icon: "h-9 w-9",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-neutral-200/70 bg-white shadow-soft transition-shadow hover:shadow-medium",
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
  color?: "neutral" | "orange" | "red" | "brand";
}) {
  const colors: Record<string, string> = {
    neutral: "bg-neutral-100 text-neutral-600",
    orange: "bg-orange-50 text-orange-600 ring-1 ring-orange-200",
    red: "bg-red-50 text-red-600 ring-1 ring-red-200",
    brand: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
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
        "h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm placeholder:text-neutral-400 outline-none transition-shadow focus:ring-2 focus:ring-brand-200 focus:border-brand-400",
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
        "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 outline-none transition-shadow focus:ring-2 focus:ring-brand-200 focus:border-brand-400",
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
      className={cn("text-sm font-medium text-neutral-700 mb-1 block", className)}
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
        "h-5 w-5 shrink-0 rounded-md border border-neutral-300 bg-white data-[state=checked]:bg-brand-500 data-[state=checked]:border-brand-500 flex items-center justify-center transition-colors cursor-pointer",
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
        "w-10 h-6 rounded-full bg-neutral-200 data-[state=checked]:bg-brand-500 relative transition-colors cursor-pointer outline-none",
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
          "h-10 w-full inline-flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand-200 cursor-pointer",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 text-neutral-400" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lifted z-50">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none cursor-pointer data-[highlighted]:bg-brand-50 data-[state=checked]:font-semibold"
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 py-12 text-center">
      {icon && <div className="text-3xl mb-1 opacity-70">{icon}</div>}
      <p className="font-medium text-neutral-700">{title}</p>
      {description && <p className="text-sm text-neutral-400 max-w-sm">{description}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin",
        className
      )}
    />
  );
}
