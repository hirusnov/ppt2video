from dataclasses import dataclass, field
from typing import Optional, Literal

TTSEngineType = Literal["edge_tts", "kokoro"]


@dataclass
class TTSSettings:
    """Unified TTS settings for a single slide."""
    engine: TTSEngineType = "edge_tts"

    # Edge TTS params
    voice: str = "vi-VN-HoaiMyNeural"
    rate: int = 0        # -50 to +50 (%)
    pitch: int = 0       # -20 to +20 (Hz)
    volume: int = 100    # 0 to 100 (%)

    # Kokoro params
    kokoro_voice: str = "diem_trinh"

    def merge(self, override: Optional["TTSSettings"]) -> "TTSSettings":
        """
        Return a new TTSSettings that applies override on top of self.
        Only non-None fields in override replace self's values.
        """
        if override is None:
            return self
        return TTSSettings(
            engine=override.engine,
            voice=override.voice if override.voice else self.voice,
            rate=override.rate,
            pitch=override.pitch,
            volume=override.volume,
            kokoro_voice=override.kokoro_voice if override.kokoro_voice else self.kokoro_voice,
        )

    @classmethod
    def from_dict(cls, d: dict) -> "TTSSettings":
        """Build from a frontend-sent JSON dict."""
        return cls(
            engine=d.get("engine", "edge_tts"),
            voice=d.get("voice", "vi-VN-HoaiMyNeural"),
            rate=int(d.get("rate", 0)),
            pitch=int(d.get("pitch", 0)),
            volume=int(d.get("volume", 100)),
            kokoro_voice=d.get("kokoroVoice", "diem_trinh"),
        )

    def edge_rate_str(self) -> str:
        """Convert rate int → Edge TTS SSML string e.g. '+20%'."""
        return f"+{self.rate}%" if self.rate >= 0 else f"{self.rate}%"

    def edge_pitch_str(self) -> str:
        """Convert pitch int → Edge TTS SSML string e.g. '+5Hz'."""
        return f"+{self.pitch}Hz" if self.pitch >= 0 else f"{self.pitch}Hz"

    def edge_volume_str(self) -> str:
        """Convert volume 0-100 → Edge TTS SSML string e.g. '+0%'."""
        # Edge TTS volume is relative: 0% = silent, 100% = normal, expressed as +/-XX%
        delta = self.volume - 100
        return f"+{delta}%" if delta >= 0 else f"{delta}%"
