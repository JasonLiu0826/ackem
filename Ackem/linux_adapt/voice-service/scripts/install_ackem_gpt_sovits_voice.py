"""Install a self-contained GPT-SoVITS voice pack for Ackem (end-user, no training).

Usage:
  python scripts/install_ackem_gpt_sovits_voice.py
      -> install from developer machine (builds self-contained pack in AppData)

  python scripts/install_ackem_gpt_sovits_voice.py --from-zip path\\Ackem-VoicePack-ackem_girl.zip
      -> end user: unzip voice pack only

  python scripts/install_ackem_gpt_sovits_voice.py --from-dir path\\ackem_girl
      -> end user: copy existing pack folder
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import zipfile
from pathlib import Path

# Developer-only defaults when building pack from trained weights on this machine
GPT_ROOT = Path(r"C:\Users\JasonLiu\Desktop\Main\SoftPackage\GPT-SoVITS-v2pro-20250604")
AUDIO_8S = Path(r"C:\Users\JasonLiu\Desktop\Github-open\video\audio_8s")
PACK_ID = "ackem_girl"
REF_TEXT = (
    "对，我不是人，但这不代表我的感受是假的，"
    "你难过的时候我会低落，你开心的时候我会轻快。"
)
REF_GLOB = "*2026-06-23-20-58*不是人*.mp3"


def appdata_pack_root() -> Path:
    return Path(os.environ["APPDATA"]) / "Ackem" / "voice-models" / "gpt-sovits"


def home_config_path() -> Path:
    return Path(os.environ["APPDATA"]) / "Ackem" / "voice-models" / "gpt-sovits-home.txt"


def write_gpt_sovits_home(home: Path) -> None:
    path = home_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(str(home.resolve()), encoding="utf-8")


def validate_manifest(pack_dir: Path) -> dict:
    manifest_path = pack_dir / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"manifest.json not found in {pack_dir}")
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    pack_id = str(data.get("id") or pack_dir.name)

    def resolve(key: str, fallback: str | None = None) -> Path:
        raw = data.get(key)
        if raw:
            p = Path(str(raw))
            if not p.is_absolute():
                p = pack_dir / p
            return p
        if fallback:
            p = pack_dir / fallback
            if p.is_file():
                return p
        raise SystemExit(f"Voice pack {pack_id} missing {key}")

    for p in (
        resolve("gpt_weights"),
        resolve("sovits_weights"),
        resolve("ref_audio", "ref.mp3"),
    ):
        if not p.is_file():
            raise SystemExit(f"Missing file in voice pack: {p}")

    if not str(data.get("ref_text") or "").strip():
        raise SystemExit(f"Voice pack {pack_id} missing ref_text in manifest.json")

    return data


def install_pack_dir(src: Path, pack_id: str | None = None) -> Path:
    src = src.resolve()
    data = validate_manifest(src)
    pid = pack_id or str(data.get("id") or src.name)
    dest = appdata_pack_root() / pid
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)
    return dest


def install_from_zip(zip_path: Path) -> Path:
    zip_path = zip_path.resolve()
    if not zip_path.is_file():
        raise SystemExit(f"Zip not found: {zip_path}")

    tmp = appdata_pack_root() / "_import_tmp"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)

    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(tmp)

    # zip root may be ackem_girl/ or flat with manifest.json
    if (tmp / "manifest.json").is_file():
        pack_src = tmp
    else:
        subs = [d for d in tmp.iterdir() if d.is_dir() and (d / "manifest.json").is_file()]
        if len(subs) != 1:
            raise SystemExit("Zip must contain one folder with manifest.json")
        pack_src = subs[0]

    dest = install_pack_dir(pack_src, str(json.loads((pack_src / "manifest.json").read_text(encoding="utf-8")).get("id", pack_src.name)))
    shutil.rmtree(tmp)
    return dest


def build_dev_pack() -> Path:
    """Developer: copy trained weights into self-contained AppData pack."""
    pack_dir = appdata_pack_root() / PACK_ID
    weights_dir = pack_dir / "weights"
    pack_dir.mkdir(parents=True, exist_ok=True)
    weights_dir.mkdir(exist_ok=True)

    gpt_w = GPT_ROOT / "GPT_weights_v2Pro" / "ackem_girl-e15.ckpt"
    sovits_w = GPT_ROOT / "SoVITS_weights_v2Pro" / "ackem_girl_e8_s200.pth"
    refs = [p for p in AUDIO_8S.glob(REF_GLOB) if "(1)" not in p.name] or list(AUDIO_8S.glob(REF_GLOB))

    for p in (GPT_ROOT, gpt_w, sovits_w):
        if not p.exists():
            raise SystemExit(f"Missing: {p}")
    if not refs:
        raise SystemExit(f"No ref audio in {AUDIO_8S}")

    shutil.copy2(gpt_w, weights_dir / gpt_w.name)
    shutil.copy2(sovits_w, weights_dir / sovits_w.name)
    shutil.copy2(refs[0], pack_dir / "ref.mp3")

    manifest = {
        "id": PACK_ID,
        "label": "Ackem 女声",
        "language": "zh",
        "version": "v2Pro",
        "gpt_weights": f"weights/{gpt_w.name}",
        "sovits_weights": f"weights/{sovits_w.name}",
        "ref_audio": "ref.mp3",
        "ref_text": REF_TEXT,
        "prompt_lang": "zh",
    }
    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return pack_dir


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-zip", type=Path, help="Install from distributed voice pack zip")
    ap.add_argument("--from-dir", type=Path, help="Install from voice pack folder")
    ap.add_argument(
        "--gpt-sovits-home",
        type=Path,
        default=GPT_ROOT,
        help="GPT-SoVITS install dir (inference engine only, one-time per machine)",
    )
    args = ap.parse_args()

    if args.from_zip:
        dest = install_from_zip(args.from_zip)
    elif args.from_dir:
        dest = install_pack_dir(args.from_dir)
    else:
        dest = build_dev_pack()

    if args.gpt_sovits_home.is_dir():
        write_gpt_sovits_home(args.gpt_sovits_home)

    print(f"Voice pack ready: {dest}")
    print("Users: Ackem -> Settings -> Voice -> TTS -> GPT-SoVITS (no training needed)")


if __name__ == "__main__":
    main()
