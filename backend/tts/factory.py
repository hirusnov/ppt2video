from tts.base import TTSEngine
from tts.settings import TTSSettings


def get_engine(settings: TTSSettings) -> TTSEngine:
    """Return KokoroEngine — only TTS engine supported."""
    from tts.kokoro_engine import KokoroEngine
    return KokoroEngine()
