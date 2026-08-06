import asyncio
import logging
import subprocess
from pathlib import Path
from typing import Optional

from tts.base import TTSEngine
from tts.settings import TTSSettings

logger = logging.getLogger(__name__)

# All 14 Kokoro-Vietnamese voice IDs → display labels
KOKORO_VOICE_MAP: dict[str, str] = {
    "diem_trinh": "Diễm Trinh",
    "mai_linh": "Mai Linh",
    "tuan_ngoc": "Tuấn Ngọc",
    "thu_ha": "Thu Hà",
    "bao_chau": "Bảo Châu",
    "minh_quan": "Minh Quân",
    "hong_nhung": "Hồng Nhung",
    "duc_tuan": "Đức Tuấn",
    "my_tam": "Mỹ Tâm",
    "quang_dung": "Quang Dũng",
    "thanh_lam": "Thanh Lam",
    "le_quyen": "Lệ Quyên",
    "trong_tan": "Trọng Tấn",
    "anh_tho": "Anh Thơ",
}

# Cache: voice_id → KokoroVietnamese instance
# Each instance is bound to one voice at init time.
_kokoro_cache: dict[str, object] = {}
_kokoro_lock = asyncio.Lock()


class KokoroEngine(TTSEngine):
    """
    TTS engine backed by Kokoro-Vietnamese (ONNX Runtime, CPU inference).

    API: KokoroVietnamese(voice=<id>, device="cpu")
         instance.synthesize(text) → (np.ndarray, sample_rate: str)

    One instance is created per voice and cached for reuse.
    Fallback to Edge TTS on any error.
    """

    async def preload(self) -> None:
        """Pre-warm the default voice (diem_trinh) at startup."""
        await self._get_instance("diem_trinh")
        logger.info("[TTS/Kokoro] Default voice pre-loaded.")

    async def _get_instance(self, voice_id: str) -> object:
        """Get or create a cached KokoroVietnamese instance for this voice."""
        async with _kokoro_lock:
            if voice_id not in _kokoro_cache:
                logger.info(f"[TTS/Kokoro] Loading model for voice '{voice_id}'...")
                loop = asyncio.get_event_loop()
                instance = await loop.run_in_executor(
                    None, self._load_model, voice_id
                )
                _kokoro_cache[voice_id] = instance
                logger.info(f"[TTS/Kokoro] Model ready for voice '{voice_id}'.")
            return _kokoro_cache[voice_id]

    def _load_model(self, voice_id: str) -> object:
        """Blocking model load — runs in thread pool executor."""
        from kokoro_vietnamese import KokoroVietnamese  # type: ignore
        instance = KokoroVietnamese(voice=voice_id, device="cpu")
        # Warm-up synthesis
        try:
            instance.synthesize("xin chào")
            logger.info(f"[TTS/Kokoro] Warm-up complete for '{voice_id}'.")
        except Exception as e:
            logger.warning(f"[TTS/Kokoro] Warm-up failed (non-fatal): {e}")
        return instance

    async def generate(
        self,
        text: str,
        settings: TTSSettings,
        output_path: Path,
    ) -> Path:
        voice_id = settings.kokoro_voice
        if voice_id not in KOKORO_VOICE_MAP:
            logger.warning(
                f"[TTS/Kokoro] Unknown voice '{voice_id}', defaulting to diem_trinh"
            )
            voice_id = "diem_trinh"

        voice_label = KOKORO_VOICE_MAP[voice_id]
        logger.info(f"[TTS/Kokoro] Generating audio (voice: {voice_label})")

        try:
            await self._generate_kokoro(text, voice_id, output_path)
        except Exception as e:
            logger.warning(
                f"[TTS/Kokoro] Generation failed ({e}). Falling back to Edge TTS..."
            )
            await self._fallback_edge(text, settings, output_path)

        return output_path

    async def _generate_kokoro(
        self, text: str, voice_id: str, output_path: Path
    ) -> None:
        """Run Kokoro inference in thread pool, then convert WAV→MP3 via FFmpeg."""
        instance = await self._get_instance(voice_id)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        wav_path = output_path.with_suffix(".wav")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, self._synthesize_blocking, instance, text, wav_path
        )

        await self._wav_to_mp3(wav_path, output_path)

        if wav_path.exists():
            wav_path.unlink(missing_ok=True)

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError(f"MP3 output missing after conversion: {output_path}")

        logger.info(
            f"[TTS/Kokoro] Done → {output_path.name} "
            f"({output_path.stat().st_size // 1024} KB)"
        )

    def _synthesize_blocking(self, instance: object, text: str, wav_path: Path) -> None:
        """Blocking Kokoro synthesis — must run in executor.
        
        synthesize() returns (audio: np.ndarray, phonemes: str).
        Sample rate is a module-level constant SAMPLE_RATE = 24000.
        """
        import soundfile as sf  # type: ignore
        from kokoro_vietnamese import SAMPLE_RATE

        # result = (audio_array, phoneme_string) — NOT (audio, sample_rate)
        audio, _phonemes = instance.synthesize(text)  # type: ignore
        sf.write(str(wav_path), audio, SAMPLE_RATE)

    async def _wav_to_mp3(self, wav_path: Path, mp3_path: Path) -> None:
        """Convert WAV to MP3 using FFmpeg (blocking in thread pool)."""
        cmd = [
            "ffmpeg", "-y",
            "-i", str(wav_path),
            "-codec:a", "libmp3lame",
            "-qscale:a", "2",
            str(mp3_path),
        ]
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=60,
            )
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"FFmpeg WAV→MP3 failed: {result.stderr.decode(errors='replace')[-500:]}"
            )

    async def _fallback_edge(
        self, text: str, settings: TTSSettings, output_path: Path
    ) -> None:
        from tts.edge_engine import EdgeTTSEngine
        fallback_settings = TTSSettings(
            engine="edge_tts",
            voice=settings.voice or "vi-VN-HoaiMyNeural",
            rate=0,
            pitch=0,
            volume=100,
        )
        edge = EdgeTTSEngine()
        await edge.generate(text, fallback_settings, output_path)
        logger.warning(
            f"[TTS/Kokoro] Fallback used Edge TTS → {output_path.name}"
        )
