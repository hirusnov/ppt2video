import logging
from pathlib import Path
import edge_tts
from tts.base import TTSEngine
from tts.settings import TTSSettings

logger = logging.getLogger(__name__)


class EdgeTTSEngine(TTSEngine):
    """
    TTS engine backed by Microsoft Edge TTS (edge-tts library).
    Supports Vietnamese voices: vi-VN-HoaiMyNeural and vi-VN-NamMinhNeural.
    Supports rate, pitch, and volume adjustments via SSML parameters.
    """

    SUPPORTED_VOICES = {
        "vi-VN-HoaiMyNeural": "Hoài My (Nữ)",
        "vi-VN-NamMinhNeural": "Nam Minh (Nam)",
    }

    async def generate(
        self,
        text: str,
        settings: TTSSettings,
        output_path: Path,
    ) -> Path:
        """Generate MP3 audio using Edge TTS."""
        voice = settings.voice
        if voice not in self.SUPPORTED_VOICES:
            logger.warning(
                f"[TTS/Edge] Voice '{voice}' not in supported list, falling back to HoaiMy"
            )
            voice = "vi-VN-HoaiMyNeural"

        rate_str = settings.edge_rate_str()
        pitch_str = settings.edge_pitch_str()
        volume_str = settings.edge_volume_str()

        voice_label = self.SUPPORTED_VOICES.get(voice, voice)
        logger.info(
            f"[TTS/Edge] Generating audio "
            f"(voice: {voice_label}, rate: {rate_str}, pitch: {pitch_str})"
        )

        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)

        communicate = edge_tts.Communicate(
            text=text,
            voice=voice,
            rate=rate_str,
            pitch=pitch_str,
            volume=volume_str,
        )

        await communicate.save(str(output_path))

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError(
                f"[TTS/Edge] Output file empty or missing: {output_path}"
            )

        logger.info(
            f"[TTS/Edge] Done → {output_path.name} "
            f"({output_path.stat().st_size // 1024} KB)"
        )
        return output_path
