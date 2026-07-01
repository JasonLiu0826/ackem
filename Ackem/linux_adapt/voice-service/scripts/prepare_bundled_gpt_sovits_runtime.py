"""Copy GPT-SoVITS portable into voice-service/gpt-sovits-runtime for release builds.

Dev can use a directory junction instead (see BUNDLED.md).

Usage:
  python scripts/prepare_bundled_gpt_sovits_runtime.py --from C:\\path\\to\\GPT-SoVITS-v2pro-20250604
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

VOICE_SERVICE = Path(__file__).resolve().parent.parent
RUNTIME_DIR = VOICE_SERVICE / "gpt-sovits-runtime"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--from", dest="src", type=Path, required=True)
    args = p.parse_args()
    src = args.src.resolve()
    if not (src / "api_v2.py").is_file():
        raise SystemExit(f"Not a GPT-SoVITS folder: {src}")

    if RUNTIME_DIR.exists():
        if RUNTIME_DIR.is_symlink() or _is_junction(RUNTIME_DIR):
            RUNTIME_DIR.unlink()
        else:
            shutil.rmtree(RUNTIME_DIR)

    print(f"Copying {src} -> {RUNTIME_DIR} (this may take several minutes)...")
    shutil.copytree(
        src,
        RUNTIME_DIR,
        ignore=shutil.ignore_patterns("TEMP", "logs", "raw", "__pycache__", "*.pyc"),
    )
    print("Done. Run electron-builder to ship Ackem with built-in voice.")


def _is_junction(path: Path) -> bool:
    try:
        import stat

        return path.is_dir() and bool(path.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except Exception:
        return False


if __name__ == "__main__":
    main()
