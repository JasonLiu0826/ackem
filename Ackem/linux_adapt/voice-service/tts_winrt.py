"""Windows WinRT offline TTS (system voices, better than legacy SAPI5)."""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


def _score_voice(language: str, display_name: str) -> int:
    lang = language.lower()
    name = display_name.lower()
    if not lang.startswith("zh-cn"):
        return -1
    if "taiwan" in name or "traditional" in name or "hong kong" in name or "cantonese" in name:
        return -1
    score = 0
    if "xiaoxiao" in name:
        score += 120
    if "xiaoyi" in name:
        score += 110
    if "yaoyao" in name:
        score += 100
    if "yunxi" in name:
        score += 90
    if "neural" in name or "natural" in name:
        score += 50
    if "kangkang" in name:
        score += 60
    if "huihui" in name:
        score += 40
    return score


def _pick_voice(all_voices):
    best = None
    best_score = -1
    for voice in all_voices:
        score = _score_voice(voice.language, voice.display_name or "")
        if score > best_score:
            best_score = score
            best = voice
    return best


async def synthesize_winrt(text: str) -> bytes:
    """Synthesize via Windows.Media.SpeechSynthesis (offline system voices)."""
    try:
        from winrt.windows.media.speechsynthesis import SpeechSynthesizer
        from winrt.windows.storage.streams import DataReader
    except ImportError:
        logger.debug("WinRT speech packages not installed")
        return b""

    try:
        synth = SpeechSynthesizer()
        picked = _pick_voice(SpeechSynthesizer.all_voices)
        if picked is not None:
            synth.voice = picked
            logger.debug("WinRT voice: %s", picked.display_name)

        stream = await synth.synthesize_text_to_stream_async(text)
        size = int(stream.size)
        if size <= 0:
            return b""

        reader = DataReader(stream)
        await reader.load_async(size)
        buf = bytearray(size)
        reader.read_bytes(buf)
        return bytes(buf)
    except Exception as e:
        logger.warning("WinRT TTS failed: %s", e)
        return b""


def synthesize_winrt_sync(text: str) -> bytes:
    """Run WinRT synthesis from sync context (used in thread pool)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(lambda: asyncio.run(synthesize_winrt(text))).result()
        return loop.run_until_complete(synthesize_winrt(text))
    except RuntimeError:
        return asyncio.run(synthesize_winrt(text))
