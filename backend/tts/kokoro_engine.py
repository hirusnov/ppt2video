import asyncio
import logging
import os
import subprocess
from pathlib import Path

from tts.base import TTSEngine
from tts.settings import TTSSettings

logger = logging.getLogger(__name__)

# Kokoro-Vietnamese voice IDs → display labels
KOKORO_VOICE_MAP: dict[str, str] = {
    "diem_trinh": "Diễm Trinh",
    "hung_thinh": "Hưng Thịnh",
    "mai_linh": "Mai Linh",
    "mai_loan": "Mai Loan",
    "manh_dung": "Mạnh Dũng",
    "my_yen": "Mỹ Yến",
    "ngoc_huyen": "Ngọc Huyền",
    "phat_tai": "Phát Tài",
    "thanh_dat": "Thành Đạt",
    "thuc_trinh": "Thục Trinh",
    "tuan_ngoc": "Tuấn Ngọc",
    "storyvert": "Storyvert",
    "duc_an": "Đức An",
    "duc_duy": "Đức Duy",
}

# Cache: voice_id → KokoroVietnamese instance
_kokoro_cache: dict[str, object] = {}
_kokoro_lock = asyncio.Lock()


def _get_device() -> str:
    """
    Resolve TTS device from env var KOKORO_DEVICE.
    Falls back to CPU if CUDA is requested but not available.
    """
    requested = os.getenv("KOKORO_DEVICE", "cpu").lower().strip()
    if requested == "cuda":
        try:
            import torch
            if torch.cuda.is_available():
                name = torch.cuda.get_device_name(0)
                vram = torch.cuda.get_device_properties(0).total_memory // 1024 // 1024
                logger.info(f"[TTS/Kokoro] GPU: {name} ({vram} MB VRAM) — using CUDA")
                return "cuda"
            else:
                logger.warning("[TTS/Kokoro] CUDA requested but not available — falling back to CPU")
                return "cpu"
        except Exception as e:
            logger.warning(f"[TTS/Kokoro] CUDA check failed ({e}) — falling back to CPU")
            return "cpu"
    logger.info("[TTS/Kokoro] Using CPU (set KOKORO_DEVICE=cuda to enable GPU)")
    return "cpu"


class KokoroEngine(TTSEngine):
    """
    TTS engine backed by Kokoro-Vietnamese (ONNX Runtime / PyTorch).

    API: KokoroVietnamese(voice=<id>, device="cuda"|"cpu")
         instance.synthesize(text) → (audio: np.ndarray, phonemes: str)
         SAMPLE_RATE = 24000 (module constant)

    Device is read from KOKORO_DEVICE env var (default: cpu).
    One instance is cached per voice_id to avoid reloading the model.
    """

    async def preload(self) -> None:
        """Pre-warm the default voice at startup."""
        device = _get_device()
        logger.info(f"[TTS/Kokoro] Pre-loading default voice on device={device}...")
        await self._get_instance("diem_trinh")
        logger.info("[TTS/Kokoro] Default voice pre-loaded.")

    async def _get_instance(self, voice_id: str) -> object:
        """Get or create a cached KokoroVietnamese instance for this voice."""
        async with _kokoro_lock:
            if voice_id not in _kokoro_cache:
                device = _get_device()
                logger.info(f"[TTS/Kokoro] Loading model for voice='{voice_id}' device={device}...")
                loop = asyncio.get_event_loop()
                instance = await loop.run_in_executor(
                    None, self._load_model, voice_id, device
                )
                _kokoro_cache[voice_id] = instance
                logger.info(f"[TTS/Kokoro] Model ready: voice='{voice_id}' device={device}")
            return _kokoro_cache[voice_id]

    def _load_model(self, voice_id: str, device: str) -> object:
        """Blocking model load — runs in thread pool executor."""
        from kokoro_vietnamese import KokoroVietnamese  # type: ignore
        instance = KokoroVietnamese(voice=voice_id, device=device)
        # Warm-up
        try:
            instance.synthesize("xin chào")
            logger.info(f"[TTS/Kokoro] Warm-up complete for '{voice_id}' on {device}.")
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
            logger.warning(f"[TTS/Kokoro] Unknown voice '{voice_id}', defaulting to diem_trinh")
            voice_id = "diem_trinh"

        voice_label = KOKORO_VOICE_MAP[voice_id]
        logger.info(f"[TTS/Kokoro] Generating audio (voice: {voice_label})")

        await self._generate_kokoro(text, voice_id, output_path)
        return output_path

    async def _generate_kokoro(self, text: str, voice_id: str, output_path: Path) -> None:
        """Run Kokoro inference in thread pool, then convert WAV→MP3 via FFmpeg."""
        instance = await self._get_instance(voice_id)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        wav_path = output_path.with_suffix(".wav")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._synthesize_blocking, instance, text, wav_path)
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
