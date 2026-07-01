"""Ackem Voice Service — HTTP server for ASR and TTS.

Endpoints:
    POST /transcribe  — Audio PCM (WAV) → text
    POST /synthesize  — { text, emotion_instruction } → WAV audio
    POST /cancel      — Cancel current TTS generation
    GET  /health      — Service health status
"""

import argparse
import asyncio
import logging
import os
import socket
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from pydantic import BaseModel

from pathlib import Path

from asr_engine import AsrEngine
from gpu_detect import detect_gpu
from tts_engine import TtsEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("voice-service")

# --- Engines (initialized at startup) ---
asr: AsrEngine | None = None
tts: TtsEngine | None = None
gpu_info: dict = {}
server_port: int = 8765
forced_tts_engine: str | None = None
extra_voice_model_dirs: list[str] = []
extra_gpt_sovits_pack_dirs: list[str] = []
gpt_sovits_config_paths: list[str] = []


def _default_gpt_sovits_config_paths() -> list[str]:
    paths: list[str] = []
    appdata = Path(os.environ.get("APPDATA", ""))
    if appdata:
        paths.append(str(appdata / "Ackem" / "voice-models" / "gpt-sovits-home.txt"))
    paths.append(str(Path(__file__).parent / "models" / "gpt-sovits-home.txt"))
    return paths


def _default_gpt_sovits_pack_dirs(extra: list[str]) -> list[str]:
    dirs: list[str] = [str(Path(__file__).parent / "models" / "gpt-sovits")]
    appdata = Path(os.environ.get("APPDATA", ""))
    if appdata:
        dirs.append(str(appdata / "Ackem" / "voice-models" / "gpt-sovits"))
    dirs.extend(extra)
    return dirs


def _build_tts_engine() -> TtsEngine:
    engine = forced_tts_engine or gpu_info.get("recommended_engine", "edge-tts")
    return TtsEngine(
        force_engine=engine,
        voice_model_dirs=extra_voice_model_dirs,
        gpt_sovits_pack_dirs=_default_gpt_sovits_pack_dirs(extra_gpt_sovits_pack_dirs),
        gpt_sovits_config_paths=gpt_sovits_config_paths or _default_gpt_sovits_config_paths(),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global asr, tts, gpu_info
    logger.info("Voice service starting on port %d", server_port)

    gpu_info = detect_gpu()
    logger.info("GPU info: %s", gpu_info)

    asr = AsrEngine(model_size="base")
    tts = _build_tts_engine()
    logger.info("TTS engine: %s", tts.engine_name)

    # Pre-warm ASR (loads model in background)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, asr._ensure_loaded)
    logger.info("ASR engine ready")

    yield

    logger.info("Voice service shutting down")


app = FastAPI(title="Ackem Voice Service", lifespan=lifespan)


# --- Request/Response models ---

class SynthesizeRequest(BaseModel):
    text: str
    emotion_instruction: str = ""
    voice: str = ""


class TranscribeResponse(BaseModel):
    text: str
    confidence: float
    language: str


class PiperVoiceResponse(BaseModel):
    id: str
    label: str
    language: str


class GptSovitsVoiceResponse(BaseModel):
    id: str
    label: str
    language: str


class HealthResponse(BaseModel):
    asr_ready: bool
    tts_ready: bool
    tts_engine: str
    tts_model_loaded: bool
    gpu_available: bool
    gpu_name: str
    port: int
    piper_voices: list[PiperVoiceResponse] = []
    gpt_sovits_voices: list[GptSovitsVoiceResponse] = []


# --- Endpoints ---

@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(response: Response):
    """Transcribe audio from request body (WAV 16kHz 16bit mono)."""
    import starlette.requests

    if asr is None or not asr.ready:
        response.status_code = 503
        return TranscribeResponse(text="", confidence=0, language="zh")

    # Read raw body as WAV bytes
    body = await _read_body()
    if not body:
        response.status_code = 400
        return TranscribeResponse(text="", confidence=0, language="zh")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, asr.transcribe, body)
    return TranscribeResponse(**result)


@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest, response: Response):
    """Synthesize text to WAV audio (with retry on empty result)."""
    if tts is None or not tts.ready:
        response.status_code = 503
        return Response(content=b"", media_type="audio/wav")

    max_retries = 2
    for attempt in range(max_retries + 1):
        audio = await tts.synthesize(req.text, req.emotion_instruction, req.voice)
        if audio:
            return Response(content=audio, media_type="audio/wav")
        if attempt < max_retries:
            logger.warning("TTS returned empty, retry %d/%d", attempt + 1, max_retries)
            await asyncio.sleep(0.5)

    response.status_code = 500
    return Response(content=b"", media_type="audio/wav")


@app.post("/cancel")
async def cancel():
    """Cancel current TTS generation."""
    if tts:
        tts.cancel()
    return {"ok": True}


@app.get("/health", response_model=HealthResponse)
async def health():
    """Service health check."""
    # Ensure TTS engine is initialized (lazy)
    if tts is not None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, tts._ensure_loaded)
        if tts.engine_name == "piper":
            await loop.run_in_executor(None, tts.refresh_piper_voices)
        if tts.engine_name == "gpt-sovits":
            await loop.run_in_executor(None, tts.refresh_gpt_sovits_voices)
    piper_voices = []
    gpt_sovits_voices = []
    if tts is not None:
        piper_voices = [
            PiperVoiceResponse(id=v.id, label=v.label, language=v.language)
            for v in tts.piper_voices
        ]
        gpt_sovits_voices = [
            GptSovitsVoiceResponse(id=v.id, label=v.label, language=v.language)
            for v in tts.gpt_sovits_voices
        ]
    return HealthResponse(
        asr_ready=asr is not None and asr.ready,
        tts_ready=tts is not None and tts.ready,
        tts_engine=tts.engine_name if tts else "none",
        tts_model_loaded=tts.model_loaded if tts else False,
        gpu_available=gpu_info.get("has_gpu", False),
        gpu_name=gpu_info.get("gpu_name", ""),
        port=server_port,
        piper_voices=piper_voices,
        gpt_sovits_voices=gpt_sovits_voices,
    )


async def _read_body() -> bytes:
    """Read raw request body."""
    from starlette.requests import Request

    # This is a workaround — FastAPI doesn't easily support raw body in POST
    # We'll use a dependency override in the actual route
    return b""


# --- Override transcribe to read raw body properly ---

from starlette.requests import Request  # noqa: E402


@app.post("/transcribe/raw")
async def transcribe_raw(request: Request, response: Response):
    """Transcribe raw audio bytes from request body."""
    if asr is None or not asr.ready:
        response.status_code = 503
        return {"text": "", "confidence": 0, "language": "zh"}

    body = await request.body()
    if not body:
        response.status_code = 400
        return {"text": "", "confidence": 0, "language": "zh"}

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, asr.transcribe, body)
    return result


# --- Port finding ---

def find_available_port(start: int = 8765, max_tries: int = 10) -> int:
    """Find an available port starting from `start`."""
    for port in range(start, start + max_tries):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"No available port found in range {start}-{start + max_tries}")


# --- Main ---

def main():
    global server_port, forced_tts_engine, extra_voice_model_dirs
    global extra_gpt_sovits_pack_dirs, gpt_sovits_config_paths

    parser = argparse.ArgumentParser(description="Ackem Voice Service")
    parser.add_argument("--port", type=int, default=0, help="Port (0 = auto)")
    parser.add_argument("--model", type=str, default="base", help="Whisper model size")
    parser.add_argument(
        "--tts-engine",
        type=str,
        default=None,
        help="TTS engine: auto | piper | gpt-sovits | local-sapi | edge-tts | cosyvoice",
    )
    parser.add_argument(
        "--voice-models-dir",
        action="append",
        default=[],
        help="Extra Piper voice pack directory (repeatable)",
    )
    parser.add_argument(
        "--gpt-sovits-pack-dir",
        action="append",
        default=[],
        help="Extra GPT-SoVITS voice pack directory (repeatable)",
    )
    parser.add_argument(
        "--gpt-sovits-home-file",
        action="append",
        default=[],
        help="Path to file containing GPT-SoVITS install root (repeatable)",
    )
    args = parser.parse_args()

    if args.tts_engine:
        forced_tts_engine = args.tts_engine
    if args.voice_models_dir:
        extra_voice_model_dirs = args.voice_models_dir
    if args.gpt_sovits_pack_dir:
        extra_gpt_sovits_pack_dirs = args.gpt_sovits_pack_dir
    if args.gpt_sovits_home_file:
        gpt_sovits_config_paths = args.gpt_sovits_home_file

    if args.port:
        server_port = args.port
    else:
        server_port = find_available_port()

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=server_port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
