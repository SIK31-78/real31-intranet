import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-green-700 text-white border-transparent hover:bg-green-600",
  secondary: "bg-surface text-ink border-line hover:bg-surface-2 hover:border-line-2",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-err-700 border-line hover:bg-err-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-[26px] px-2.5 text-[12px] rounded-sm",
  md: "h-8 px-3 text-[13px] rounded-md",
  lg: "h-[38px] px-4 text-[14px] rounded-md",
};

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium leading-none border cursor-pointer",
        "transition-colors duration-75 [&>svg]:w-3.5 [&>svg]:h-3.5",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
