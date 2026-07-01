"""GPU detection and TTS engine selection."""

import logging
import sys

logger = logging.getLogger(__name__)


def _cpu_default_engine() -> str:
    """Online neural edge-tts when possible; offline fallback at synthesize time."""
    return "edge-tts"


def detect_gpu() -> dict:
    """Detect CUDA availability and return engine recommendation."""
    try:
        import torch

        has_gpu = torch.cuda.is_available()
        gpu_name = torch.cuda.get_device_name(0) if has_gpu else ""
        recommended = "cosyvoice" if has_gpu else _cpu_default_engine()
        logger.info(
            "GPU detection: has_gpu=%s, gpu=%s, engine=%s",
            has_gpu,
            gpu_name,
            recommended,
        )
        return {
            "has_gpu": has_gpu,
            "gpu_name": gpu_name,
            "recommended_engine": recommended,
        }
    except ImportError:
        fallback = _cpu_default_engine()
        logger.warning("PyTorch not installed, falling back to %s", fallback)
        return {
            "has_gpu": False,
            "gpu_name": "",
            "recommended_engine": fallback,
        }
