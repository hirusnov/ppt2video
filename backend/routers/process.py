"""
POST /api/process          — Submit a job (returns job_id immediately)
GET  /api/process/{id}/stream   — SSE log stream
GET  /api/process/{id}/download — Stream the final MP4 then cleanup
GET  /api/process/{id}/status   — Poll status (for clients that can't use SSE)
"""
import asyncio
import json
import logging
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator

import aiofiles
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from services.job_store import (
    Job, _semaphore, cleanup_expired_jobs,
    create_job, get_job, remove_job, _cleanup_job_dir, job_dir_for,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Progress thresholds ─────────────────────────────────────────────────────
PROG_VALIDATE    = 5
PROG_PPTX_START  = 5
PROG_PPTX_DONE   = 20
PROG_TTS_START   = 20
PROG_TTS_DONE    = 60
PROG_VIDEO_START = 60
PROG_VIDEO_DONE  = 90
PROG_FINALIZE    = 100


# ─── Submit endpoint ──────────────────────────────────────────────────────────

@router.post("/process")
async def submit_job(
    background_tasks: BackgroundTasks,
    pptx: UploadFile = File(...),
    script: UploadFile = File(...),
    settings: str = Form("{}"),
    slide_overrides: str = Form("{}"),
):
    """
    Accept PPTX + script + settings JSON, create a job and start pipeline
    in background. Returns { job_id }.
    """
    # Validate file types
    if not pptx.filename or not pptx.filename.lower().endswith(".pptx"):
        raise HTTPException(400, "File PPTX phải có đuôi .pptx")
    if not script.filename or not script.filename.lower().endswith(".txt"):
        raise HTTPException(400, "File script phải có đuôi .txt")

    # Read uploaded bytes
    pptx_bytes = await pptx.read()
    script_bytes = await script.read()

    # Parse settings JSON
    try:
        settings_dict = json.loads(settings)
    except Exception:
        settings_dict = {}
    try:
        overrides_dict = json.loads(slide_overrides)
    except Exception:
        overrides_dict = {}

    # Create job
    job_id = str(uuid.uuid4())
    job = create_job(job_id)

    # Start pipeline in background
    background_tasks.add_task(
        run_pipeline,
        job=job,
        pptx_bytes=pptx_bytes,
        script_bytes=script_bytes,
        settings_dict=settings_dict,
        overrides_dict=overrides_dict,
    )

    logger.info(f"[JOB] Submitted job {job_id}")
    return {"job_id": job_id}


# ─── Pipeline ─────────────────────────────────────────────────────────────────

async def run_pipeline(
    job: Job,
    pptx_bytes: bytes,
    script_bytes: bytes,
    settings_dict: dict,
    overrides_dict: dict,
) -> None:
    """Full processing pipeline: validate → PPTX→PNG → TTS → video → finalize."""
    job_dir = job_dir_for(job.job_id)

    async def emit(
        step: str,
        message: str,
        progress: int,
        slide: int | None = None,
        total: int | None = None,
        error: str | None = None,
    ) -> None:
        event = {
            "step": step,
            "message": message,
            "progress": progress,
        }
        if slide is not None:
            event["slide"] = slide
        if total is not None:
            event["total"] = total
        if error is not None:
            event["error"] = error
        job.progress = progress
        await job.log_queue.put(event)

    async with _semaphore:
        job.status = "processing"
        try:
            await _pipeline_inner(
                job=job,
                job_dir=job_dir,
                pptx_bytes=pptx_bytes,
                script_bytes=script_bytes,
                settings_dict=settings_dict,
                overrides_dict=overrides_dict,
                emit=emit,
            )
            job.status = "done"
            await emit("done", "Pipeline hoàn thành! Video đã sẵn sàng để tải về.", PROG_FINALIZE)
        except Exception as exc:
            logger.exception(f"[JOB] Pipeline failed for {job.job_id}: {exc}")
            job.status = "error"
            job.error = str(exc)
            await emit("error", f"Lỗi: {exc}", job.progress, error=str(exc))
        finally:
            job.done_event.set()

    # Schedule cleanup after timeout
    asyncio.create_task(_auto_cleanup(job))


async def _pipeline_inner(
    job: Job,
    job_dir: Path,
    pptx_bytes: bytes,
    script_bytes: bytes,
    settings_dict: dict,
    overrides_dict: dict,
    emit,
) -> None:
    from routers.validate import parse_script, count_pptx_slides
    from tts.settings import TTSSettings
    from tts.factory import get_engine
    from services.pptx_service import convert_to_images
    from services.video_service import render_video

    # ── Step 1: Validate ────────────────────────────────────────────────────
    await emit("validate", "Đang phân tích script và PPTX...", PROG_VALIDATE)

    try:
        script_text = script_bytes.decode("utf-8")
    except UnicodeDecodeError:
        script_text = script_bytes.decode("utf-8-sig", errors="replace")

    parsed_slides = parse_script(script_text)
    pptx_slide_count = count_pptx_slides(pptx_bytes)
    n_slides = min(len(parsed_slides), pptx_slide_count)

    if n_slides == 0:
        raise ValueError("Không tìm thấy slide nào để xử lý")

    await emit("validate", f"Tìm thấy {n_slides} slide cần xử lý", PROG_VALIDATE)

    # ── Step 2: PPTX → PNG ──────────────────────────────────────────────────
    pptx_path = job_dir / "input.pptx"
    pptx_path.write_bytes(pptx_bytes)
    png_dir = job_dir / "images"

    pptx_done = 0

    async def pptx_log(msg: str) -> None:
        nonlocal pptx_done
        if "Converted" in msg or "Placeholder" in msg:
            pptx_done += 1
            pptx_progress = int(
                PROG_PPTX_START + (pptx_done / n_slides) * (PROG_PPTX_DONE - PROG_PPTX_START)
            )
            await emit("pptx_convert", msg, pptx_progress, slide=pptx_done, total=n_slides)
        else:
            await emit("pptx_convert", msg, PROG_PPTX_START)

    png_paths = await convert_to_images(pptx_path, png_dir, log_cb=pptx_log)
    png_paths = png_paths[:n_slides]  # trim to matching count

    # ── Step 3: TTS (parallel) ──────────────────────────────────────────────
    global_settings = TTSSettings.from_dict(settings_dict)
    audio_dir = job_dir / "audio"
    audio_dir.mkdir(exist_ok=True)

    await emit("tts", "Đang tạo audio cho các slide...", PROG_TTS_START)

    tts_done = 0
    tts_lock = asyncio.Lock()

    async def generate_slide_audio(slide_data: dict, png_idx: int) -> Path:
        nonlocal tts_done
        slide_idx = slide_data["index"]
        text = slide_data["text"]

        # Build per-slide settings (merge global ← override)
        override_dict = overrides_dict.get(str(slide_idx), {})
        if override_dict.get("override"):
            slide_settings = global_settings.merge(
                TTSSettings.from_dict(override_dict.get("settings", {}))
            )
        else:
            slide_settings = global_settings

        engine = get_engine(slide_settings)
        out_path = audio_dir / f"slide_{slide_idx:03d}.mp3"

        await engine.generate(text, slide_settings, out_path)

        async with tts_lock:
            tts_done += 1
            tts_progress = int(
                PROG_TTS_START + (tts_done / n_slides) * (PROG_TTS_DONE - PROG_TTS_START)
            )
            await emit(
                "tts",
                f"Đã tạo audio slide {slide_idx} "
                f"({slide_settings.engine.replace('_', ' ').title()})",
                tts_progress,
                slide=tts_done,
                total=n_slides,
            )

        return out_path

    # Run TTS for all slides concurrently (bounded by semaphore inside each engine)
    audio_tasks = [
        generate_slide_audio(parsed_slides[i], i)
        for i in range(n_slides)
    ]
    audio_paths: list[Path] = await asyncio.gather(*audio_tasks)

    # ── Step 4: Render video clips ──────────────────────────────────────────
    slides_for_video = [
        {
            "index": parsed_slides[i]["index"],
            "png": png_paths[i],
            "mp3": audio_paths[i],
        }
        for i in range(n_slides)
    ]

    video_out = job_dir / "output.mp4"

    video_done_count = [0]

    async def video_log(msg: str) -> None:
        if "Rendering clip" in msg:
            video_done_count[0] += 1
            video_progress = int(
                PROG_VIDEO_START
                + (video_done_count[0] / n_slides) * (PROG_VIDEO_DONE - PROG_VIDEO_START)
            )
            await emit("video_render", msg, video_progress,
                       slide=video_done_count[0], total=n_slides)
        else:
            await emit("video_render", msg, min(job.progress + 1, PROG_VIDEO_DONE))

    await render_video(slides_for_video, video_out, log_cb=video_log)
    job.output_path = video_out


async def _auto_cleanup(job: Job) -> None:
    """Delete job temp dir after JOB_TIMEOUT_SECONDS if not already cleaned."""
    from services.job_store import JOB_TIMEOUT_SECONDS
    await asyncio.sleep(JOB_TIMEOUT_SECONDS)
    if job.job_id in __import__("services.job_store", fromlist=["_jobs"])._jobs:
        _cleanup_job_dir(job_dir_for(job.job_id))
        remove_job(job.job_id)
        logger.info(f"[JOB] Auto-cleaned job {job.job_id} after timeout")


# ─── SSE stream endpoint ──────────────────────────────────────────────────────

@router.get("/process/{job_id}/stream")
async def stream_logs(job_id: str):
    """Server-Sent Events stream of pipeline log events."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")

    async def event_generator() -> AsyncGenerator[dict, None]:
        # Drain buffered events first
        while True:
            try:
                event = job.log_queue.get_nowait()
                yield {"data": json.dumps(event)}
            except asyncio.QueueEmpty:
                break

        # Then stream new events as they arrive
        while not job.done_event.is_set() or not job.log_queue.empty():
            try:
                event = await asyncio.wait_for(job.log_queue.get(), timeout=1.0)
                yield {"data": json.dumps(event)}
            except asyncio.TimeoutError:
                # Send heartbeat to keep connection alive
                yield {"data": json.dumps({"step": "ping", "message": "", "progress": job.progress})}

        # Final status event
        if job.status == "done":
            yield {"data": json.dumps({
                "step": "done",
                "message": "Pipeline hoàn thành!",
                "progress": 100,
            })}
        elif job.status == "error":
            yield {"data": json.dumps({
                "step": "error",
                "message": job.error or "Lỗi không xác định",
                "progress": job.progress,
                "error": job.error,
            })}

    return EventSourceResponse(event_generator())


# ─── Status endpoint ──────────────────────────────────────────────────────────

@router.get("/process/{job_id}/status")
async def get_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    return {
        "job_id": job_id,
        "status": job.status,
        "progress": job.progress,
        "error": job.error,
    }


# ─── Download endpoint ────────────────────────────────────────────────────────

@router.get("/process/{job_id}/download")
async def download_video(job_id: str, background_tasks: BackgroundTasks):
    """Stream MP4 to client, then cleanup job temp directory."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    if job.status != "done" or not job.output_path:
        raise HTTPException(400, f"Job {job_id} not ready (status: {job.status})")
    if not job.output_path.exists():
        raise HTTPException(410, "Video file no longer available")

    video_path = job.output_path

    async def file_streamer():
        async with aiofiles.open(video_path, "rb") as f:
            while chunk := await f.read(1024 * 256):  # 256 KB chunks
                yield chunk

    # Schedule cleanup after streaming
    background_tasks.add_task(_do_cleanup, job_id, video_path.parent)

    file_size = video_path.stat().st_size
    return StreamingResponse(
        file_streamer(),
        media_type="video/mp4",
        headers={
            "Content-Disposition": f'attachment; filename="ppt2video_{job_id[:8]}.mp4"',
            "Content-Length": str(file_size),
            "X-Job-Id": job_id,
        },
    )


async def _do_cleanup(job_id: str, job_dir: Path) -> None:
    """Remove job from store and delete its temp directory."""
    remove_job(job_id)
    _cleanup_job_dir(job_dir)
    logger.info(f"[JOB] Cleaned up job {job_id}")
