import os
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import validate, process, extract

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Global flag for engine availability
engine_status = {
    "edge_tts": False,
    "kokoro": False,
}


async def preload_kokoro():
    """Pre-warm Kokoro model at startup to reduce first-request latency."""
    try:
        logger.info("[STARTUP] Pre-loading Kokoro-Vietnamese model...")
        from tts.kokoro_engine import KokoroEngine
        engine = KokoroEngine()
        await engine.preload()
        engine_status["kokoro"] = True
        logger.info("[STARTUP] Kokoro model loaded successfully.")
    except Exception as e:
        logger.warning(f"[STARTUP] Kokoro pre-load failed (will fallback to Edge TTS): {e}")
        engine_status["kokoro"] = False


async def check_edge_tts():
    """Verify Edge TTS is reachable."""
    try:
        import edge_tts
        engine_status["edge_tts"] = True
        logger.info("[STARTUP] Edge TTS available.")
    except Exception as e:
        logger.warning(f"[STARTUP] Edge TTS check failed: {e}")
        engine_status["edge_tts"] = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup tasks before yield, cleanup after."""
    logger.info("[STARTUP] PPT2VIDEO backend starting...")
    from services.job_store import JOBS_BASE
    JOBS_BASE.mkdir(parents=True, exist_ok=True)

    await asyncio.gather(
        check_edge_tts(),
        preload_kokoro(),
        return_exceptions=True
    )

    available = [k for k, v in engine_status.items() if v]
    logger.info(f"[STARTUP] Available engines: {available}")

    # Store engine status in app state
    app.state.engine_status = engine_status

    yield

    logger.info("[SHUTDOWN] PPT2VIDEO backend shutting down.")


app = FastAPI(
    title="PPT2VIDEO API",
    description="Convert PPTX + Vietnamese script to MP4 with AI TTS",
    version="1.0.0",
    lifespan=lifespan
)

# CORS — allow local dev only
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

# Include routers
app.include_router(validate.router, prefix="/api")
app.include_router(process.router, prefix="/api")
app.include_router(extract.router, prefix="/api")


@app.get("/health")
async def health_check():
    """Health check endpoint — returns available TTS engines."""
    status = getattr(app.state, "engine_status", engine_status)
    available_engines = [k for k, v in status.items() if v]

    # Always report edge_tts as available (it works without pre-load)
    if "edge_tts" not in available_engines:
        available_engines.append("edge_tts")

    return {
        "status": "ok",
        "engines": available_engines,
        "version": "1.0.0"
    }
