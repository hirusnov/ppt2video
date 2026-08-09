import os
import sys
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Windows requires ProactorEventLoop for subprocess support
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from routers import validate, process, extract

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger(__name__)

kokoro_ready = False
vieneu_ready = False


async def preload_kokoro():
    """Pre-warm Kokoro model at startup."""
    global kokoro_ready
    try:
        logger.info("[STARTUP] Pre-loading Kokoro-Vietnamese model...")
        from tts.kokoro_engine import KokoroEngine
        engine = KokoroEngine()
        await engine.preload()
        kokoro_ready = True
        logger.info("[STARTUP] Kokoro model loaded successfully.")
    except Exception as e:
        logger.warning(f"[STARTUP] Kokoro pre-load failed: {e}")
        kokoro_ready = False


async def preload_vieneu():
    """Pre-warm VieNeu-TTS v3 Turbo model at startup."""
    global vieneu_ready
    try:
        logger.info("[STARTUP] Pre-loading VieNeu-TTS v3 Turbo model...")
        from tts.vieneu_engine import VieNeuEngine
        engine = VieNeuEngine()
        await engine.preload()
        vieneu_ready = True
        logger.info("[STARTUP] VieNeu model loaded successfully.")
    except Exception as e:
        logger.warning(f"[STARTUP] VieNeu pre-load failed: {e}")
        vieneu_ready = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[STARTUP] PPT2VIDEO backend starting...")
    from services.job_store import JOBS_BASE
    JOBS_BASE.mkdir(parents=True, exist_ok=True)

    # Load both engines concurrently
    await asyncio.gather(
        preload_kokoro(),
        preload_vieneu(),
        return_exceptions=True,
    )

    logger.info(f"[STARTUP] Kokoro ready: {kokoro_ready} | VieNeu ready: {vieneu_ready}")
    app.state.kokoro_ready = kokoro_ready
    app.state.vieneu_ready = vieneu_ready

    yield

    logger.info("[SHUTDOWN] PPT2VIDEO backend shutting down.")


app = FastAPI(
    title="PPT2VIDEO API",
    description="Convert PPTX + Vietnamese script to MP4 with AI TTS (Kokoro / VieNeu)",
    version="1.0.0",
    lifespan=lifespan
)

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    os.getenv("FRONTEND_URL", "http://localhost:3000"),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(set(o for o in ALLOWED_ORIGINS if o)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(validate.router, prefix="/api")
app.include_router(process.router, prefix="/api")
app.include_router(extract.router, prefix="/api")


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "engines": {
            "kokoro": getattr(app.state, "kokoro_ready", False),
            "vieneu": getattr(app.state, "vieneu_ready", False),
        },
        "version": "1.0.0"
    }
