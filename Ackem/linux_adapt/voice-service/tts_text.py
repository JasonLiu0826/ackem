"""Normalize text before TTS (繁→简, whitespace)."""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

_opencc = None


def _get_opencc():
    global _opencc
    if _opencc is None:
        try:
            from opencc import OpenCC

            _opencc = OpenCC("t2s")
        except ImportError:
            logger.warning("opencc not installed — pip install opencc-python-reimplemented")
            _opencc = False
    return _opencc if _opencc is not False else None


def normalize_tts_text(text: str) -> str:
    """Convert traditional→simplified and collapse whitespace for speech."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return ""

    converter = _get_opencc()
    if converter is None:
        return cleaned

    try:
        return converter.convert(cleaned)
    except Exception as e:
        logger.warning("OpenCC t2s failed: %s", e)
        return cleaned
