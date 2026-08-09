"""
VieNeu TTS Engine — VieNeu-TTS v3 Turbo (48 kHz)

Features:
- 48 kHz high-fidelity audio (vs Kokoro 24 kHz)
- GPU auto-detected (PyTorch), CPU fallback (ONNX int8)
- 14 preset voices, 3 reading styles: tu_nhien, tin_tuc, doc_truyen
- Emotion cues: [cười], [thở dài], [hắng giọng]
- Batched generation on GPU for long texts
"""
import asyncio
import logging
import os
import subprocess
from pathlib import Path
from typing import Optional

from tts.base import TTSEngine
from tts.settings import TTSSettings

logger = logging.getLogger(__name__)

# VieNeu v3 Turbo preset voices (id → display label)
VIENEU_VOICES: dict[str, str] = {
    # Northern (Bắc)
    "Minh Đức":    "Minh Đức (Nam · Bắc · Tin tức)",
    "Phạm Tuyên":  "Phạm Tuyên (Nam · Bắc · Tự nhiên)",
    "Thanh Bình":  "Thanh Bình (Nam · Bắc · Kể chuyện)",
    "Trúc Ly":     "Trúc Ly (Nữ · Bắc · Tự nhiên)",
    "Ngọc Linh":   "Ngọc Linh (Nữ · Bắc · Kể chuyện)",
    "Đoan Trang":  "Đoan Trang (Nữ · Bắc · Tự nhiên)",
    "Mai Anh":     "Mai Anh (Nữ · Bắc · Tin tức)",
    # Central (Trung)
    "Quang Sơn":   "Quang Sơn (Nam · Trung · Tự nhiên)",
    "Ngọc Trân":   "Ngọc Trân (Nữ · Trung · Tự nhiên)",
    # Southern (Nam)
    "Thái Sơn":    "Thái Sơn (Nam · Nam · Kể chuyện)",
    "Xuân Vĩnh":   "Xuân Vĩnh (Nam · Nam · Tự nhiên)",
    "Minh Triết":  "Minh Triết (Nam · Nam · Tin tức)",
    "Thục Đoan":   "Thục Đoan (Nữ · Nam · Kể chuyện)",
    "Thùy Dung":   "Thùy Dung (Nữ · Nam · Tin tức)",
}

VIENEU_STYLES: dict[str, str] = {
    "tu_nhien":   "Tự nhiên",
    "tin_tuc":    "Tin tức",
    "doc_truyen": "Đọc truyện",
}

# Singleton
_vieneu_instance: Optional[object] = None
_vieneu_lock = asyncio.Lock()

SAMPLE_RATE = 48000  # VieNeu v3 Turbo output sample rate


class VieNeuEngine(TTSEngine):
    """
    TTS engine backed by VieNeu-TTS v3 Turbo.
    Singleton instance is shared across all requests.
    On CUDA machine: PyTorch batched inference (auto).
    On CPU: ONNX int8 inference.
    """

    async def preload(self) -> None:
        """Pre-warm VieNeu model at startup."""
        await self._get_instance()
        logger.info("[TTS/VieNeu] Model pre-loaded.")

    async def _get_instance(self) -> object:
        global _vieneu_instance
        async with _vieneu_lock:
            if _vieneu_instance is None:
                logger.info("[TTS/VieNeu] Loading VieNeu-TTS v3 Turbo...")
                loop = asyncio.get_event_loop()
                _vieneu_instance = await loop.run_in_executor(
                    None, self._load_model
                )
                logger.info("[TTS/VieNeu] Model ready.")
            return _vieneu_instance

    def _load_model(self) -> object:
        """Blocking model load — runs in thread pool."""
        from vieneu import Vieneu  # type: ignore

        # Detect CUDA — use PyTorch for batched GPU inference
        # Fall back to ONNX CPU if no GPU available
        try:
            import torch
            if torch.cuda.is_available():
                name = torch.cuda.get_device_name(0)
                vram = torch.cuda.get_device_properties(0).total_memory // 1024 // 1024
                logger.info(f"[TTS/VieNeu] GPU: {name} ({vram} MB) — using PyTorch backend")
                tts = Vieneu()  # auto-detects GPU → PyTorch
            else:
                logger.info("[TTS/VieNeu] No GPU — using ONNX CPU backend (int8)")
                tts = Vieneu(backend="onnx")
        except ImportError:
            logger.info("[TTS/VieNeu] torch not available — using ONNX CPU backend")
            tts = Vieneu(backend="onnx")

        # Warm up
        try:
            audio = tts.infer("xin chào", voice=list(VIENEU_VOICES.keys())[0])
            logger.info(f"[TTS/VieNeu] Warm-up complete ({len(audio)/SAMPLE_RATE:.1f}s audio)")
        except Exception as e:
            logger.warning(f"[TTS/VieNeu] Warm-up failed (non-fatal): {e}")

        return tts

    async def generate(
        self,
        text: str,
        settings: TTSSettings,
        output_path: Path,
    ) -> Path:
        voice = settings.vieneu_voice or list(VIENEU_VOICES.keys())[0]
        style = settings.vieneu_style or "tu_nhien"
        speed = settings.speed if hasattr(settings, "speed") else 1.0

        if voice not in VIENEU_VOICES:
            logger.warning(f"[TTS/VieNeu] Unknown voice '{voice}', using default")
            voice = list(VIENEU_VOICES.keys())[0]
        if style not in VIENEU_STYLES:
            style = "tu_nhien"

        logger.info(
            f"[TTS/VieNeu] Generating (voice: {voice}, style: {VIENEU_STYLES[style]}, speed: {speed}x)"
        )

        await self._generate_vieneu(text, voice, style, speed, output_path)
        return output_path

    async def _generate_vieneu(
        self,
        text: str,
        voice: str,
        style: str,
        speed: float,
        output_path: Path,
    ) -> None:
        tts = await self._get_instance()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        wav_path = output_path.with_suffix(".wav")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, self._synthesize_blocking, tts, text, voice, style, speed, wav_path
        )

        await self._wav_to_mp3(wav_path, output_path)

        if wav_path.exists():
            wav_path.unlink(missing_ok=True)

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError(f"[TTS/VieNeu] MP3 missing after conversion: {output_path}")

        logger.info(
            f"[TTS/VieNeu] Done → {output_path.name} "
            f"({output_path.stat().st_size // 1024} KB)"
        )

    def _synthesize_blocking(
        self,
        tts: object,
        text: str,
        voice: str,
        style: str,
        speed: float,
        wav_path: Path,
    ) -> None:
        """Blocking synthesis — runs in executor."""
        import numpy as np
        import soundfile as sf  # type: ignore

        # VieNeu handles long text / batching internally
        # speed param: VieNeu doesn't have speed, but we can resample after
        audio = tts.infer(text=text, voice=voice, style=style)  # type: ignore

        # Apply speed by resampling if speed != 1.0
        if abs(speed - 1.0) > 0.01:
            audio = _resample_speed(audio, speed, SAMPLE_RATE)

        sf.write(str(wav_path), audio, SAMPLE_RATE)

    async def _wav_to_mp3(self, wav_path: Path, mp3_path: Path) -> None:
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
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60
            ),
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"FFmpeg WAV→MP3 failed: {result.stderr.decode(errors='replace')[-500:]}"
            )


def _resample_speed(audio, speed: float, sr: int):
    """Simple speed change via resampling (pitch is preserved approximately)."""
    import numpy as np
    # Resample: if speed=1.25, output is 1/1.25 shorter
    target_len = int(len(audio) / speed)
    indices = np.linspace(0, len(audio) - 1, target_len)
    return np.interp(indices, np.arange(len(audio)), audio).astype(audio.dtype)
