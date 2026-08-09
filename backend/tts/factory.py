from tts.base import TTSEngine
from tts.settings import TTSSettings


def get_engine(settings: TTSSettings) -> TTSEngine:
    """Return the appropriate TTS engine based on settings.engine."""
    if settings.engine == "vieneu":
        from tts.vieneu_engine import VieNeuEngine
        return VieNeuEngine()
    else:
        from tts.kokoro_engine import KokoroEngine
        return KokoroEngine()
