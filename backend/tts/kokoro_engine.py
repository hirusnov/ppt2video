import asyncio
import logging
import subprocess
import tempfile
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

# Singleton reference – loaded once during startup
_kokoro_instance: Optional[object] = None
_kokoro_lock = asyncio.Lock()


class KokoroEngine(TTSEngine):
    """
    TTS engine backed by Kokoro-Vietnamese (ONNX Runtime, CPU inference).
    Model is ~300 MB and is pre-loaded once during FastAPI lifespan startup.
    Fallback: if generation fails, delegates to EdgeTTSEngine automatically.
    """

    async def preload(self) -> None:
        """Download and cache the Kokoro model into memory."""
        global _kokoro_instance
        async with _kokoro_lock:
            if _kokoro_instance is not None:
                return
            logger.info("[TTS/Kokoro] Loading model (this may take a minute)...")
            loop = asyncio.get_event_loop()
            _kokoro_instance = await loop.run_in_executor(None, self._load_model)
            logger.info("[TTS/Kokoro] Model ready.")

    def _load_model(self) -> object:
        """Blocking model load – runs in thread pool executor."""
        from kokoro_vietnamese import KokoroVietnamese  # type: ignore
        # Load with the default/first voice; voices are switched per-request
        instance = KokoroVietnamese(device="cpu")
        # Warm up with a short Vietnamese phrase to JIT-compile ONNX graph
        try:
            instance.generate("xin chào", voice="diem_trinh")
            logger.info("[TTS/Kokoro] Warm-up complete.")
        except Exception as e:
            logger.warning(f"[TTS/Kokoro] Warm-up failed (non-fatal): {e}")
        return instance

    async def generate(
        self,
        text: str,
        settings: TTSSettings,
        output_path: Path,
    ) -> Path:
        """
        Generate audio with Kokoro-Vietnamese, write as MP3.
        Falls back to Edge TTS on any error.
        """
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
        global _kokoro_instance

        # Ensure model is loaded
        if _kokoro_instance is None:
            await self.preload()

        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Synthesize WAV in thread pool (ONNX is blocking / CPU-bound)
        loop = asyncio.get_event_loop()
        wav_path = output_path.with_suffix(".wav")

        await loop.run_in_executor(
            None,
            self._synthesize_blocking,
            text,
            voice_id,
            wav_path,
        )

        # Convert WAV → MP3
        await self._wav_to_mp3(wav_path, output_path)

        # Clean up intermediate WAV
        if wav_path.exists():
            wav_path.unlink(missing_ok=True)

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError(f"MP3 output missing after conversion: {output_path}")

        logger.info(
            f"[TTS/Kokoro] Done → {output_path.name} "
            f"({output_path.stat().st_size // 1024} KB)"
        )

    def _synthesize_blocking(self, text: str, voice_id: str, wav_path: Path) -> None:
        """Blocking Kokoro synthesis – must run in executor."""
        import soundfile as sf  # type: ignore

        samples, sample_rate = _kokoro_instance.generate(text, voice=voice_id)  # type: ignore
        sf.write(str(wav_path), samples, sample_rate)

    async def _wav_to_mp3(self, wav_path: Path, mp3_path: Path) -> None:
        """Convert WAV to MP3 using FFmpeg subprocess (blocking in thread pool)."""
        import subprocess
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
            lambda: subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"FFmpeg WAV→MP3 failed: {result.stderr.decode(errors='replace')[-500:]}"
            )

    async def _fallback_edge(
        self, text: str, settings: TTSSettings, output_path: Path
    ) -> None:
        """Emergency fallback: use Edge TTS instead of Kokoro."""
        from tts.edge_engine import EdgeTTSEngine

        # Force edge_tts engine in settings for fallback
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
