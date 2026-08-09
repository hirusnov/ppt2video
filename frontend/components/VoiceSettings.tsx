"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, Loader2, Download } from "lucide-react";
import {
  TTSSettings,
  TTSEngineType,
  KOKORO_VOICES,
  VIENEU_VOICES,
  VIENEU_STYLES,
} from "@/lib/types";
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
  const [previewKey, setPreviewKey] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  // Keep last successful preview blob for download
  const downloadUrlRef = useRef<string | null>(null);
  const downloadNameRef = useRef<string>("preview.mp3");
  const [hasPreview, setHasPreview] = useState(false);

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
    setPreviewKey("");
  }, []);

  useEffect(() => () => stopAudio(), [stopAudio]);

  const handlePreview = useCallback(async () => {
    const key =
      settings.engine === "vieneu"
        ? `vieneu:${settings.vieneuVoice}:${settings.vieneuStyle}`
        : `kokoro:${settings.kokoroVoice}`;

    if (previewState === "playing" && previewKey === key) {
      stopAudio();
      return;
    }
    stopAudio();
    setPreviewState("loading");
    setPreviewKey(key);

    try {
      const params = new URLSearchParams();
      if (settings.engine === "vieneu") {
        params.set("engine", "vieneu");
        params.set("voice", settings.vieneuVoice);
        params.set("style", settings.vieneuStyle);
      } else {
        params.set("engine", "kokoro");
        params.set("voice", settings.kokoroVoice);
        params.set("speed", String(settings.speed ?? 1.25));
      }

      const res = await fetch(backendUrl(`/api/preview-voice?${params}`));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      // Save a separate URL for download
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = URL.createObjectURL(blob);
      const voiceSlug = settings.engine === "vieneu"
        ? settings.vieneuVoice.replace(/\s+/g, "_")
        : settings.kokoroVoice;
      downloadNameRef.current = `preview_${settings.engine}_${voiceSlug}.mp3`;
      setHasPreview(true);

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
  }, [previewState, previewKey, settings, stopAudio]);

  const isVieNeu = settings.engine === "vieneu";
  const currentKey = isVieNeu
    ? `vieneu:${settings.vieneuVoice}:${settings.vieneuStyle}`
    : `kokoro:${settings.kokoroVoice}`;
  const isThisPreviewActive = previewKey === currentKey;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {/* Engine toggle */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Engine TTS
        </label>
        <div className="flex rounded-lg border border-white/10 overflow-hidden p-0.5 bg-zinc-900 gap-0.5">
          {(["kokoro", "vieneu"] as TTSEngineType[]).map((eng) => (
            <button
              key={eng}
              type="button"
              disabled={disabled}
              onClick={() => {
                stopAudio();
                onChange({ ...settings, engine: eng });
              }}
              className={cn(
                "flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200",
                settings.engine === eng
                  ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5",
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {eng === "kokoro" ? "Kokoro-VN" : "VieNeu v3 ✨"}
            </button>
          ))}
        </div>
        {isVieNeu && (
          <p className="text-[11px] text-violet-400/70">
            48 kHz · GPU batched · Emotion cues hỗ trợ
          </p>
        )}
      </div>

      {/* Voice selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Giọng đọc {isVieNeu ? "(VieNeu)" : "(Kokoro-VN)"}
        </label>
        <div className="flex gap-2">
          {isVieNeu ? (
            <Select
              value={settings.vieneuVoice}
              onValueChange={(v) => {
                stopAudio();
                onChange({ ...settings, vieneuVoice: v });
              }}
              disabled={disabled}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Chọn giọng..." />
              </SelectTrigger>
              <SelectContent>
                {VIENEU_VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
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
          )}

          {/* Preview button */}
          <button
            type="button"
            disabled={
              disabled || (previewState === "loading" && isThisPreviewActive)
            }
            onClick={handlePreview}
            title={
              previewState === "playing" && isThisPreviewActive
                ? "Dừng"
                : "Nghe thử"
            }
            className={cn(
              "shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center transition-all duration-200",
              previewState === "playing" && isThisPreviewActive
                ? "border-violet-500/60 bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
                : previewState === "loading" && isThisPreviewActive
                  ? "border-white/10 bg-zinc-800 text-zinc-500 cursor-wait"
                  : "border-white/10 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-white/20",
              disabled && "opacity-40 cursor-not-allowed",
            )}
          >
            {previewState === "loading" && isThisPreviewActive ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : previewState === "playing" && isThisPreviewActive ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
          </button>

          {/* Download button — visible after preview is generated */}
          {hasPreview && (
            <a
              href={downloadUrlRef.current ?? "#"}
              download={downloadNameRef.current}
              title="Tải MP3 preview"
              className={cn(
                "shrink-0 w-9 h-9 rounded-lg border border-white/10 bg-zinc-800",
                "flex items-center justify-center text-zinc-400",
                "hover:text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/10",
                "transition-all duration-200",
                disabled && "opacity-40 pointer-events-none",
              )}
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {previewState !== "idle" && isThisPreviewActive && (
          <p className="text-xs text-zinc-500">
            {previewState === "loading"
              ? "Đang tạo audio preview..."
              : "Đang phát — nhấn ■ để dừng"}
          </p>
        )}
      </div>

      {/* VieNeu style selector */}
      {isVieNeu && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Phong cách đọc
          </label>
          <Select
            value={settings.vieneuStyle}
            onValueChange={(v) => onChange({ ...settings, vieneuStyle: v })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIENEU_STYLES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Speed slider — Kokoro only (VieNeu handles speed via resampling) */}
      <div className="space-y-1.5">
        <Slider
          label="Tốc độ đọc"
          valueDisplay={
            (settings.speed ?? 1.25).toFixed(2).replace(/\.?0+$/, "") + "x"
          }
          min={0.5}
          max={2.0}
          step={0.05}
          value={[settings.speed ?? 1.25]}
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
