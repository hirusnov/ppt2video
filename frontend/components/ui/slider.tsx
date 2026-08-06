"use client";
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  label?: string;
  valueDisplay?: string;
}

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, label, valueDisplay, disabled, ...props }, ref) => (
  <div className="space-y-1.5">
    {label && (
      <div className="flex items-center justify-between">
        <span className={cn("text-xs text-zinc-400", disabled && "opacity-40")}>{label}</span>
        {valueDisplay && (
          <span className={cn("text-xs font-mono text-zinc-300", disabled && "opacity-40")}>
            {valueDisplay}
          </span>
        )}
      </div>
    )}
    <SliderPrimitive.Root
      ref={ref}
      disabled={disabled}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        disabled && "opacity-40 cursor-not-allowed",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-zinc-800">
        <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-violet-500/50 bg-zinc-900 shadow-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  </div>
));
Slider.displayName = "Slider";
