from dataclasses import dataclass, field
from typing import Optional, Literal

TTSEngineType = Literal["kokoro", "vieneu"]


@dataclass
class TTSSettings:
    """Unified TTS settings — supports Kokoro and VieNeu engines."""
    engine: TTSEngineType = "kokoro"

    # Kokoro params
    kokoro_voice: str = "diem_trinh"
    speed: float = 1.25

    # VieNeu params
    vieneu_voice: str = "Minh Đức"
    vieneu_style: str = "tu_nhien"   # tu_nhien | tin_tuc | doc_truyen

    def merge(self, override: Optional["TTSSettings"]) -> "TTSSettings":
        if override is None:
            return self
        return TTSSettings(
            engine=override.engine if override.engine else self.engine,
            kokoro_voice=override.kokoro_voice if override.kokoro_voice else self.kokoro_voice,
            speed=override.speed,
            vieneu_voice=override.vieneu_voice if override.vieneu_voice else self.vieneu_voice,
            vieneu_style=override.vieneu_style if override.vieneu_style else self.vieneu_style,
        )

    @classmethod
    def from_dict(cls, d: dict) -> "TTSSettings":
        return cls(
            engine=d.get("engine", "kokoro"),
            kokoro_voice=d.get("kokoroVoice", "diem_trinh"),
            speed=float(d.get("speed", 1.25)),
            vieneu_voice=d.get("vieneuVoice", "Minh Đức"),
            vieneu_style=d.get("vieneuStyle", "tu_nhien"),
        )
