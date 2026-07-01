"""Piper offline neural TTS — load user-imported ONNX voice packs."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from piper_registry import PiperVoiceInfo, scan_piper_voices

logger = logging.getLogger(__name__)


class PiperEngine:
    """Synthesize speech from imported Piper .onnx models."""

    def __init__(self, model_dirs: list[Path] | None = None):
        self._model_dirs = model_dirs or []
        self._voices: dict[str, PiperVoiceInfo] = {}
        self._loaded: dict[str, object] = {}
        self._ready = False

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def voices(self) -> list[PiperVoiceInfo]:
        return list(self._voices.values())

    def set_model_dirs(self, dirs: list[Path]) -> None:
        self._model_dirs = dirs
        self._voices = {v.id: v for v in scan_piper_voices(dirs)}
        self._loaded.clear()
        self._ready = True

    def _get_voice(self, model_id: str):
        if model_id not in self._voices:
            if self._voices:
                model_id = next(iter(self._voices))
                logger.warning("Piper model not found, using %s", model_id)
            else:
                raise RuntimeError("No Piper voice models installed")

        if model_id not in self._loaded:
            from piper import PiperVoice

            info = self._voices[model_id]
            logger.info("Loading Piper voice: %s", info.id)
            self._loaded[model_id] = PiperVoice.load(info.model_path, info.config_path)

        return self._loaded[model_id], model_id

    def synthesize(self, text: str, model_id: str = "") -> bytes:
        if not text.strip():
            return b""

        voice, used_id = self._get_voice(model_id or "")
        chunks: list[np.ndarray] = []
        sample_rate = int(getattr(voice.config, "sample_rate", 22050))

        for chunk in voice.synthesize(text):
            audio = getattr(chunk, "audio_float_array", None)
            if audio is not None and len(audio):
                chunks.append(np.asarray(audio, dtype=np.float32))

        if not chunks:
            logger.warning("Piper returned empty audio for model %s", used_id)
            return b""

        audio = np.concatenate(chunks)
        return _float32_to_wav16k(audio, sample_rate)


def _float32_to_wav16k(audio: np.ndarray, sample_rate: int) -> bytes:
    import io
    import wave

    if sample_rate != 16000:
        num_samples = int(len(audio) * 16000 / sample_rate)
        indices = np.linspace(0, len(audio) - 1, num_samples)
        audio = np.interp(indices, np.arange(len(audio)), audio)

    audio = np.clip(audio, -1.0, 1.0)
    audio_int16 = (audio * 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(audio_int16.tobytes())
    return buf.getvalue()
