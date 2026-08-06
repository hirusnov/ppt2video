import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "error" | "custom";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        {
          "bg-zinc-800 text-zinc-300 ring-zinc-700": variant === "default",
          "bg-zinc-700 text-zinc-200 ring-zinc-600": variant === "secondary",
          "bg-emerald-900/50 text-emerald-300 ring-emerald-700/50": variant === "success",
          "bg-amber-900/50 text-amber-300 ring-amber-700/50": variant === "warning",
          "bg-red-900/50 text-red-300 ring-red-700/50": variant === "error",
          "bg-violet-900/50 text-violet-300 ring-violet-700/50": variant === "custom",
        },
        className
      )}
      {...props}
    />
  );
}
