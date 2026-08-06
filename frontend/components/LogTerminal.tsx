"use client";
import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { LogLine } from "@/lib/types";
import { Terminal } from "lucide-react";

// Colour mapping: step → Tailwind text class
const STEP_COLORS: Record<string, string> = {
  validate:      "text-zinc-400",
  pptx_convert:  "text-blue-400",
  tts:           "text-amber-400",
  video_render:  "text-violet-400",
  done:          "text-emerald-400",
  error:         "text-red-400",
  ping:          "text-zinc-700",
};

// Step emoji prefix
const STEP_PREFIX: Record<string, string> = {
  validate:      "🔍",
  pptx_convert:  "🖼 ",
  tts:           "🎙 ",
  video_render:  "🎬",
  done:          "✅",
  error:         "❌",
  ping:          "·",
};

interface LogTerminalProps {
  logs: LogLine[];
  className?: string;
}

export function LogTerminal({ logs, className }: LogTerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className={cn(
      "rounded-xl border border-white/8 bg-zinc-950 overflow-hidden flex flex-col",
      className
    )}>
      {/* Terminal title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-zinc-900/80">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/70" />
          <span className="w-3 h-3 rounded-full bg-amber-500/70" />
          <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
        </div>
        <Terminal className="w-3.5 h-3.5 text-zinc-600 ml-2" />
        <span className="text-xs text-zinc-600 font-mono">ppt2video — pipeline log</span>
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 min-h-[200px] max-h-[400px] font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-zinc-700 select-none">
            Nhật ký sẽ xuất hiện ở đây khi pipeline bắt đầu chạy...
          </div>
        ) : (
          logs.map((line) => {
            if (line.step === "ping" || !line.message) return null;
            const color = STEP_COLORS[line.step] ?? "text-zinc-400";
            const prefix = STEP_PREFIX[line.step] ?? "▸";
            const time = line.timestamp.toLocaleTimeString("vi-VN", {
              hour: "2-digit", minute: "2-digit", second: "2-digit",
            });
            return (
              <div key={line.id} className="flex gap-2 items-start group">
                <span className="text-zinc-700 shrink-0 select-none">{time}</span>
                <span className={cn("shrink-0 select-none", color)}>{prefix}</span>
                <span className={cn("break-words", color)}>{line.message}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
