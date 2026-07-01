"""Scan directories for Piper ONNX voice packs (*.onnx + *.onnx.json)."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PiperVoiceInfo:
    id: str
    label: str
    language: str
    model_path: str
    config_path: str


def _label_from_config(config_path: Path, model_id: str) -> tuple[str, str]:
    language = ""
    label = model_id
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
        language = str(data.get("language", {}).get("code", "") or "")
        name = data.get("dataset", "") or data.get("voice", "") or model_id
        label = str(name).replace("_", " ")
    except Exception as e:
        logger.debug("Could not read piper config %s: %s", config_path, e)
    return label, language


def scan_piper_voices(dirs: list[Path]) -> list[PiperVoiceInfo]:
    """Find Piper models in each directory (non-recursive and one level deep)."""
    found: dict[str, PiperVoiceInfo] = {}

    for root in dirs:
        if not root.is_dir():
            continue
        candidates: list[Path] = [root, *root.iterdir()] if root.is_dir() else [root]
        for base in candidates:
            if not base.is_dir():
                continue
            for onnx in sorted(base.glob("*.onnx")):
                config = onnx.with_suffix(onnx.suffix + ".json")
                if not config.is_file():
                    config = Path(str(onnx) + ".json")
                if not config.is_file():
                    logger.debug("Skip piper model without json: %s", onnx)
                    continue
                model_id = onnx.stem
                if model_id in found:
                    continue
                label, language = _label_from_config(config, model_id)
                found[model_id] = PiperVoiceInfo(
                    id=model_id,
                    label=label,
                    language=language,
                    model_path=str(onnx.resolve()),
                    config_path=str(config.resolve()),
                )

    voices = sorted(found.values(), key=lambda v: v.id.lower())
    if voices:
        logger.info("Piper voices found: %s", ", ".join(v.id for v in voices))
    return voices
