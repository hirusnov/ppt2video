"use client";
import React, { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SlideData,
  TTSSettings,
  SlideSettings,
  KOKORO_VOICES,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { VoiceSettings } from "@/components/VoiceSettings";

interface SlideCardProps {
  slide: SlideData;
  globalSettings: TTSSettings;
  slideOverride: SlideSettings | undefined;
  onOverrideChange: (idx: number, override: SlideSettings | undefined) => void;
}

export function SlideCard({
  slide,
  globalSettings,
  slideOverride,
  onOverrideChange,
}: SlideCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const hasOverride = slideOverride?.override === true;
  const effectiveSettings: TTSSettings = hasOverride
    ? { ...globalSettings, ...slideOverride.settings }
    : globalSettings;

  const voiceLabel =
    KOKORO_VOICES.find((v) => v.id === effectiveSettings.kokoroVoice)?.label ??
    effectiveSettings.kokoroVoice;

  const truncated =
    slide.text.length > 120 ? slide.text.slice(0, 120) + "…" : slide.text;
  const needsExpand = slide.text.length > 120;

  const handleToggleOverride = () => {
    if (hasOverride) {
      // Disable override
      onOverrideChange(slide.index, undefined);
      setOverrideOpen(false);
    } else {
      // Enable override with current global settings as starting point
      onOverrideChange(slide.index, {
        override: true,
        settings: { ...globalSettings },
      });
      setOverrideOpen(true);
    }
  };

  const handleOverrideSettingsChange = (settings: TTSSettings) => {
    onOverrideChange(slide.index, { override: true, settings });
  };

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200",
        hasOverride
          ? "border-violet-500/30 bg-violet-500/5"
          : "border-white/8 bg-zinc-900/50",
      )}
    >
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        {/* Slide number */}
        <div
          className={cn(
            "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
            hasOverride
              ? "bg-violet-500/20 text-violet-300"
              : "bg-zinc-800 text-zinc-400",
          )}
        >
          {slide.index}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500">
              {slide.charCount} ký tự
            </span>
            <span className="text-zinc-700">·</span>
            <span className="text-xs text-zinc-500">Kokoro-VN</span>
            <span className="text-zinc-700">·</span>
            <span className="text-xs text-zinc-500">{voiceLabel}</span>
            {hasOverride && <Badge variant="custom">Custom</Badge>}
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {expanded ? slide.text : truncated}
          </p>
          {needsExpand && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3" /> Thu gọn
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" /> Xem thêm
                </>
              )}
            </button>
          )}
        </div>

        {/* Override toggle button */}
        <button
          type="button"
          onClick={handleToggleOverride}
          title={
            hasOverride ? "Bỏ custom settings" : "Custom settings cho slide này"
          }
          className={cn(
            "shrink-0 p-2 rounded-lg border transition-all duration-200",
            hasOverride
              ? "border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
              : "border-white/10 bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-white/20",
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Override accordion */}
      {hasOverride && overrideOpen && (
        <div className="border-t border-violet-500/20 p-4 pt-3 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-violet-300 uppercase tracking-wide">
              Cài đặt riêng — Slide {slide.index}
            </span>
            <button
              type="button"
              onClick={() => setOverrideOpen(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Thu gọn ↑
            </button>
          </div>
          <VoiceSettings
            settings={effectiveSettings}
            onChange={handleOverrideSettingsChange}
            compact
          />
        </div>
      )}

      {/* Collapsed override indicator */}
      {hasOverride && !overrideOpen && (
        <button
          type="button"
          onClick={() => setOverrideOpen(true)}
          className="w-full border-t border-violet-500/20 py-2 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/5 transition-colors rounded-b-xl flex items-center justify-center gap-1"
        >
          <ChevronDown className="w-3 h-3" />
          Xem cài đặt riêng
        </button>
      )}
    </div>
  );
}
