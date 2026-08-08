"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import { TTSSettings, KOKORO_VOICES } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const backendUrl = (path: string) => {
  const base =
    process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ??
    "http://localhost:8000";
  return `${base}${path}`;
};

type PreviewState = "idle" | "loading" | "playing";

interface VoiceSettingsProps {
  settings: TTSSettings;
  onChange: (settings: TTSSettings) => void;
  compact?: boolean;
  disabled?: boolean;
}

export function VoiceSettings({
  settings,
  onChange,
  compact = false,
  disabled = false,
}: VoiceSettingsProps) {
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewVoice, setPreviewVoice] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewState("idle");
    setPreviewVoice("");
  }, []);

  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  const handlePreview = useCallback(
    async (voiceId: string) => {
      if (previewState === "playing" && previewVoice === voiceId) {
        stopAudio();
        return;
      }
      stopAudio();
      setPreviewState("loading");
      setPreviewVoice(voiceId);

      try {
        const speed = settings.speed ?? 1.25;
        const res = await fetch(
          backendUrl(
            `/api/preview-voice?voice=${encodeURIComponent(voiceId)}&speed=${speed}`,
          ),
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail ?? `HTTP ${res.status}`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.addEventListener("ended", stopAudio);
        audio.addEventListener("error", stopAudio);
        await audio.play();
        setPreviewState("playing");
      } catch (e) {
        console.error("[Preview]", e);
        stopAudio();
      }
    },
    [previewState, previewVoice, stopAudio, settings.speed],
  );

  const speed = settings.speed ?? 1.25;
  const speedLabel = speed.toFixed(2).replace(/\.?0+$/, "") + "x";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {/* Voice selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Giọng đọc (Kokoro-VN)
        </label>
        <div className="flex gap-2">
          <Select
            value={settings.kokoroVoice}
            onValueChange={(v) => {
              stopAudio();
              onChange({ ...settings, kokoroVoice: v });
            }}
            disabled={disabled}
          >
            <SelectTrigger className="flex-1">
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

          {/* Preview button */}
          <button
            type="button"
            disabled={disabled || previewState === "loading"}
            onClick={() => handlePreview(settings.kokoroVoice)}
            title={
              previewState === "playing" &&
              previewVoice === settings.kokoroVoice
                ? "Dừng"
                : "Nghe thử giọng đọc"
            }
            className={cn(
              "shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center transition-all duration-200",
              previewState === "playing" &&
                previewVoice === settings.kokoroVoice
                ? "border-violet-500/60 bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
                : previewState === "loading" &&
                    previewVoice === settings.kokoroVoice
                  ? "border-white/10 bg-zinc-800 text-zinc-500 cursor-wait"
                  : "border-white/10 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-white/20",
              disabled && "opacity-40 cursor-not-allowed",
            )}
          >
            {previewState === "loading" &&
            previewVoice === settings.kokoroVoice ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : previewState === "playing" &&
              previewVoice === settings.kokoroVoice ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
          </button>
        </div>

        {previewState !== "idle" && previewVoice === settings.kokoroVoice && (
          <p className="text-xs text-zinc-500">
            {previewState === "loading"
              ? "Đang tạo audio preview..."
              : "Đang phát — nhấn ■ để dừng"}
          </p>
        )}
      </div>

      {/* Speed slider */}
      <div className="space-y-1.5">
        <Slider
          label="Tốc độ đọc"
          valueDisplay={speedLabel}
          min={0.5}
          max={2.0}
          step={0.05}
          value={[speed]}
          onValueChange={([v]) => onChange({ ...settings, speed: v })}
          disabled={disabled}
        />
        <div className="flex justify-between text-[10px] text-zinc-600 px-0.5">
          <span>0.5x</span>
          <span className="text-zinc-500">Mặc định: 1.25x</span>
          <span>2.0x</span>
        </div>
      </div>
    </div>
  );
}
