"""TTS engine: CosyVoice (GPU) / edge-tts (online) / Windows SAPI (offline fallback)."""

import asyncio
import io
import logging
import wave
from pathlib import Path

import numpy as np

from gpt_sovits_engine import GptSovitsEngine
from piper_engine import PiperEngine
from tts_text import normalize_tts_text
from tts_winrt import synthesize_winrt

logger = logging.getLogger(__name__)

# edge-tts neural voices (zh-CN)
EDGE_VOICES = {
    "xiaoxiao": "zh-CN-XiaoxiaoNeural",
    "xiaoyi": "zh-CN-XiaoyiNeural",
    "yunxi": "zh-CN-YunxiNeural",
    "yunjian": "zh-CN-YunjianNeural",
}
DEFAULT_EDGE_VOICE = EDGE_VOICES["xiaoxiao"]


class TtsEngine:
    """TTS engine with automatic GPU/CPU selection.

    - GPU available: CosyVoice-300M-Instruct (emotion instruction control)
    - CPU / Windows: local-sapi (pyttsx3 + SAPI, fully offline)
    - CPU / other OS: edge-tts (Microsoft neural voice, needs internet)
    - Piper: user-imported .onnx voice packs (offline neural, recommended for custom voices)
    """

    def __init__(
        self,
        force_engine: str | None = None,
        voice_model_dirs: list[str | Path] | None = None,
        gpt_sovits_pack_dirs: list[str | Path] | None = None,
        gpt_sovits_config_paths: list[str | Path] | None = None,
    ):
        self._engine_name: str = force_engine or "edge-tts"
        self._cosyvoice_model = None
        self._edge_voice = DEFAULT_EDGE_VOICE
        self._piper = PiperEngine()
        self._piper_model_id = ""
        self._gpt_sovits = GptSovitsEngine(
            voice_pack_dirs=[Path(p) for p in (gpt_sovits_pack_dirs or [])],
            config_paths=[Path(p) for p in (gpt_sovits_config_paths or [])],
        )
        self._gpt_sovits_model_id = ""
        self._voice_model_dirs = self._default_voice_model_dirs(voice_model_dirs)
        self._ready = False
        self._model_loaded = False
        self._cancel_requested = False
        self._edge_available: bool | None = None  # None = not checked

    @staticmethod
    def _default_voice_model_dirs(extra: list[str | Path] | None) -> list[Path]:
        base = Path(__file__).parent / "models" / "piper"
        dirs = [base]
        if extra:
            dirs.extend(Path(p) for p in extra)
        return dirs

    @property
    def piper_voices(self):
        return self._piper.voices

    def refresh_piper_voices(self) -> None:
        self._piper.set_model_dirs(self._voice_model_dirs)

    @property
    def gpt_sovits_voices(self):
        return self._gpt_sovits.voices

    def refresh_gpt_sovits_voices(self) -> None:
        self._gpt_sovits.refresh_voices()

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def model_loaded(self) -> bool:
        return self._model_loaded

    @property
    def engine_name(self) -> str:
        return self._engine_name

    def _detect_engine(self) -> str:
        try:
            import torch
            if torch.cuda.is_available():
                return "cosyvoice"
        except ImportError:
            pass
        # Online neural TTS first; offline WinRT/SAPI fallback when Bing unreachable.
        return "edge-tts"

    def set_edge_voice(self, voice: str | None) -> None:
        """Set edge-tts voice id or alias (xiaoxiao / zh-CN-XiaoxiaoNeural)."""
        if not voice:
            return
        key = voice.strip().lower().replace("_", "").replace("-", "")
        if key in EDGE_VOICES:
            self._edge_voice = EDGE_VOICES[key]
            return
        if voice.startswith("zh-CN-"):
            self._edge_voice = voice

    def _ensure_loaded(self) -> None:
        if self._ready:
            return

        if not self._engine_name or self._engine_name == "auto":
            self._engine_name = self._detect_engine()

        if self._engine_name == "cosyvoice":
            self._load_cosyvoice()
        elif self._engine_name == "local-sapi":
            self._load_local_sapi()
        elif self._engine_name == "piper":
            self._load_piper()
        elif self._engine_name == "gpt-sovits":
            self._load_gpt_sovits()
        else:
            self._load_edge_tts()

    def _load_gpt_sovits(self) -> None:
        logger.info("Loading GPT-SoVITS voice packs...")
        try:
            self.refresh_gpt_sovits_voices()
            count = len(self._gpt_sovits.voices)
            self._model_loaded = self._gpt_sovits.model_loaded
            self._ready = True
            if count:
                logger.info("GPT-SoVITS ready with %d voice pack(s)", count)
            else:
                logger.warning(
                    "No GPT-SoVITS voice packs — run install-ackem-gpt-sovits-voice.ps1"
                )
        except Exception as e:
            logger.error("GPT-SoVITS init failed: %s", e)
            self._ready = True
            self._model_loaded = False

    def _load_piper(self) -> None:
        logger.info("Scanning Piper voice packs in: %s", self._voice_model_dirs)
        try:
            self.refresh_piper_voices()
            count = len(self._piper.voices)
            self._model_loaded = count > 0
            self._ready = True
            if count:
                logger.info("Piper ready with %d voice(s)", count)
            else:
                logger.warning(
                    "No Piper models found — drop .onnx+.json into voice-service/models/piper/ "
                    "or %%APPDATA%%/Ackem/voice-models/piper/"
                )
        except ImportError:
            logger.error("piper-tts not installed — pip install piper-tts")
            self._ready = True
            self._model_loaded = False
        except Exception as e:
            logger.error("Piper init failed: %s", e)
            self._ready = True
            self._model_loaded = False

    def _load_cosyvoice(self) -> None:
        logger.info("Loading CosyVoice-300M-Instruct...")
        try:
            from cosyvoice import CosyVoice

            model_dir = str(
                Path(__file__).parent / "models" / "CosyVoice-300M-Instruct"
            )
            self._cosyvoice_model = CosyVoice(model_dir)
            self._model_loaded = True
            self._ready = True
            logger.info("CosyVoice model loaded")
        except Exception as e:
            import sys

            fallback = "local-sapi" if sys.platform == "win32" else "edge-tts"
            logger.warning("CosyVoice load failed (%s), falling back to %s", e, fallback)
            self._engine_name = fallback
            if fallback == "local-sapi":
                self._load_local_sapi()
            else:
                self._load_edge_tts()

    def _load_local_sapi(self) -> None:
        """Windows SAPI offline TTS via pyttsx3."""
        import sys

        if sys.platform != "win32":
            logger.error("local-sapi is only available on Windows")
            self._ready = True
            self._model_loaded = False
            return

        logger.info("Loading Windows SAPI offline TTS (pyttsx3)...")
        try:
            import pyttsx3

            engine = pyttsx3.init()
            engine.stop()
            self._model_loaded = True
            self._ready = True
            logger.info("Windows SAPI TTS ready (offline)")
        except ImportError:
            logger.error("pyttsx3 not installed — pip install pyttsx3")
            self._ready = True
            self._model_loaded = False
        except Exception as e:
            logger.error("Windows SAPI init failed: %s", e)
            self._ready = True
            self._model_loaded = False

    def _load_edge_tts(self) -> None:
        """Check if edge-tts is available (needs network)."""
        logger.info("Checking edge-tts availability (voice: %s)...", self._edge_voice)
        try:
            import edge_tts
            self._edge_available = True
            self._model_loaded = True  # edge-tts has no local model
            self._ready = True
            logger.info("edge-tts engine ready")
        except ImportError:
            logger.error("edge-tts not installed")
            self._edge_available = False
            self._ready = True  # Mark ready but will return empty audio
            self._model_loaded = False

    def cancel(self) -> None:
        """Cancel current TTS generation."""
        self._cancel_requested = True

    async def synthesize(
        self, text: str, emotion_instruction: str = "", voice: str = ""
    ) -> bytes:
        """Synthesize text to WAV audio (16kHz 16bit mono)."""
        self._ensure_loaded()
        self._cancel_requested = False

        if voice:
            if self._engine_name == "piper":
                self._piper_model_id = voice
            elif self._engine_name == "gpt-sovits":
                self._gpt_sovits_model_id = voice
            else:
                self.set_edge_voice(voice)

        text = normalize_tts_text(text)
        if not text.strip():
            return b""

        if self._engine_name == "cosyvoice":
            return await self._synth_cosyvoice(text, emotion_instruction)
        if self._engine_name == "local-sapi":
            return await self._synth_local_sapi(text)
        if self._engine_name == "piper":
            return await self._synth_piper(text, voice or self._piper_model_id)
        if self._engine_name == "gpt-sovits":
            return await self._synth_gpt_sovits(text, voice or self._gpt_sovits_model_id)
        return await self._synth_edge_tts(text, emotion_instruction)

    async def _synth_piper(self, text: str, model_id: str) -> bytes:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, lambda: self._piper.synthesize(text, model_id)
        )

    async def _synth_gpt_sovits(self, text: str, model_id: str) -> bytes:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, lambda: self._gpt_sovits.synthesize(text, model_id)
        )

    async def _synth_cosyvoice(self, text: str, instruction: str) -> bytes:
        """CosyVoice synthesis with emotion instruction."""
        full_text = f"{instruction}：{text}" if instruction else text

        loop = asyncio.get_event_loop()
        audio_chunks = await loop.run_in_executor(None, self._cosyvoice_infer, full_text)

        if self._cancel_requested or not len(audio_chunks):
            return b""

        return self._numpy_to_wav(audio_chunks, sample_rate=22050)

    def _cosyvoice_infer(self, text: str) -> np.ndarray:
        """Run CosyVoice inference (blocking)."""
        chunks = []
        for chunk in self._cosyvoice_model.inference_sft(
            text, "中文女", stream=True
        ):
            if self._cancel_requested:
                break
            chunks.append(chunk["tts_speech"].numpy())
        if not chunks:
            return np.array([], dtype=np.float32)
        return np.concatenate(chunks, axis=-1).squeeze()

    async def _synth_edge_tts(self, text: str, instruction: str) -> bytes:
        """edge-tts synthesis (no emotion instruction, only rate/pitch)."""
        if not self._edge_available:
            logger.warning("edge-tts not available")
            return b""

        try:
            import edge_tts

            # Map emotion instruction to rate/pitch adjustments
            rate, pitch = self._emotion_to_rate_pitch(instruction)

            if self._cancel_requested:
                return b""

            communicate = edge_tts.Communicate(
                text, self._edge_voice, rate=rate, pitch=pitch
            )
            audio_data = io.BytesIO()
            async for chunk in communicate.stream():
                if self._cancel_requested:
                    return b""
                if chunk["type"] == "audio":
                    audio_data.write(chunk["data"])

            raw = audio_data.getvalue()
            if not raw:
                logger.warning("edge-tts returned empty audio")
                return b""

            # edge-tts outputs mp3, convert to wav
            return self._audio_to_16k_wav(raw)

        except Exception as e:
            logger.error("edge-tts synthesis failed: %s", e)

        return await self._synth_local_sapi(text)

    async def _synth_local_sapi(self, text: str) -> bytes:
        """Windows offline TTS: WinRT system voice, then legacy SAPI."""
        import sys

        if sys.platform != "win32":
            return b""

        raw = await synthesize_winrt(text)
        if raw and len(raw) >= 44:
            logger.info("Using Windows WinRT offline TTS")
            return self._audio_to_16k_wav(raw)

        try:
            import os
            import tempfile

            import pyttsx3

            def _pick_pyttsx3_voice(engine) -> None:
                voices = engine.getProperty("voices")
                best_id = None
                best_score = -1
                for voice in voices:
                    vid = (voice.id or "").lower()
                    vname = (voice.name or "").lower()
                    if "zh-tw" in vid or "taiwan" in vname or "traditional" in vname:
                        continue
                    score = -1
                    if "zh-cn" in vid or "zh_cn" in vid:
                        score = 0
                        if "yaoyao" in vname:
                            score = 100
                        elif "xiaoxiao" in vname:
                            score = 110
                        elif "xiaoyi" in vname:
                            score = 105
                        elif "huihui" in vname:
                            score = 40
                        elif "kangkang" in vname:
                            score = 30
                    if score > best_score:
                        best_score = score
                        best_id = voice.id
                if best_id:
                    engine.setProperty("voice", best_id)
                engine.setProperty("rate", 165)

            def _run() -> bytes:
                engine = pyttsx3.init()
                _pick_pyttsx3_voice(engine)
                fd, path = tempfile.mkstemp(suffix=".wav")
                os.close(fd)
                try:
                    engine.save_to_file(text, path)
                    engine.runAndWait()
                    with open(path, "rb") as f:
                        return f.read()
                finally:
                    try:
                        os.unlink(path)
                    except OSError:
                        pass

            loop = asyncio.get_event_loop()
            raw = await loop.run_in_executor(None, _run)
            if not raw or len(raw) < 44:
                logger.warning("Windows SAPI TTS returned empty audio")
                return b""
            logger.info("Using Windows SAPI fallback (pyttsx3)")
            return self._audio_to_16k_wav(raw)
        except ImportError:
            logger.warning("pyttsx3 not installed — run pip install pyttsx3 for offline Windows TTS")
            return b""
        except Exception as e:
            logger.error("Windows SAPI TTS failed: %s", e)
            return b""

    @staticmethod
    def _emotion_to_rate_pitch(instruction: str) -> tuple[str, str]:
        """Map emotion instruction to edge-tts rate/pitch."""
        if not instruction:
            return "+0%", "+0Hz"
        if "温柔" in instruction or "甜蜜" in instruction or "安静" in instruction:
            return "-10%", "+5Hz"
        if "热情" in instruction:
            return "+5%", "+10Hz"
        if "冷淡" in instruction or "冷静" in instruction:
            return "-5%", "-5Hz"
        if "焦急" in instruction or "不耐烦" in instruction:
            return "+10%", "+10Hz"
        if "脆弱" in instruction or "委屈" in instruction:
            return "-15%", "-10Hz"
        if "麻木" in instruction or "疲惫" in instruction:
            return "-20%", "-15Hz"
        return "+0%", "+0Hz"

    @staticmethod
    def _numpy_to_wav(audio: np.ndarray, sample_rate: int = 22050) -> bytes:
        """Convert numpy float32 array to WAV bytes (16kHz 16bit mono)."""
        # Resample to 16kHz if needed
        if sample_rate != 16000:
            num_samples = int(len(audio) * 16000 / sample_rate)
            indices = np.linspace(0, len(audio) - 1, num_samples)
            audio = np.interp(indices, np.arange(len(audio)), audio)

        # Normalize to int16
        audio = np.clip(audio, -1.0, 1.0)
        audio_int16 = (audio * 32767).astype(np.int16)

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(audio_int16.tobytes())
        return buf.getvalue()

    @staticmethod
    def _audio_to_16k_wav(audio_bytes: bytes) -> bytes:
        """Convert MP3/WAV bytes to WAV 16kHz 16bit mono."""
        try:
            import soundfile as sf

            data, sr = sf.read(io.BytesIO(audio_bytes))
            # Convert to mono if stereo
            if len(data.shape) > 1:
                data = data.mean(axis=1)
            # Resample to 16kHz
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
            logger.error("MP3 to WAV conversion failed: %s", e)
            return b""
