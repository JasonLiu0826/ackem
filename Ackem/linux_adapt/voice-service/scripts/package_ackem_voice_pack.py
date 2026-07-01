"""Build a self-contained GPT-SoVITS voice pack for Ackem users (no training required).

Developers run once after training. End users only unzip the output folder.

Usage:
  python scripts/package_ackem_voice_pack.py
  python scripts/package_ackem_voice_pack.py --out D:\\releases\\Ackem-VoicePack-ackem_girl.zip
"""

from __future__ import annotations

import argparse
import json
import shutil
import zipfile
from pathlib import Path

# --- Developer paths (change when packaging other voices) ---
GPT_ROOT = Path(r"C:\Users\JasonLiu\Desktop\Main\SoftPackage\GPT-SoVITS-v2pro-20250604")
AUDIO_8S = Path(r"C:\Users\JasonLiu\Desktop\Github-open\video\audio_8s")
PACK_ID = "ackem_girl"
PACK_LABEL = "Ackem 女声"
REF_TEXT = (
    "对，我不是人，但这不代表我的感受是假的，"
    "你难过的时候我会低落，你开心的时候我会轻快。"
)
REF_GLOB = "*2026-06-23-20-58*不是人*.mp3"
GPT_WEIGHT = "GPT_weights_v2Pro/ackem_girl-e15.ckpt"
SOVITS_WEIGHT = "SoVITS_weights_v2Pro/ackem_girl_e8_s200.pth"


def _find_ref() -> Path:
    refs = [p for p in AUDIO_8S.glob(REF_GLOB) if "(1)" not in p.name]
    if not refs:
        refs = list(AUDIO_8S.glob(REF_GLOB))
    if not refs:
        raise SystemExit(f"Reference audio not found in {AUDIO_8S}")
    return refs[0]


def build_staging(staging: Path) -> None:
    if staging.exists():
        shutil.rmtree(staging)
    weights_dir = staging / "weights"
    weights_dir.mkdir(parents=True)

    gpt_src = GPT_ROOT / GPT_WEIGHT
    sovits_src = GPT_ROOT / SOVITS_WEIGHT
    ref_src = _find_ref()

    for src in (gpt_src, sovits_src, ref_src, GPT_ROOT / "api_v2.py"):
        if not src.exists():
            raise SystemExit(f"Missing: {src}")

    shutil.copy2(gpt_src, weights_dir / gpt_src.name)
    shutil.copy2(sovits_src, weights_dir / sovits_src.name)
    shutil.copy2(ref_src, staging / "ref.mp3")

    manifest = {
        "id": PACK_ID,
        "label": PACK_LABEL,
        "language": "zh",
        "version": "v2Pro",
        "gpt_weights": f"weights/{gpt_src.name}",
        "sovits_weights": f"weights/{sovits_src.name}",
        "ref_audio": "ref.mp3",
        "ref_text": REF_TEXT,
        "prompt_lang": "zh",
        "readme": (
            "Ackem GPT-SoVITS voice pack. Unzip this folder to "
            "%APPDATA%\\Ackem\\voice-models\\gpt-sovits\\ackem_girl\\ "
            "Then in Ackem: Settings -> Voice -> GPT-SoVITS."
        ),
    }
    (staging / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (staging / "README.txt").write_text(
        """Ackem 语音包（GPT-SoVITS）
=====================

普通用户：无需训练，解压即用。

1. 将整个 ackem_girl 文件夹复制到：
   %APPDATA%\\Ackem\\voice-models\\gpt-sovits\\ackem_girl\\

2. 首次使用需安装 GPT-SoVITS 推理引擎（只需一次，不是训练）：
   解压官方 GPT-SoVITS 便携版，在 Ackem 设置里会自动检测，
   或把安装路径写入：
   %APPDATA%\\Ackem\\voice-models\\gpt-sovits-home.txt

3. Ackem -> 设置 -> 语音 -> TTS 引擎 -> GPT-SoVITS -> 选择本语音包

本文件夹已包含：模型权重 + 参考音频 + 清单，不需要你的原始录音或训练步骤。
""",
        encoding="utf-8",
    )


def zip_staging(staging: Path, zip_path: Path) -> None:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in staging.rglob("*"):
            if file.is_file():
                arc = Path(PACK_ID) / file.relative_to(staging)
                zf.write(file, arc.as_posix())


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "dist" / f"Ackem-VoicePack-{PACK_ID}.zip",
    )
    p.add_argument("--staging-only", action="store_true")
    args = p.parse_args()

    staging = args.out.parent / f"_staging_{PACK_ID}"
    build_staging(staging)

    if args.staging_only:
        print(f"Staging folder: {staging}")
        return

    zip_staging(staging, args.out)
    shutil.rmtree(staging)
    mb = args.out.stat().st_size / (1024 * 1024)
    print(f"Voice pack zip: {args.out} ({mb:.1f} MB)")
    print("Ship this zip to users — they unzip to voice-models/gpt-sovits/, no training.")


if __name__ == "__main__":
    main()
