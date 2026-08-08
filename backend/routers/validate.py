import re
import io
import logging
import tempfile
from pathlib import Path
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from typing import List

logger = logging.getLogger(__name__)
router = APIRouter()


class SlideData(BaseModel):
    index: int
    text: str
    charCount: int


class ValidateResponse(BaseModel):
    slides: List[SlideData]
    totalSlides: int
    warnings: List[str]


def parse_script(content: str) -> List[dict]:
    """
    Parse Vietnamese TTS script in S1:/S2: format.
    Returns list of {index, text} dicts.
    """
    # Match S<number>: followed by text until next S<number>: or end of string
    pattern = re.compile(
        r"^S(\d+):\s*([\s\S]+?)(?=^S\d+:|\Z)",
        re.MULTILINE
    )
    matches = pattern.findall(content.strip())

    slides = []
    for idx_str, text in matches:
        cleaned = text.strip()
        if cleaned:
            slides.append({
                "index": int(idx_str),
                "text": cleaned,
            })

    # Sort by index
    slides.sort(key=lambda x: x["index"])
    return slides


def count_pptx_slides(pptx_bytes: bytes) -> int:
    """Count slides in a PPTX file using python-pptx."""
    try:
        from pptx import Presentation
        prs = Presentation(io.BytesIO(pptx_bytes))
        return len(prs.slides)
    except Exception as e:
        logger.error(f"[VALIDATE] Failed to read PPTX: {e}")
        raise HTTPException(status_code=400, detail=f"Không thể đọc file PPTX: {e}")


@router.post("/validate", response_model=ValidateResponse)
async def validate_files(
    pptx: UploadFile = File(...),
    script: UploadFile = File(...),
):
    """
    Validate uploaded PPTX + script files.
    Parse S1:/S2: script and count PPTX slides.
    Return slide list with warnings if counts mismatch.
    """
    # Validate file extensions
    if not pptx.filename or not pptx.filename.lower().endswith(".pptx"):
        raise HTTPException(
            status_code=400,
            detail="File PPTX phải có đuôi .pptx"
        )
    if not script.filename or not script.filename.lower().endswith(".txt"):
        raise HTTPException(
            status_code=400,
            detail="File script phải có đuôi .txt"
        )

    # Read files
    pptx_bytes = await pptx.read()
    script_bytes = await script.read()

    if not pptx_bytes:
        raise HTTPException(status_code=400, detail="File PPTX rỗng")
    if not script_bytes:
        raise HTTPException(status_code=400, detail="File script rỗng")

    # Decode script
    try:
        script_content = script_bytes.decode("utf-8")
    except UnicodeDecodeError:
        script_content = script_bytes.decode("utf-8-sig", errors="replace")

    logger.info(f"[VALIDATE] PPTX: {pptx.filename} ({len(pptx_bytes)} bytes)")
    logger.info(f"[VALIDATE] Script: {script.filename} ({len(script_content)} chars)")

    # Parse script
    parsed = parse_script(script_content)
    if not parsed:
        raise HTTPException(
            status_code=400,
            detail="Không tìm thấy đoạn script nào. Đảm bảo định dạng S1: ... S2: ..."
        )

    # Count PPTX slides
    pptx_slide_count = count_pptx_slides(pptx_bytes)
    logger.info(f"[VALIDATE] Script: {len(parsed)} đoạn, PPTX: {pptx_slide_count} slide")

    # Build slide data
    slides = [
        SlideData(
            index=s["index"],
            text=s["text"],
            charCount=len(s["text"])
        )
        for s in parsed
    ]

    # Warnings
    warnings = []
    if len(parsed) != pptx_slide_count:
        warnings.append(
            f"Số đoạn script ({len(parsed)}) không khớp với số slide PPTX ({pptx_slide_count}). "
            f"Video sẽ dùng {min(len(parsed), pptx_slide_count)} slide đầu tiên."
        )

    return ValidateResponse(
        slides=slides,
        totalSlides=pptx_slide_count,
        warnings=warnings
    )


PREVIEW_TEXT = "số 1, 02, 12, 102, 333, 5555, 167784"


@router.get("/preview-voice")
async def preview_voice(voice: str = "diem_trinh", speed: float = 1.25):
    """
    Generate a short MP3 preview for the given Kokoro voice ID and speed.
    Returns the MP3 file directly (streamed).
    """
    from tts.kokoro_engine import KokoroEngine, KOKORO_VOICE_MAP
    from tts.settings import TTSSettings

    if voice not in KOKORO_VOICE_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown voice: {voice}")

    speed = max(0.5, min(2.0, speed))  # clamp to safe range

    engine = KokoroEngine()
    settings = TTSSettings(engine="kokoro", kokoro_voice=voice, speed=speed)

    # Write to a temp file — FileResponse will stream it then we clean up
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.close()
    out_path = Path(tmp.name)

    try:
        await engine.generate(PREVIEW_TEXT, settings, out_path)
    except Exception as e:
        out_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {e}")

    voice_label = KOKORO_VOICE_MAP[voice]
    return FileResponse(
        path=str(out_path),
        media_type="audio/mpeg",
        filename=f"preview_{voice}.mp3",
        background=BackgroundTask(out_path.unlink, missing_ok=True),
    )
