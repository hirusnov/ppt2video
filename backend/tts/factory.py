from tts.base import TTSEngine
from tts.settings import TTSSettings


def get_engine(settings: TTSSettings) -> TTSEngine:
    """Return the appropriate TTSEngine instance for the given settings."""
    if settings.engine == "kokoro":
        from tts.kokoro_engine import KokoroEngine
        return KokoroEngine()
    else:
        from tts.edge_engine import EdgeTTSEngine
        return EdgeTTSEngine()
