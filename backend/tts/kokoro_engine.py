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

        # Normalize numbers → Vietnamese spoken form before synthesis
        normalized = _normalize_text(text)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._synthesize_blocking, instance, normalized, wav_path)
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

        Kokoro has a hard limit of 510 phonemes per text chunk. Long texts are
        split into sentences, synthesized individually, then concatenated.
        """
        import re
        import numpy as np
        import soundfile as sf  # type: ignore
        from kokoro_vietnamese import SAMPLE_RATE

        chunks = _split_text(text)
        audio_parts: list[np.ndarray] = []

        for chunk in chunks:
            if not chunk.strip():
                continue
            try:
                audio, _ = instance.synthesize(chunk)  # type: ignore
                audio_parts.append(audio)
                # Short silence between chunks (0.15s)
                silence = np.zeros(int(SAMPLE_RATE * 0.15), dtype=audio.dtype)
                audio_parts.append(silence)
            except ValueError as e:
                # Chunk still too long — split further by semicolon/dash only
                # Do NOT split on comma — "phong, ban, nganh" loses context
                logger.warning(f"[TTS/Kokoro] Chunk too long, splitting further: {e}")
                sub_chunks = re.split(r"[;–—]+", chunk)
                for sub in sub_chunks:
                    if not sub.strip():
                        continue
                    try:
                        audio, _ = instance.synthesize(sub.strip())  # type: ignore
                        audio_parts.append(audio)
                        silence = np.zeros(int(SAMPLE_RATE * 0.08), dtype=audio.dtype)
                        audio_parts.append(silence)
                    except Exception as e2:
                        logger.warning(f"[TTS/Kokoro] Skipping sub-chunk ({e2}): {sub[:40]}")

        if not audio_parts:
            raise RuntimeError("No audio produced by Kokoro")

        final_audio = np.concatenate(audio_parts)
        sf.write(str(wav_path), final_audio, SAMPLE_RATE)

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

def _split_text(text: str, max_chars: int = 300) -> list[str]:
    """
    Split text into chunks small enough for Kokoro (<=510 phonemes ≈ <=300 chars).
    Splits on sentence boundaries: newline > .!? > semicolon/dash.
    Never splits on comma to preserve context like "phong, ban, nganh".
    """
    import re

    # First split on newlines and sentence-ending punctuation
    raw = re.split(r"(?<=[.!?…])\s+|(?<=\n)", text)

    chunks: list[str] = []
    current = ""

    for part in raw:
        part = part.strip()
        if not part:
            continue
        if len(current) + len(part) + 1 <= max_chars:
            current = (current + " " + part).strip() if current else part
        else:
            if current:
                chunks.append(current)
            # If single part still too long, split on em-dash / bullet / semicolon
            if len(part) > max_chars:
                sub_parts = re.split(r"[;\-–—]+", part)
                sub_buf = ""
                for sp in sub_parts:
                    sp = sp.strip()
                    if not sp:
                        continue
                    if len(sub_buf) + len(sp) + 2 <= max_chars:
                        sub_buf = (sub_buf + "; " + sp).strip("; ") if sub_buf else sp
                    else:
                        if sub_buf:
                            chunks.append(sub_buf)
                        sub_buf = sp
                if sub_buf:
                    chunks.append(sub_buf)
                current = ""
            else:
                current = part

    if current:
        chunks.append(current)

    return [c for c in chunks if c.strip()]


_DIGIT_VI = {"0": "không", "1": "một", "2": "hai", "3": "ba", "4": "bốn",
             "5": "năm", "6": "sáu", "7": "bảy", "8": "tám", "9": "chín"}

def _year_digits(year_str: str) -> str:
    """Convert a 4-digit year to digit-by-digit Vietnamese reading.
    2026 -> 'hai không hai sáu'
    2002 -> 'hai không không hai'
    """
    return " ".join(_DIGIT_VI[d] for d in year_str)


def _normalize_text(text: str) -> str:
    """
    Convert numbers and common patterns to Vietnamese spoken form
    so Kokoro can phonemize them correctly.

    Handles:
    - Dates: 1/7/2025 → ngày một tháng bảy năm hai nghìn...
    - Percentages: 91% → chín mươi mốt phần trăm
    - Decimals (comma): 15,09 → mười lăm phẩy không chín
    - Thousands (dot separator): 148.285 → một trăm bốn mươi tám nghìn...
    - Plain integers: 357 → ba trăm năm mươi bảy
    - Ordinals like /KH-UBND stay as-is (not all-digit)
    """
    import re
    try:
        from num2words import num2words as n2w
    except ImportError:
        return text

    def _n2v(n: int | float) -> str:
        try:
            return n2w(n, lang="vi")
        except Exception:
            return str(n)

    def _replace(m: re.Match) -> str:
        raw = m.group(0)

        # Date: d/m/yyyy or dd/mm/yyyy
        dm = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw)
        if dm:
            d, mo, yr = int(dm.group(1)), int(dm.group(2)), int(dm.group(3))
            return f"ngày {_n2v(d)} tháng {_n2v(mo)} năm {_n2v(yr)}"

        # Percentage: 91%  (handled by calling site stripping %)
        pct = re.fullmatch(r"(\d[\d.,]*)%", raw)
        if pct:
            num_str = pct.group(1).replace(".", "").replace(",", ".")
            try:
                val = float(num_str) if "." in num_str else int(num_str)
                return _n2v(val) + " phần trăm"
            except Exception:
                return raw

        # Decimal with comma Vietnamese-style: 15,09
        dec = re.fullmatch(r"(\d+),(\d{1,3})", raw)
        if dec:
            try:
                val = float(raw.replace(",", "."))
                int_part = _n2v(int(dec.group(1)))
                frac = dec.group(2)
                frac_spoken = " ".join(_n2v(int(d)) for d in frac)
                return f"{int_part} phẩy {frac_spoken}"
            except Exception:
                return raw

        # Integer with dot thousands separator: 148.285 / 18.012
        dot_int = re.fullmatch(r"\d{1,3}(?:\.\d{3})+", raw)
        if dot_int:
            try:
                return _n2v(int(raw.replace(".", "")))
            except Exception:
                return raw

        # Plain integer
        if re.fullmatch(r"\d+", raw):
            try:
                return _n2v(int(raw))
            except Exception:
                return raw

        return raw

    # Order matters: try longer patterns first
    # 1. dates (d/m/yyyy) — replace entire token including surrounding context
    def _replace_date(m):
        d, mo, yr = int(m.group(1)), int(m.group(2)), m.group(3)
        return f"{_n2v(d)} tháng {_n2v(mo)} năm {_year_digits(yr)}"
    # Only match bare date patterns (not preceded by letter/digit)
    text = re.sub(r"(?<![/\d\w])(\d{1,2})/(\d{1,2})/(\d{4})(?![/\d])", _replace_date, text)
    # 1b. month/year: 12/2025 -> tháng mười hai năm hai không hai lăm
    #     but "tháng 12/2025" -> "tháng mười hai năm hai không hai lăm" (no double tháng)
    def _replace_month_year(m):
        mo, yr = int(m.group(1)), m.group(2)
        # Check if preceded by "tháng " — if so, omit the "tháng" prefix
        start = m.start()
        preceding = text[:start].rstrip()
        if preceding.endswith("tháng") or preceding.endswith("thang"):
            return f"{_n2v(mo)} năm {_year_digits(yr)}"
        return f"tháng {_n2v(mo)} năm {_year_digits(yr)}"
    text = re.sub(r"(?<![/\d])(\d{1,2})/((?:19|20)\d{2})(?!\d)", _replace_month_year, text)
    # 2. percentages
    text = re.sub(r"\d[\d.,]*%", _replace, text)
    # 3. decimals with comma
    text = re.sub(r"\d+,\d{1,3}(?!\d)", _replace, text)
    # 4. thousands with dots (e.g. 148.285 — only if all groups are 3 digits)
    text = re.sub(r"\d{1,3}(?:\.\d{3})+", _replace, text)
    # 5. 4-digit years standalone — read digit by digit (2026 -> hai không hai sáu)
    text = re.sub(r"(?<!\d)((?:19|20)[0-9]{2})(?!\d)", lambda m: _year_digits(m.group(1)), text)
    # 6. all remaining standalone integers (1+ digits)
    # Exclude numbers that are part of doc codes (preceded/followed by / or letters)
    # Use word boundary but allow leading zeros: "02" -> "hai", "5" -> "năm"
    def _replace_int(m):
        raw = m.group(0)
        try:
            return _replace(m)
        except Exception:
            return raw

    text = re.sub(r"(?<![/\-\w])\d+(?![/\-\w])", _replace_int, text)

    return text
