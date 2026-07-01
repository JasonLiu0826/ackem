"""ASR engine wrapping faster-whisper with Silero VAD."""

import logging
import tempfile
import wave
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).parent / "models"


class AsrEngine:
    """faster-whisper ASR engine with lazy model loading."""

    def __init__(self, model_size: str = "base"):
        self.model_size = model_size
        self._model = None
        self._ready = False

    @property
    def ready(self) -> bool:
        return self._ready

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        logger.info("Loading faster-whisper model: %s", self.model_size)
        from faster_whisper import WhisperModel

        model_path = MODEL_DIR / f"faster-whisper-{self.model_size}"
        if model_path.exists():
            self._model = WhisperModel(str(model_path), device="cpu", compute_type="int8")
        else:
            self._model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
        self._ready = True
        logger.info("faster-whisper model loaded: %s", self.model_size)

    def transcribe(self, audio_bytes: bytes) -> dict:
        """Transcribe audio bytes (WAV 16kHz 16bit mono) to text.

        Returns: { text: str, confidence: float, language: str }
        """
        self._ensure_loaded()

        # Write to temp file for faster-whisper
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            segments, info = self._model.transcribe(
                tmp_path,
                language="zh",
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 800},
            )

            texts = []
            total_prob = 0.0
            count = 0
            for segment in segments:
                texts.append(segment.text.strip())
                total_prob += segment.avg_logprob
                count += 1

            text = " ".join(texts).strip()
            confidence = min(1.0, max(0.0, (total_prob / max(count, 1) + 1.0)))

            logger.info("ASR result: text=%r, confidence=%.2f", text[:80], confidence)
            return {
                "text": text,
                "confidence": round(confidence, 3),
                "language": info.language if hasattr(info, "language") else "zh",
            }
        finally:
            Path(tmp_path).unlink(missing_ok=True)
