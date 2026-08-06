from abc import ABC, abstractmethod
from pathlib import Path
from tts.settings import TTSSettings


class TTSEngine(ABC):
    """Abstract base class for all TTS engines."""

    @abstractmethod
    async def generate(self, text: str, settings: TTSSettings, output_path: Path) -> Path:
        """
        Generate audio for the given text using engine-specific settings.

        Args:
            text: The text to synthesize.
            settings: TTS settings (voice, rate, pitch, etc.).
            output_path: Where to write the audio file (MP3).

        Returns:
            Path to the generated audio file.
        """
        ...

    async def preload(self) -> None:
        """Optional: preload model/resources at startup. Override if needed."""
        pass
