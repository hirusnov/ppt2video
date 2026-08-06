"""
In-memory job store.  Each job tracks status, log queue, and output path.
Render.com's ephemeral filesystem means jobs live only for the process lifetime.
"""
import asyncio
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

JOB_TIMEOUT_SECONDS = 10 * 60  # 10 minutes

# Base dir for all job temp files — works on Windows and Linux
JOBS_BASE = Path(tempfile.gettempdir()) / "ppt2video_jobs"
JOBS_BASE.mkdir(parents=True, exist_ok=True)


@dataclass
class Job:
    job_id: str
    status: str = "queued"          # queued | processing | done | error
    progress: int = 0
    output_path: Optional[Path] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    log_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    done_event: asyncio.Event = field(default_factory=asyncio.Event)


# Global registry: job_id → Job
_jobs: dict[str, Job] = {}

# Semaphore: process only 1 job at a time
_semaphore = asyncio.Semaphore(1)


def job_dir_for(job_id: str) -> Path:
    """Return (and create) the temp directory for a specific job."""
    d = JOBS_BASE / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def create_job(job_id: str) -> Job:
    job = Job(job_id=job_id)
    _jobs[job_id] = job
    return job


def get_job(job_id: str) -> Optional[Job]:
    return _jobs.get(job_id)


def remove_job(job_id: str) -> None:
    _jobs.pop(job_id, None)


async def cleanup_expired_jobs() -> None:
    """Remove jobs older than JOB_TIMEOUT_SECONDS."""
    now = time.time()
    expired = [
        jid for jid, job in list(_jobs.items())
        if now - job.created_at > JOB_TIMEOUT_SECONDS
    ]
    for jid in expired:
        job = _jobs.pop(jid, None)
        if job:
            _cleanup_job_dir(job_dir_for(jid))


def _cleanup_job_dir(job_dir: Path) -> None:
    import shutil
    if job_dir.exists():
        try:
            shutil.rmtree(job_dir)
        except Exception:
            pass
