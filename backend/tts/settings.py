from dataclasses import dataclass
from typing import Optional


@dataclass
class TTSSettings:
    """Unified TTS settings — Kokoro only."""
    engine: str = "kokoro"

    # Kokoro params
    kokoro_voice: str = "diem_trinh"
    speed: float = 1.25  # 1.0 = normal, 1.25 = 25% faster

    def merge(self, override: Optional["TTSSettings"]) -> "TTSSettings":
        if override is None:
            return self
        return TTSSettings(
            engine="kokoro",
            kokoro_voice=override.kokoro_voice if override.kokoro_voice else self.kokoro_voice,
            speed=override.speed if override.speed != 1.25 else self.speed,
        )

    @classmethod
    def from_dict(cls, d: dict) -> "TTSSettings":
        return cls(
            engine="kokoro",
            kokoro_voice=d.get("kokoroVoice", "diem_trinh"),
            speed=float(d.get("speed", 1.25)),
        )
