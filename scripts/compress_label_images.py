#!/usr/bin/env python3
"""Compress cover label images for homepage tiles (keep originals for page background)."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
MAX_BYTES = 100 * 1024
LABEL_COUNT = 4
MAX_WIDTHS = (1280, 1024, 896, 768, 640)


def encode_jpeg(image: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    rgb = image.convert("RGB")
    rgb.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def compress_image(source: Path, dest: Path) -> tuple[int, int, int]:
    with Image.open(source) as img:
        base = img.convert("RGB")
        width, height = base.size

        for max_width in MAX_WIDTHS:
            if width > max_width:
                scaled_height = round(height * max_width / width)
                working = base.resize((max_width, scaled_height), Image.Resampling.LANCZOS)
            else:
                working = base

            low, high = 40, 95
            best: bytes | None = None
            best_quality = low

            while low <= high:
                quality = (low + high) // 2
                data = encode_jpeg(working, quality)
                if len(data) <= MAX_BYTES:
                    best = data
                    best_quality = quality
                    low = quality + 1
                else:
                    high = quality - 1

            if best is not None:
                dest.write_bytes(best)
                return working.size[0], working.size[1], best_quality

        # Last resort: smallest width + minimum quality
        max_width = MAX_WIDTHS[-1]
        scaled_height = round(height * max_width / width)
        working = base.resize((max_width, scaled_height), Image.Resampling.LANCZOS)
        data = encode_jpeg(working, 40)
        dest.write_bytes(data)
        return working.size[0], working.size[1], 40


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    for index in range(1, LABEL_COUNT + 1):
        source = ASSETS / f"label{index}.png"
        dest = ASSETS / f"label{index}-thumb.jpg"
        if not source.exists():
            print(f"skip missing source: {source.name}")
            continue

        out_w, out_h, quality = compress_image(source, dest)
        size_kb = dest.stat().st_size / 1024
        status = "ok" if dest.stat().st_size <= MAX_BYTES else "warn"
        print(
            f"[{status}] {source.name} -> {dest.name} "
            f"({out_w}x{out_h}, q={quality}, {size_kb:.1f} KB)"
        )


if __name__ == "__main__":
    main()
