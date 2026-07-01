"""Scan GPT-SoVITS voice packs (manifest.json + ref audio + weight paths)."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GptSovitsVoicePack:
    id: str
    label: str
    language: str
    pack_dir: Path
    gpt_weights: Path
    sovits_weights: Path
    ref_audio: Path
    ref_text: str
    prompt_lang: str = "zh"
    version: str = "v2Pro"


def _read_manifest(pack_dir: Path) -> GptSovitsVoicePack | None:
    manifest_path = pack_dir / "manifest.json"
    if not manifest_path.is_file():
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        logger.warning("Invalid manifest %s: %s", manifest_path, e)
        return None

    pack_id = str(data.get("id") or pack_dir.name)
    label = str(data.get("label") or pack_id)
    language = str(data.get("language") or "zh")

    def resolve_path(key: str, fallback_name: str | None = None) -> Path | None:
        raw = data.get(key)
        if raw:
            p = Path(str(raw))
            if not p.is_absolute():
                p = pack_dir / p
            return p
        if fallback_name:
            p = pack_dir / fallback_name
            if p.is_file():
                return p
        return None

    gpt = resolve_path("gpt_weights")
    sovits = resolve_path("sovits_weights")
    ref = resolve_path("ref_audio", "ref.mp3")
    if ref is None:
        ref = resolve_path("ref_audio", "ref.wav")

    ref_text = str(data.get("ref_text") or data.get("prompt_text") or "").strip()
    if not gpt or not gpt.is_file():
        logger.warning("Voice pack %s missing gpt_weights", pack_id)
        return None
    if not sovits or not sovits.is_file():
        logger.warning("Voice pack %s missing sovits_weights", pack_id)
        return None
    if not ref or not ref.is_file():
        logger.warning("Voice pack %s missing ref_audio", pack_id)
        return None
    if not ref_text:
        logger.warning("Voice pack %s missing ref_text", pack_id)
        return None

    return GptSovitsVoicePack(
        id=pack_id,
        label=label,
        language=language,
        pack_dir=pack_dir,
        gpt_weights=gpt.resolve(),
        sovits_weights=sovits.resolve(),
        ref_audio=ref.resolve(),
        ref_text=ref_text,
        prompt_lang=str(data.get("prompt_lang") or "zh"),
        version=str(data.get("version") or "v2Pro"),
    )


def scan_gpt_sovits_voice_packs(dirs: list[Path]) -> list[GptSovitsVoicePack]:
    packs: list[GptSovitsVoicePack] = []
    seen: set[str] = set()
    for root in dirs:
        if not root.is_dir():
            continue
        for child in sorted(root.iterdir()):
            if not child.is_dir():
                continue
            pack = _read_manifest(child)
            if pack and pack.id not in seen:
                packs.append(pack)
                seen.add(pack.id)
    return packs
