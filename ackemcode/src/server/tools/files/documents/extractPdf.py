# -*- coding: utf-8 -*-
"""Extract PDF text (+ optional page renders for OCR). Stdout = JSON."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def _pypdf_pages(path: Path) -> tuple[str, list[dict]]:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        pages.append({"n": i, "text": text, "chars": len(text.strip())})
    return "pypdf", pages


def _pymupdf_pages(path: Path) -> tuple[str, list[dict]]:
    import fitz

    doc = fitz.open(str(path))
    pages = []
    for i, page in enumerate(doc, start=1):
        text = page.get_text("text") or ""
        images = page.get_images() or []
        pages.append(
            {
                "n": i,
                "text": text,
                "chars": len(text.strip()),
                "images": len(images),
            }
        )
    return "pymupdf", pages


def _pick_engine(path: Path) -> tuple[str, list[dict]]:
    last_err = None
    for fn in (_pypdf_pages, _pymupdf_pages):
        try:
            engine, pages = fn(path)
            if pages:
                return engine, pages
        except Exception as e:
            last_err = e
    if last_err:
        raise last_err
    raise RuntimeError("no PDF engine produced pages")


def _save_pixmap(pix, dest_jpg: Path, dest_png: Path) -> tuple[Path, str]:
    """PyMuPDF pixmap save APIs differ by version (jpeg_quality vs jpg_quality)."""
    for kwargs in ({"jpeg_quality": 72}, {"jpg_quality": 72}):
        try:
            pix.save(str(dest_jpg), **kwargs)
            return dest_jpg, "image/jpeg"
        except TypeError:
            continue
    try:
        dest_jpg.write_bytes(pix.tobytes("jpeg"))
        return dest_jpg, "image/jpeg"
    except Exception:
        pix.save(str(dest_png))
        return dest_png, "image/png"


def _render_pages(path: Path, nums: list[int], out_dir: Path, dpi: int = 140, jpeg: bool = True) -> list[dict]:
    import fitz

    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(path))
    rendered = []
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    for n in nums:
        if n < 1 or n > doc.page_count:
            continue
        page = doc[n - 1]
        pix = page.get_pixmap(matrix=mat, alpha=False)
        if jpeg:
            dest, mime = _save_pixmap(
                pix,
                out_dir / f"page-{n:04d}.jpg",
                out_dir / f"page-{n:04d}.png",
            )
        else:
            dest = out_dir / f"page-{n:04d}.png"
            pix.save(str(dest))
            mime = "image/png"
        rendered.append(
            {
                "n": n,
                "path": str(dest),
                "w": pix.width,
                "h": pix.height,
                "mime": mime,
            }
        )
    return rendered


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", required=True)
    ap.add_argument("--first", type=int, default=0)
    ap.add_argument("--last", type=int, default=0)
    ap.add_argument("--render-dir", default="")
    ap.add_argument("--render-pages", default="")
    args = ap.parse_args()
    path = Path(args.path)
    if not path.is_file():
        print(json.dumps({"ok": False, "error": f"missing file: {path}"}))
        return 1
    header = path.read_bytes()[:8]
    if not header.startswith(b"%PDF-"):
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "File is not a valid PDF (missing %PDF- header)",
                }
            )
        )
        return 1
    try:
        engine, pages = _pick_engine(path)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}))
        return 1

    for p in pages:
        chars = int(p.get("chars") or 0)
        images = int(p.get("images") or 0)
        p["imageOnly"] = chars < 40 if "images" not in p else chars < 40 and images > 0

    page_count = len(pages)
    if args.first and args.last:
        lo = max(1, args.first)
        hi = min(page_count, args.last)
        pages = [p for p in pages if lo <= int(p["n"]) <= hi]

    rendered: list[dict] = []
    if args.render_dir and args.render_pages:
        nums = [int(x) for x in args.render_pages.split(",") if x.strip().isdigit()]
        try:
            rendered = _render_pages(path, nums, Path(args.render_dir))
        except Exception as e:
            print(
                json.dumps(
                    {
                        "ok": True,
                        "engine": engine,
                "pageCount": page_count,
                        "pages": pages,
                        "rendered": [],
                        "renderError": f"{type(e).__name__}: {e}",
                    }
                )
            )
            return 0

    print(
        json.dumps(
            {
                "ok": True,
                "engine": engine,
                "pageCount": page_count,
                "pages": pages,
                "rendered": rendered,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    os.environ.setdefault("PYTHONUTF8", "1")
    raise SystemExit(main())
