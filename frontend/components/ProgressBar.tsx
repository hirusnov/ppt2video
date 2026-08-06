"use client";
import React from "react";
import { cn } from "@/lib/utils";

const STEP_LABELS: Record<string, string> = {
  validate: "Phân tích file",
  pptx_convert: "Chuyển đổi slide",
  tts: "Tạo audio TTS",
  video_render: "Render video",
  done: "Hoàn thành",
  error: "Lỗi",
  queued: "Đang chờ...",
  ping: "",
};

interface ProgressBarProps {
  progress: number;       // 0–100
  step: string;
  className?: string;
}

export function ProgressBar({ progress, step, className }: ProgressBarProps) {
  const label = STEP_LABELS[step] || step;
  const clamped = Math.max(0, Math.min(100, progress));
  const isError = step === "error";
  const isDone = step === "done" && clamped === 100;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className={cn(
          "font-medium transition-colors",
          isError ? "text-red-400" : isDone ? "text-emerald-400" : "text-zinc-300"
        )}>
          {label}
        </span>
        <span className={cn(
          "font-mono tabular-nums",
          isError ? "text-red-400" : isDone ? "text-emerald-400" : "text-zinc-400"
        )}>
          {clamped}%
        </span>
      </div>

      {/* Track */}
      <div className="relative h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
        {/* Fill */}
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            isError
              ? "bg-red-500"
              : isDone
              ? "bg-emerald-500"
              : "bg-gradient-to-r from-violet-500 to-blue-500"
          )}
          style={{ width: `${clamped}%` }}
        />
        {/* Animated shimmer while processing */}
        {!isError && !isDone && clamped > 0 && clamped < 100 && (
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_1.5s_infinite]"
            style={{ backgroundSize: "200% 100%" }}
          />
        )}
      </div>
    </div>
  );
}
