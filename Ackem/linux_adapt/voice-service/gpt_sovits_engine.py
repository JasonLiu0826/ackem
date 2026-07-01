"""GPT-SoVITS voice pack engine — calls local api_v2 for synthesis."""

from __future__ import annotations

import io
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
import wave
from pathlib import Path

import numpy as np

from gpt_sovits_process import (
    DEFAULT_API_PORT,
    GptSovitsApiProcess,
    resolve_gpt_sovits_home,
)
from gpt_sovits_registry import GptSovitsVoicePack, scan_gpt_sovits_voice_packs

logger = logging.getLogger(__name__)


class GptSovitsEngine:
    def __init__(
        self,
        voice_pack_dirs: list[Path],
        config_paths: list[Path],
        api_port: int = DEFAULT_API_PORT,
    ):
        self._voice_pack_dirs = voice_pack_dirs
        self._config_paths = config_paths
        self._api_port = api_port
        self._voices: dict[str, GptSovitsVoicePack] = {}
        self._api: GptSovitsApiProcess | None = None
        self._loaded_voice_id = ""
        self._loaded_gpt = ""
        self._loaded_sovits = ""
        self._ready = False
        self._model_loaded = False
        self._home: Path | None = None

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def model_loaded(self) -> bool:
        return self._model_loaded

    @property
    def voices(self) -> list[GptSovitsVoicePack]:
        return list(self._voices.values())

    def refresh_voices(self) -> None:
        self._voices = {v.id: v for v in scan_gpt_sovits_voice_packs(self._voice_pack_dirs)}
        self._home = resolve_gpt_sovits_home(self._config_paths)
        self._ready = True
        self._model_loaded = bool(self._voices) and self._home is not None
        if self._voices and self._home:
            logger.info(
                "GPT-SoVITS ready: %d voice pack(s), runtime=%s",
                len(self._voices),
                self._home,
            )
        elif self._voices and not self._home:
            logger.warning("Voice packs found but GPT-SoVITS runtime missing (gpt-sovits-runtime/)")
        elif not self._voices:
            logger.warning("No GPT-SoVITS voice packs in bundled or user directories")

    def _ensure_api(self) -> GptSovitsApiProcess:
        if not self._home:
            raise RuntimeError(
                "GPT-SoVITS runtime not found. Expected bundled folder voice-service/gpt-sovits-runtime/"
            )
        if self._api is None:
            self._api = GptSovitsApiProcess(self._home, port=self._api_port)
        self._api.ensure_started()
        return self._api

    def _http_get_text(self, url: str) -> str:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read().decode("utf-8", errors="replace")

    def _http_post_json(self, url: str, payload: dict) -> bytes:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read()

    def _load_weights(self, pack: GptSovitsVoicePack, api: GptSovitsApiProcess) -> None:
        gpt = str(pack.gpt_weights)
        sovits = str(pack.sovits_weights)
        if self._loaded_voice_id == pack.id and self._loaded_gpt == gpt and self._loaded_sovits == sovits:
            return

        gpt_url = (
            f"{api.base_url}/set_gpt_weights?"
            + urllib.parse.urlencode({"weights_path": gpt})
        )
        sovits_url = (
            f"{api.base_url}/set_sovits_weights?"
            + urllib.parse.urlencode({"weights_path": sovits})
        )
        gpt_resp = self._http_get_text(gpt_url)
        sovits_resp = self._http_get_text(sovits_url)
        if "success" not in gpt_resp.lower():
            raise RuntimeError(f"Failed to load GPT weights: {gpt_resp}")
        if "success" not in sovits_resp.lower():
            raise RuntimeError(f"Failed to load SoVITS weights: {sovits_resp}")

        self._loaded_voice_id = pack.id
        self._loaded_gpt = gpt
        self._loaded_sovits = sovits
        logger.info("Loaded GPT-SoVITS voice pack: %s", pack.id)

    def synthesize(self, text: str, model_id: str = "") -> bytes:
        if not text.strip():
            return b""

        self.refresh_voices()
        if not self._voices:
            raise RuntimeError("No GPT-SoVITS voice packs installed")

        pack = self._voices.get(model_id) if model_id else None
        if pack is None:
            pack = next(iter(self._voices.values()))
            logger.warning("GPT-SoVITS model %s not found, using %s", model_id, pack.id)

        api = self._ensure_api()
        self._load_weights(pack, api)

        payload = {
            "text": text,
            "text_lang": pack.language,
            "ref_audio_path": str(pack.ref_audio),
            "prompt_text": pack.ref_text,
            "prompt_lang": pack.prompt_lang,
            "text_split_method": "cut5",
            "batch_size": 1,
            "media_type": "wav",
            "streaming_mode": False,
            "parallel_infer": True,
        }
        try:
            wav_bytes = self._http_post_json(f"{api.base_url}/tts", payload)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"GPT-SoVITS /tts failed: {body}") from e

        if not wav_bytes or len(wav_bytes) < 44:
            logger.warning("GPT-SoVITS returned empty audio")
            return b""
        return _wav_to_16k_mono(wav_bytes)


def _wav_to_16k_mono(wav_bytes: bytes) -> bytes:
    try:
        import soundfile as sf

        data, sr = sf.read(io.BytesIO(wav_bytes))
        if len(data.shape) > 1:
            data = data.mean(axis=1)
        if sr != 16000:
            num_samples = int(len(data) * 16000 / sr)
            indices = np.linspace(0, len(data) - 1, num_samples)
            data = np.interp(indices, np.arange(len(data)), data)
        data = np.clip(data, -1.0, 1.0)
        audio_int16 = (data * 32767).astype(np.int16)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(audio_int16.tobytes())
        return buf.getvalue()
    except Exception as e:
        logger.error("WAV convert failed: %s", e)
        return wav_bytes
