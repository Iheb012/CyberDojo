#!/usr/bin/env python3
"""Prepare the game art from the original PNG files.

Maps are converted to WebP (quality 90); sprites are pixel art, so they are
copied as PNG without re-encoding. Sources live in art-src/ (never served).
See art-src/README.md for the expected names.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: python -m pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "art-src"
MAPS_DIR = ROOT / "public" / "game" / "maps"
SPRITES_DIR = ROOT / "public" / "game" / "sprites"
QUALITY = 90


def human_size(size: int) -> str:
    if size >= 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    return f"{size / 1024:.0f} kB"


def main() -> int:
    pngs = sorted(SRC_DIR.glob("*.png"))
    if not pngs:
        sys.exit(f"No PNG found in {SRC_DIR}. Add the original art first.")

    MAPS_DIR.mkdir(parents=True, exist_ok=True)
    SPRITES_DIR.mkdir(parents=True, exist_ok=True)

    for png in pngs:
        if png.name.startswith("character_"):
            target = SPRITES_DIR / png.name
            shutil.copyfile(png, target)
            print(
                f"{png.name} -> {target.relative_to(ROOT)} "
                f"(copied, {human_size(target.stat().st_size)})"
            )
            continue

        target = MAPS_DIR / f"{png.stem}.webp"
        with Image.open(png) as image:
            has_alpha = image.mode in ("RGBA", "LA") or (
                image.mode == "P" and "transparency" in image.info
            )
            image = image.convert("RGBA" if has_alpha else "RGB")
            image.save(target, "WEBP", quality=QUALITY, method=6)
            width, height = image.size

        print(
            f"{png.name} -> {target.relative_to(ROOT)} "
            f"({width}x{height}, "
            f"{human_size(png.stat().st_size)} -> {human_size(target.stat().st_size)})"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
