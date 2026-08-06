"use client";
import React from "react";
import { Layers } from "lucide-react";
import { SlideData, TTSSettings, SlideSettingsMap, SlideSettings } from "@/lib/types";
import { SlideCard } from "@/components/SlideCard";

interface SlideGridProps {
  slides: SlideData[];
  globalSettings: TTSSettings;
  slideSettingsMap: SlideSettingsMap;
  onSlideSettingsChange: (map: SlideSettingsMap) => void;
}

export function SlideGrid({
  slides,
  globalSettings,
  slideSettingsMap,
  onSlideSettingsChange,
}: SlideGridProps) {
  const overrideCount = Object.values(slideSettingsMap).filter((s) => s?.override).length;

  const handleOverrideChange = (idx: number, override: SlideSettings | undefined) => {
    const next = { ...slideSettingsMap };
    if (override === undefined) {
      delete next[idx];
    } else {
      next[idx] = override;
    }
    onSlideSettingsChange(next);
  };

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-300">
            {slides.length} slide
          </span>
          {overrideCount > 0 && (
            <span className="text-xs text-violet-400">
              ({overrideCount} custom)
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-600">
          Bấm <span className="inline-block bg-zinc-800 rounded px-1.5 py-0.5 border border-white/10 font-mono">⊞</span> để override từng slide
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {slides.map((slide) => (
          <SlideCard
            key={slide.index}
            slide={slide}
            globalSettings={globalSettings}
            slideOverride={slideSettingsMap[slide.index]}
            onOverrideChange={handleOverrideChange}
          />
        ))}
      </div>
    </div>
  );
}
