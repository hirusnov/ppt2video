import asyncio
import logging
from pathlib import Path
from typing import Callable, Awaitable

logger = logging.getLogger(__name__)

SILENCE_PAD = 1.5   # seconds of silence after audio ends
FADE_DUR = 0.4      # fade in/out duration in seconds


async def render_video(
    slides: list[dict],  # [{"png": Path, "mp3": Path, "index": int}]
    output_path: Path,
    log_cb: Callable[[str], Awaitable[None]] | None = None,
) -> Path:
    """
    Produce a final MP4 from a list of (PNG, MP3) pairs.

    Pipeline per slide:
      1. FFmpeg: loop PNG + MP3 → clip_{n}.mp4
         - duration = audio_duration + SILENCE_PAD
         - fade-out video at end, pad audio with silence
    Final step:
      2. FFmpeg concat demuxer → output.mp4 (H.264 + AAC)
    """
    job_dir = output_path.parent
    clips_dir = job_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    async def _log(msg: str) -> None:
        logger.info(msg)
        if log_cb:
            await log_cb(msg)

    clip_paths: list[Path] = []
    total = len(slides)

    for i, slide in enumerate(slides, start=1):
        png: Path = slide["png"]
        mp3: Path = slide["mp3"]
        idx: int = slide["index"]
        clip_path = clips_dir / f"clip_{idx:03d}.mp4"

        await _log(f"[VIDEO] Rendering clip {i}/{total} (slide {idx})...")

        audio_dur = await _get_audio_duration(mp3)
        clip_dur = audio_dur + SILENCE_PAD
        fade_start = max(0.0, clip_dur - FADE_DUR)

        await _render_clip(png, mp3, clip_path, clip_dur, fade_start)

        if not clip_path.exists() or clip_path.stat().st_size == 0:
            raise RuntimeError(f"Clip {clip_path.name} is empty after rendering")

        clip_paths.append(clip_path)
        await _log(
            f"[VIDEO] Clip {i}/{total} done "
            f"(duration: {clip_dur:.1f}s, size: {clip_path.stat().st_size // 1024} KB)"
        )

    await _log(f"[VIDEO] Concatenating {len(clip_paths)} clips...")
    await _concat_clips(clip_paths, output_path, job_dir)

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError(f"Final video is empty: {output_path}")

    final_dur = await _get_video_duration(output_path)
    await _log(
        f"[VIDEO] Done! Duration: {final_dur:.1f}s, "
        f"size: {output_path.stat().st_size // 1024} KB"
    )
    return output_path


async def _get_audio_duration(mp3: Path) -> float:
    """Use ffprobe to get audio duration in seconds."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(mp3),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    try:
        return float(stdout.decode().strip())
    except ValueError:
        logger.warning(f"Could not parse duration for {mp3.name}, defaulting to 5.0s")
        return 5.0


async def _get_video_duration(mp4: Path) -> float:
    """Use ffprobe to get video duration in seconds."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(mp4),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    try:
        return float(stdout.decode().strip())
    except ValueError:
        return 0.0


async def _render_clip(
    png: Path,
    mp3: Path,
    clip_path: Path,
    clip_dur: float,
    fade_start: float,
) -> None:
    """
    Render a single slide clip:
      - Loop the PNG image for clip_dur seconds
      - Mix the MP3 audio, pad silence for the remaining time
      - Apply fade-out video at end + fade-in at start
      - Output H.264 video + AAC audio
    """
    fade_in_end = FADE_DUR

    cmd = [
        "ffmpeg", "-y",
        # Image input — loop it
        "-loop", "1", "-framerate", "25",
        "-i", str(png),
        # Audio input
        "-i", str(mp3),
        # Filter complex:
        # v: fade in at start (0→FADE_DUR), fade out at end
        # a: pad silence to fill clip_dur
        "-filter_complex",
        (
            f"[0:v]scale=1280:720:force_original_aspect_ratio=decrease,"
            f"pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fade=t=in:st=0:d={FADE_DUR},"
            f"fade=t=out:st={fade_start}:d={FADE_DUR}[v];"
            f"[1:a]apad=pad_dur={SILENCE_PAD}[a]"
        ),
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-t", str(clip_dur),
        "-pix_fmt", "yuv420p",
        str(clip_path),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await asyncio.wait_for(proc.communicate(), timeout=180)

    if proc.returncode != 0:
        err = stderr.decode(errors="replace")[-800:]
        raise RuntimeError(f"FFmpeg clip render failed:\n{err}")


async def _concat_clips(
    clip_paths: list[Path],
    output_path: Path,
    job_dir: Path,
) -> None:
    """
    Concatenate all clips into a single MP4 using FFmpeg concat demuxer.
    Uses forward-slash paths in the concat list (required by FFmpeg on all platforms).
    """
    concat_list = job_dir / "concat.txt"
    with open(concat_list, "w", encoding="utf-8") as f:
        for clip in clip_paths:
            # FFmpeg concat demuxer requires forward slashes even on Windows
            safe = clip.as_posix()
            f.write(f"file '{safe}'\n")

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", str(concat_list),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        str(output_path),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)

    if proc.returncode != 0:
        err = stderr.decode(errors="replace")[-800:]
        raise RuntimeError(f"FFmpeg concat failed:\n{err}")

    concat_list.unlink(missing_ok=True)
