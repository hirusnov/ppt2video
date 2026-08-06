"use client";
import React from "react";
import { TTSSettings, KOKORO_VOICES } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Giọng đọc (Kokoro-VN)
        </label>
        <Select
          value={settings.kokoroVoice}
          onValueChange={(v) => onChange({ ...settings, kokoroVoice: v })}
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
    </div>
  );
}
