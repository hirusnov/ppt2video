"use client";
import React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TTSSettings,
  TTSEngine,
  EDGE_TTS_VOICES,
  KOKORO_VOICES,
} from "@/lib/types";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VoiceSettingsProps {
  settings: TTSSettings;
  onChange: (settings: TTSSettings) => void;
  compact?: boolean; // used inside per-slide override
  disabled?: boolean;
}

export function VoiceSettings({
  settings,
  onChange,
  compact = false,
  disabled = false,
}: VoiceSettingsProps) {
  const isKokoro = settings.engine === "kokoro";

  const update = <K extends keyof TTSSettings>(key: K, value: TTSSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const formatRate = (v: number) => (v >= 0 ? `+${v}%` : `${v}%`);
  const formatPitch = (v: number) => (v >= 0 ? `+${v}Hz` : `${v}Hz`);
  const formatVolume = (v: number) => `${v}%`;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("space-y-4", compact && "space-y-3")}>
        {/* Engine toggle */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Engine TTS
          </label>
          <div className="flex rounded-lg border border-white/10 overflow-hidden p-0.5 bg-zinc-900 gap-0.5">
            {(["edge_tts", "kokoro"] as TTSEngine[]).map((eng) => (
              <button
                key={eng}
                type="button"
                disabled={disabled}
                onClick={() => update("engine", eng)}
                className={cn(
                  "flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200",
                  settings.engine === eng
                    ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {eng === "edge_tts" ? "Edge TTS" : "Kokoro-VN"}
              </button>
            ))}
          </div>
        </div>

        {/* Voice selector */}
        {isKokoro ? (
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">Giọng đọc (Kokoro)</label>
            <Select
              value={settings.kokoroVoice}
              onValueChange={(v) => update("kokoroVoice", v)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn giọng..." />
              </SelectTrigger>
              <SelectContent>
                {KOKORO_VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">Giọng đọc (Edge TTS)</label>
            <Select
              value={settings.voice}
              onValueChange={(v) => update("voice", v)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn giọng..." />
              </SelectTrigger>
              <SelectContent>
                {EDGE_TTS_VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Rate / Pitch / Volume — only for Edge TTS */}
        {isKokoro ? (
          <div className="rounded-lg bg-amber-900/10 border border-amber-500/20 p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-300">
                Không hỗ trợ điều chỉnh tốc độ / cao độ
              </p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                Kokoro tự điều chỉnh prosody theo giọng đã huấn luyện. Rate và pitch
                chỉ khả dụng khi dùng Edge TTS.
              </p>
            </div>
          </div>
        ) : (
          <div className={cn("space-y-4", compact && "space-y-3")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Slider
                    label="Tốc độ (Rate)"
                    valueDisplay={formatRate(settings.rate)}
                    min={-50}
                    max={50}
                    step={5}
                    value={[settings.rate]}
                    onValueChange={([v]) => update("rate", v)}
                    disabled={disabled}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Điều chỉnh tốc độ đọc từ -50% (chậm hơn) đến +50% (nhanh hơn)
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Slider
                    label="Cao độ (Pitch)"
                    valueDisplay={formatPitch(settings.pitch)}
                    min={-20}
                    max={20}
                    step={2}
                    value={[settings.pitch]}
                    onValueChange={([v]) => update("pitch", v)}
                    disabled={disabled}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Điều chỉnh cao độ từ -20Hz (thấp hơn) đến +20Hz (cao hơn)
              </TooltipContent>
            </Tooltip>

            <Slider
              label="Âm lượng (Volume)"
              valueDisplay={formatVolume(settings.volume)}
              min={0}
              max={100}
              step={5}
              value={[settings.volume]}
              onValueChange={([v]) => update("volume", v)}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
